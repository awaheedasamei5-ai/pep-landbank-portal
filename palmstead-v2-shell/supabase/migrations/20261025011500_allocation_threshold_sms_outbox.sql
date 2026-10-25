create schema if not exists app_allocation_private;
revoke all on schema app_allocation_private from public, anon, authenticated;

create table if not exists public.allocation_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  allocation_request_id uuid not null unique
    references public.allocation_requests(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  recipient_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'blocked', 'failed', 'needs_review')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_reference text,
  provider_status jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.allocation_sms_outbox enable row level security;
revoke all on public.allocation_sms_outbox from public, anon, authenticated;
grant all on public.allocation_sms_outbox to service_role;
create index if not exists allocation_sms_outbox_claim_idx
  on public.allocation_sms_outbox(status, next_attempt_at, created_at)
  where status in ('pending', 'processing');

create or replace function app_allocation_private.enqueue_request_for_lead(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_lead public.leads%rowtype;
  v_threshold numeric;
  v_percent integer;
  v_request_id uuid;
  v_agent_name text;
  v_body text;
begin
  if p_lead_id is null then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_lead_id::text, 0));

  select l.* into v_lead
  from public.leads l
  where l.id = p_lead_id and l.deleted_at is null
  for update;
  if not found
    or v_lead.agent_key is null
    or v_lead.agent_key = 'company'
    or coalesce(v_lead.grand_total, 0) <= 0
  then
    return null;
  end if;

  select coalesce(c.allocation_threshold_pct, 30)
  into v_threshold
  from public.app_config c
  limit 1;
  v_threshold := coalesce(v_threshold, 30);

  if coalesce(v_lead.amt_paid, 0) / v_lead.grand_total * 100 < v_threshold then
    return null;
  end if;
  if exists (
    select 1 from public.allocation_requests ar
    where ar.lead_id = v_lead.id
  ) then
    return null;
  end if;

  v_percent := pg_catalog.round(coalesce(v_lead.amt_paid, 0) / v_lead.grand_total * 100)::integer;
  select p.name into v_agent_name
  from public.profiles p
  where p.agent_key = v_lead.agent_key
  limit 1;
  v_agent_name := coalesce(v_agent_name, v_lead.agent_key);
  v_request_id := pg_catalog.gen_random_uuid();
  v_body := v_lead.name || ' has reached ' || v_percent::text
    || '% paid and is due for plot allocation. Review the request in Palmstead Allocations.';

  insert into public.allocation_requests (
    id, lead_id, client_name, agent_key, agent_name, percent_paid,
    grand_total, amt_paid, status, note, flag_reason, flagged_by, flagged_at
  ) values (
    v_request_id, v_lead.id, v_lead.name, v_lead.agent_key, v_agent_name, v_percent,
    v_lead.grand_total, coalesce(v_lead.amt_paid, 0), 'Pending',
    'Auto-flagged after the approved-payment total crossed ' || v_threshold::text
      || '% (now ' || v_percent::text || '%).',
    'Payment threshold reached', 'system', pg_catalog.now()
  );

  insert into public.messages (
    sender_key, sender_name, recipient_key, body, kind, ref_type, ref_id
  )
  select 'system', 'Palmstead System', p.agent_key, v_body,
    'allocation_pending', 'allocation_request', v_request_id
  from public.profiles p
  where p.active is true
    and (p.role = 'manager' or p.agent_key = v_lead.agent_key);

  insert into public.allocation_sms_outbox(allocation_request_id, lead_id, recipient_key)
  values (v_request_id, v_lead.id, v_lead.agent_key)
  on conflict (allocation_request_id) do nothing;

  return v_request_id;
end;
$$;

revoke all on function app_allocation_private.enqueue_request_for_lead(uuid) from public, anon, authenticated;

create or replace function app_allocation_private.on_lead_payment_threshold_change()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform app_allocation_private.enqueue_request_for_lead(new.id);
  return new;
end;
$$;

revoke all on function app_allocation_private.on_lead_payment_threshold_change() from public, anon, authenticated;
drop trigger if exists leads_enqueue_allocation_request_on_change on public.leads;
create trigger leads_enqueue_allocation_request_on_change
after insert or update on public.leads
for each row execute function app_allocation_private.on_lead_payment_threshold_change();

create or replace function public.flag_leads_due_for_allocation()
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_lead_id uuid;
begin
  for v_lead_id in
    select l.id
    from public.leads l
    where l.deleted_at is null
      and l.agent_key is not null
      and l.agent_key <> 'company'
      and coalesce(l.grand_total, 0) > 0
      and coalesce(l.amt_paid, 0) / l.grand_total * 100 >= coalesce(
        (select c.allocation_threshold_pct from public.app_config c limit 1), 30
      )
      and not exists (
        select 1 from public.allocation_requests ar where ar.lead_id = l.id
      )
  loop
    perform app_allocation_private.enqueue_request_for_lead(v_lead_id);
  end loop;
end;
$$;

revoke all on function public.flag_leads_due_for_allocation() from public, anon, authenticated;
grant execute on function public.flag_leads_due_for_allocation() to service_role;

create or replace function public.claim_allocation_sms_outbox(p_limit integer default 10)
returns setof public.allocation_sms_outbox
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  update public.allocation_sms_outbox
  set status = 'pending', claimed_at = null, updated_at = pg_catalog.now()
  where status = 'processing'
    and claimed_at < pg_catalog.now() - interval '15 minutes';

  return query
  with candidates as (
    select o.id
    from public.allocation_sms_outbox o
    where o.status = 'pending'
      and o.next_attempt_at <= pg_catalog.now()
    order by o.next_attempt_at, o.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  )
  update public.allocation_sms_outbox o
  set status = 'processing',
      attempt_count = o.attempt_count + 1,
      claimed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  from candidates
  where o.id = candidates.id
  returning o.*;
end;
$$;

revoke all on function public.claim_allocation_sms_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_allocation_sms_outbox(integer) to service_role;

create or replace function public.verify_allocation_sms_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select p_token is not null
    and p_token = (
      select s.decrypted_secret
      from vault.decrypted_secrets s
      where s.name = 'finance_monthly_reminder_worker_token'
      limit 1
    )
$$;

revoke all on function public.verify_allocation_sms_worker_token(text) from public, anon, authenticated;
grant execute on function public.verify_allocation_sms_worker_token(text) to service_role;

create or replace function public.dispatch_allocation_sms_outbox()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  select s.decrypted_secret into v_token
  from vault.decrypted_secrets s
  where s.name = 'finance_monthly_reminder_worker_token'
  limit 1;
  if v_token is null then
    raise exception 'Allocation SMS worker token is not configured.';
  end if;

  perform net.http_post(
    url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/process-allocation-sms',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_token
    ),
    body := pg_catalog.jsonb_build_object('source', 'allocation_sms_outbox_cron'),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.dispatch_allocation_sms_outbox() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select j.jobid into v_job_id from cron.job j where j.jobname = 'allocation-sms-outbox-worker' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule('allocation-sms-outbox-worker', '* * * * *', 'select public.dispatch_allocation_sms_outbox();');
end;
$$;
