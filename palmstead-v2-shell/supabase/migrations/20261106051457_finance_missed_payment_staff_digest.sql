-- Phase H follow-up (docs/plans/43 §5.1, per the user's own explicit
-- follow-up instructions): a staff/management safety-net SMS that fires
-- BEFORE the client-facing missed-payment reminder queue, listing exactly
-- who the system is about to text that day so a staff member can log any
-- payment they haven't gotten to yet -- which naturally removes that
-- client from the real "still overdue" query by the time the client-facing
-- send actually runs (claim_finance_monthly_payment_reminders already
-- re-validates installment status live at claim time, and the worker
-- re-validates again right before sending -- this digest doesn't change
-- that, it just gives staff a window to act before it matters).

create table if not exists public.finance_missed_payment_digest_log (
  digest_date date primary key,
  sent_at timestamptz not null default now(),
  recipient_count integer not null default 0,
  client_count integer not null default 0
);

alter table public.finance_missed_payment_digest_log enable row level security;

-- Read-only mirror of queue_finance_missed_payment_reminders()'s own
-- selection logic (no insert) -- the real list of clients who would
-- receive a missed-payment SMS if the queue ran right now today.
create or replace function public.compute_finance_missed_payment_digest_clients()
returns table(lead_id uuid, name text, outstanding numeric, due_date date, plot_type text)
language sql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
  select
    schedule.lead_id,
    lead.name,
    greatest(0, installment.due_amount - installment.paid_amount) as outstanding,
    installment.due_date,
    coalesce(
      (
        select p.plot_type from public.plots p
        where p.lead_id = schedule.lead_id
        order by p.updated_at desc nulls last
        limit 1
      ),
      lead.plot_type
    ) as plot_type
  from public.finance_monthly_payment_schedules schedule
  join public.finance_monthly_payment_installments installment on installment.schedule_id = schedule.id
  join public.leads lead on lead.id = schedule.lead_id and lead.deleted_at is null
  where schedule.status = 'active'
    and schedule.sms_reminders_enabled
    and schedule.sms_consent_recorded_at is not null
    and installment.status in ('scheduled','part_paid')
    and installment.id = (
      select due.id from public.finance_monthly_payment_installments due
      where due.schedule_id = schedule.id and due.status in ('scheduled','part_paid')
      order by due.installment_no limit 1
    )
    and installment.due_date < (now() at time zone 'Africa/Accra')::date
    and public.finance_normalize_ghana_mobile(lead.contact) = schedule.sms_consent_phone
  order by installment.due_date;
$$;

-- Every active staff member who can act on this (manager always can, via
-- the same bypass has_permission() already gives them; anyone else needs a
-- real payments.manage grant -- mirrors has_permission()'s own override-
-- then-role-default logic, but for every staff row at once rather than
-- just the caller, since this runs from a cron worker with no auth.uid().
create or replace function public.list_finance_missed_payment_digest_recipients()
returns table(agent_key text, name text, phone text)
language sql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
  select
    p.agent_key,
    p.name,
    coalesce(
      nullif(trim(p.phone), ''),
      case when p.role = 'manager' then (select company_phone from public.app_config limit 1) end
    ) as phone
  from public.profiles p
  where p.active is true
    and (
      p.role = 'manager'
      or exists (
        select 1 from public.staff_permission_overrides o
        where o.staff_key = p.agent_key and o.permission_key = 'payments.manage' and o.granted
      )
      or (
        not exists (
          select 1 from public.staff_permission_overrides o2
          where o2.staff_key = p.agent_key and o2.permission_key = 'payments.manage'
        )
        and exists (
          select 1 from public.role_permissions rp
          where rp.role = p.role and rp.permission_key = 'payments.manage'
        )
      )
    );
$$;

-- Idempotency: only the first caller for a given Accra calendar date
-- actually gets `true` back; a second cron overlap (or a manual re-run)
-- is a safe no-op, same discipline as every other outbox-based worker in
-- this project.
create or replace function public.claim_finance_missed_payment_digest(p_date date)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  insert into public.finance_missed_payment_digest_log(digest_date) values (p_date)
  on conflict do nothing;
  return found;
end;
$$;

create or replace function public.record_finance_missed_payment_digest_counts(p_date date, p_recipients integer, p_clients integer)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.finance_missed_payment_digest_log
  set recipient_count = p_recipients, client_count = p_clients
  where digest_date = p_date;
$$;

-- Fires the worker via net.http_post, same pattern as every other
-- finance SMS job (dispatch_finance_monthly_reminders /
-- dispatch_finance_receipt_sms) -- reuses the existing
-- finance_monthly_reminder_worker_token vault secret rather than minting a
-- new one, since this is the same trust domain.
create or replace function public.dispatch_finance_missed_payment_digest()
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
  if v_token is null then raise exception 'Monthly reminder worker token is not configured.'; end if;
  perform net.http_post(
    url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/send-finance-missed-payment-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_token),
    body := jsonb_build_object('source', 'finance_missed_payment_digest_cron')
  );
end;
$$;

-- Runs at 07:00 Africa/Accra (Ghana has no DST, UTC+0 year-round, so this
-- is a flat 07:00 UTC = 07:00 Accra), a real 2h15m buffer before the
-- missed-payment reminder queue itself (09:15 UTC, job 21) so staff
-- genuinely have time to log a payment before the client-facing send
-- considers it.
select cron.schedule('finance-missed-payment-staff-digest', '0 7 * * *', $$select public.dispatch_finance_missed_payment_digest();$$);
