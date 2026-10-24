-- Queue a receipt thank-you only for approvals made after this migration.
-- The transaction creates the durable receipt token and idempotent outbox
-- event together; a server worker renders/uploads the PDF and sends the SMS.

create table if not exists public.finance_receipt_sms_settings (
  singleton boolean primary key default true check (singleton),
  thank_you_sms_enabled boolean not null default true,
  enabled_after timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);

insert into public.finance_receipt_sms_settings(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.finance_receipt_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  share_link_id uuid not null references public.receipt_share_links(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued','sending','accepted','failed','needs_review','blocked','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  provider_accepted_at timestamptz,
  provider_reference text,
  last_error text,
  provider_status jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_receipt_sms_settings enable row level security;
alter table public.finance_receipt_sms_outbox enable row level security;
revoke all on public.finance_receipt_sms_settings, public.finance_receipt_sms_outbox from public, anon, authenticated;
grant select, update on public.finance_receipt_sms_settings to authenticated;
grant select on public.finance_receipt_sms_outbox to authenticated;
grant all on public.finance_receipt_sms_settings, public.finance_receipt_sms_outbox to service_role;

drop policy if exists finance_receipt_sms_settings_manager_read on public.finance_receipt_sms_settings;
create policy finance_receipt_sms_settings_manager_read on public.finance_receipt_sms_settings
  for select to authenticated using (public.my_role() = 'manager');
drop policy if exists finance_receipt_sms_settings_manager_update on public.finance_receipt_sms_settings;
create policy finance_receipt_sms_settings_manager_update on public.finance_receipt_sms_settings
  for update to authenticated using (public.my_role() = 'manager') with check (public.my_role() = 'manager');
drop policy if exists finance_receipt_sms_outbox_manager_read on public.finance_receipt_sms_outbox;
create policy finance_receipt_sms_outbox_manager_read on public.finance_receipt_sms_outbox
  for select to authenticated using (public.my_role() = 'manager');

create index if not exists finance_receipt_sms_outbox_claim_idx
  on public.finance_receipt_sms_outbox(next_attempt_at, created_at)
  where status = 'queued';

create or replace function public.enqueue_finance_receipt_thank_you()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_receipt_number text;
  v_share_link_id uuid;
  v_sms_enabled boolean;
begin
  if new.status <> 'approved'
    or (tg_op = 'UPDATE' and old.status = 'approved') then
    return new;
  end if;

  -- Some non-pipeline payment rows are allowed by the legacy schema. They
  -- remain valid ledger entries, but have no client receipt recipient.
  if new.lead_id is null then
    return new;
  end if;

  select thank_you_sms_enabled into v_sms_enabled
  from public.finance_receipt_sms_settings where singleton;
  if not coalesce(v_sms_enabled, false) then
    return new;
  end if;

  if new.receipt_number is null then
    v_receipt_number := 'RCT-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
    update public.payments set receipt_number = v_receipt_number where id = new.id;
  end if;

  -- Keep automation's immutable PDF path separate from previously-issued
  -- manual receipt links for the same payment.
  insert into public.receipt_share_links(payment_id, storage_path, created_by)
  values (new.id, new.id::text || '/receipt-' || coalesce(new.receipt_number, v_receipt_number) || '.pdf', 'finance-automation')
  returning id into v_share_link_id;

  insert into public.finance_receipt_sms_outbox(payment_id, lead_id, share_link_id, idempotency_key)
  values (new.id, new.lead_id, v_share_link_id, new.id::text || ':payment_thanks')
  on conflict (payment_id) do nothing;

  return new;
end;
$$;

drop trigger if exists payments_enqueue_finance_receipt_thank_you on public.payments;
create trigger payments_enqueue_finance_receipt_thank_you
  after insert or update of status on public.payments
  for each row execute function public.enqueue_finance_receipt_thank_you();

create or replace function public.claim_finance_receipt_sms_outbox(p_limit integer default 10)
returns setof public.finance_receipt_sms_outbox
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  update public.finance_receipt_sms_outbox
  set status = 'needs_review',
      last_error = 'Worker stopped after claiming the SMS. Check provider history before retrying.',
      lease_until = null,
      updated_at = now()
  where status = 'sending' and lease_until < now();

  return query
  with candidates as (
    select outbox.id
    from public.finance_receipt_sms_outbox outbox
    join public.payments payment on payment.id = outbox.payment_id and payment.status = 'approved'
    join public.leads lead on lead.id = outbox.lead_id and lead.deleted_at is null
    join public.receipt_share_links link on link.id = outbox.share_link_id and link.payment_id = payment.id
    where outbox.status = 'queued' and outbox.next_attempt_at <= now()
    order by outbox.next_attempt_at, outbox.created_at
    for update of outbox skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  )
  update public.finance_receipt_sms_outbox outbox
  set status = 'sending', attempt_count = outbox.attempt_count + 1,
      lease_until = now() + interval '5 minutes', updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.verify_finance_receipt_sms_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select p_token is not null
    and p_token = (select decrypted_secret from vault.decrypted_secrets where name = 'finance_receipt_sms_worker_token' limit 1)
$$;

create or replace function public.dispatch_finance_receipt_sms()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
set row_security = off
as $$
declare v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'finance_receipt_sms_worker_token'
  limit 1;
  if v_token is null then raise exception 'Finance receipt SMS worker token is not configured.'; end if;
  perform net.http_post(
    url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/process-finance-receipt-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_token),
    body := jsonb_build_object('source', 'finance_payment_approval')
  );
end;
$$;

revoke all on function public.enqueue_finance_receipt_thank_you() from public, anon, authenticated;
revoke all on function public.claim_finance_receipt_sms_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_finance_receipt_sms_outbox(integer) to service_role;
revoke all on function public.verify_finance_receipt_sms_worker_token(text) from public, anon, authenticated;
grant execute on function public.verify_finance_receipt_sms_worker_token(text) to service_role;
revoke all on function public.dispatch_finance_receipt_sms() from public, anon, authenticated;

do $$
declare v_job_id bigint;
begin
  if not exists (select 1 from vault.secrets where name = 'finance_receipt_sms_worker_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'finance_receipt_sms_worker_token', 'Internal token for the Finance receipt SMS worker');
  end if;
  select jobid into v_job_id from cron.job where jobname = 'finance-receipt-thank-you-sms' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('finance-receipt-thank-you-sms', '* * * * *', 'select public.dispatch_finance_receipt_sms();');
end;
$$;

