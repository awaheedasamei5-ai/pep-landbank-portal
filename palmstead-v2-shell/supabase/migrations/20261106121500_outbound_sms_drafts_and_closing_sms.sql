-- Outgoing SMS app, part 2: the pending-review queue, and the new
-- closing/nurture SMS campaign that populates it (docs/plans/43
-- follow-up request, 2026-11-06). Only this kind and Phase I's existing
-- finance_schedule_recalc_proposals require human approval before
-- sending -- every other SMS kind in sms_templates stays auto-sent as it
-- already is, just with its text now editable.

create table if not exists public.outbound_sms_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  lead_id uuid references public.leads(id),
  recipient_name text not null,
  recipient_phone text,
  body text not null,
  angle text,
  status text not null default 'pending' check (status in ('pending','approved','sent','dismissed')),
  created_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz
);

create index if not exists outbound_sms_drafts_kind_lead_created_idx
  on public.outbound_sms_drafts (kind, lead_id, created_at desc);

alter table public.outbound_sms_drafts enable row level security;

create policy outbound_sms_drafts_sel on public.outbound_sms_drafts for select to authenticated
  using (public.my_role() = 'manager');

-- Real eligibility: a lead who has made no commitment yet (zero approved
-- payment ever recorded), is not soft-deleted, and has no
-- lead_closing_sms draft of any status in the last 30 real days (covers
-- both "already sent this month" and "cron somehow re-ran before the
-- next real monthly cycle"). Returns the real prior-draft count too, so
-- the caller can rotate through the angle list deterministically per
-- lead rather than repeating the same angle every month.
create or replace function public.compute_lead_closing_candidates()
returns table(
  lead_id uuid,
  name text,
  plot_type text,
  contact text,
  agent_key text,
  agent_name text,
  agent_phone text,
  prior_draft_count integer
)
language sql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
  select
    l.id,
    l.name,
    coalesce(l.plot_type, 'plot'),
    l.contact,
    l.agent_key,
    case when l.agent_key is distinct from 'company' then p.name end,
    case when l.agent_key is distinct from 'company' then p.phone end,
    coalesce((
      select count(*)::int from public.outbound_sms_drafts d
      where d.lead_id = l.id and d.kind = 'lead_closing_sms'
    ), 0)
  from public.leads l
  left join public.profiles p on p.agent_key = l.agent_key and l.agent_key is distinct from 'company'
  where l.deleted_at is null
    and coalesce(l.amt_paid, 0) <= 0
    and l.contact is not null and btrim(l.contact) <> ''
    and not exists (
      select 1 from public.outbound_sms_drafts d
      where d.lead_id = l.id and d.kind = 'lead_closing_sms'
        and d.created_at > now() - interval '30 days'
    );
$$;

-- Worker-only insert (service role), same trust boundary as every other
-- outbox/digest table in this project.
create or replace function public.insert_lead_closing_draft(
  p_lead_id uuid, p_name text, p_phone text, p_body text, p_angle text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  insert into public.outbound_sms_drafts(kind, lead_id, recipient_name, recipient_phone, body, angle, status)
  values ('lead_closing_sms', p_lead_id, p_name, p_phone, p_body, p_angle, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

-- Management-only approve/dismiss, mirroring
-- save_finance_schedule_recalc_sms_draft / confirm_finance_schedule_recalc_proposal
-- / dismiss_finance_schedule_recalc_proposal's own real pattern.
create or replace function public.approve_outbound_sms_draft(p_id uuid, p_body text)
returns table(recipient_phone text, body text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_phone text; v_body text;
begin
  if public.my_role() <> 'manager' then
    raise exception 'Only Management can approve outgoing SMS.' using errcode = '42501';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'The message cannot be empty.';
  end if;
  update public.outbound_sms_drafts
  set body = p_body, status = 'approved', approved_by = public.my_key(), approved_at = now()
  where id = p_id and status = 'pending'
  returning recipient_phone, body into v_phone, v_body;
  if not found then
    raise exception 'This draft is no longer pending.';
  end if;
  return query select v_phone, v_body;
end;
$$;

create or replace function public.mark_outbound_sms_draft_sent(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.my_role() <> 'manager' then
    raise exception 'Only Management can send outgoing SMS.' using errcode = '42501';
  end if;
  update public.outbound_sms_drafts set status = 'sent', sent_at = now()
  where id = p_id and status = 'approved';
end;
$$;

create or replace function public.dismiss_outbound_sms_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.my_role() <> 'manager' then
    raise exception 'Only Management can dismiss outgoing SMS.' using errcode = '42501';
  end if;
  update public.outbound_sms_drafts set status = 'dismissed'
  where id = p_id and status in ('pending','approved');
end;
$$;

-- Same dispatch-via-net.http_post pattern as
-- dispatch_finance_missed_payment_digest, reusing the same worker-token
-- vault secret (same trust domain, this is still finance/CRM automation).
create or replace function public.dispatch_lead_closing_drafts()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'pg_temp'
set row_security to 'off'
as $$
declare v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name = 'finance_monthly_reminder_worker_token' limit 1;
  if v_token is null then raise exception 'Worker token is not configured.'; end if;
  perform net.http_post(
    url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/send-lead-closing-drafts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_token),
    body := jsonb_build_object('source', 'lead_closing_sms_cron')
  );
end;
$$;

-- Monthly, the 1st of each month at 08:00 UTC (after the staff digest/
-- missed-payment windows so it doesn't contend for the same minute).
select cron.schedule('lead-closing-sms-monthly', '0 8 1 * *', $$select public.dispatch_lead_closing_drafts();$$);
