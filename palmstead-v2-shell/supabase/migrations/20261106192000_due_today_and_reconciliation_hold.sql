-- SMS engine rebuild Phase B, items 2 (docs/plans/48 Sec 9):
--
-- 1. `payment_due_today`: a distinct real state for a same-day
--    installment, instead of falling through to due_soon (exactly 7 days
--    out) or missed_payment (strictly before today) with no "today"
--    message at all.
--
-- 2. `reconciliation_hold`: the single highest-value gap per the audit's
--    own risk framing -- this is structurally what would have prevented
--    the earlier Mr Joe incident (a synthetic test row sent a real SMS
--    while under active, unreviewed investigation). Installment-level,
--    not schedule-level: a hold is almost always about one specific
--    disputed payment, not the whole plan, and keeping it at the
--    installment grain means the client's OTHER real installments keep
--    getting correct reminders while the one under review is paused.

alter table public.finance_monthly_payment_installments
  add column if not exists reconciliation_hold boolean not null default false;
alter table public.finance_monthly_payment_installments
  add column if not exists reconciliation_hold_reason text;
alter table public.finance_monthly_payment_installments
  add column if not exists reconciliation_hold_set_by uuid references auth.users(id) on delete set null;
alter table public.finance_monthly_payment_installments
  add column if not exists reconciliation_hold_set_at timestamptz;
alter table public.finance_monthly_payment_installments
  add constraint finance_monthly_payment_installments_hold_reason_check
  check (not reconciliation_hold or reconciliation_hold_reason is not null);

alter table public.finance_monthly_payment_reminder_outbox
  drop constraint if exists finance_monthly_payment_reminder_outbox_reminder_type_check;
alter table public.finance_monthly_payment_reminder_outbox
  add constraint finance_monthly_payment_reminder_outbox_reminder_type_check
  check (reminder_type = any (array['due_soon', 'due_today', 'missed_payment']));

-- Management-only toggle, mirroring set_finance_monthly_payment_reminders'
-- own auth/shape. Setting the hold immediately cancels any already-queued
-- reminder for that installment so a hold set moments before a send still
-- works, not just future queueing.
create or replace function public.set_finance_installment_reconciliation_hold(
  p_installment_id uuid,
  p_hold boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if auth.uid() is null or public.my_role() is distinct from 'manager' then
    raise exception 'Only Management can place or clear a reconciliation hold.' using errcode = '42501';
  end if;
  if p_hold and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to place a reconciliation hold.';
  end if;
  update public.finance_monthly_payment_installments
  set reconciliation_hold = p_hold,
      reconciliation_hold_reason = case when p_hold then btrim(p_reason) else null end,
      reconciliation_hold_set_by = case when p_hold then auth.uid() else null end,
      reconciliation_hold_set_at = case when p_hold then now() else null end,
      updated_at = now()
  where id = p_installment_id;
  if not found then raise exception 'Installment not found.'; end if;
  if p_hold then
    update public.finance_monthly_payment_reminder_outbox
    set status = 'cancelled', lease_until = null,
        last_error = 'A Management reconciliation hold was placed on this installment.', updated_at = now()
    where installment_id = p_installment_id and status = 'queued';
  end if;
end;
$function$;
revoke all on function public.set_finance_installment_reconciliation_hold(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_finance_installment_reconciliation_hold(uuid, boolean, text) to authenticated;

-- Seed the new due_today template.
insert into public.sms_templates (kind, label, description, body_template) values
  (
    'payment_due_today',
    'Payment due today',
    'Sent on the exact due date of an instalment, before it has had a chance to become overdue. Placeholders filled in by the worker: {name}, {amount}, {plotType}, {dueDate}.',
    'Hello {name}, your monthly payment of {amount} for your {plotType} at the Royal Palm Enclave is due today, {dueDate}. Kindly arrange payment at your earliest convenience. - Trulander JSF'
  )
on conflict (kind) do nothing;

-- New queue function: mirrors queue_finance_monthly_payment_reminders
-- exactly, selecting the earliest unpaid installment whose due_date is
-- exactly today (Africa/Accra). Excludes any installment under an active
-- reconciliation hold -- same exclusion added to the due_soon and
-- missed_payment queue functions below.
create or replace function public.queue_finance_due_today_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare v_count integer;
begin
  insert into public.finance_monthly_payment_reminder_outbox(
    schedule_id, installment_id, lead_id, idempotency_key, reminder_type
  )
  select schedule.id, installment.id, schedule.lead_id,
    schedule.id::text || ':today:' || installment.installment_no::text || ':' || installment.due_date::text,
    'due_today'
  from public.finance_monthly_payment_schedules schedule
  join public.finance_monthly_payment_installments installment on installment.schedule_id = schedule.id
  join public.leads lead on lead.id = schedule.lead_id and lead.deleted_at is null
  where schedule.status = 'active'
    and schedule.sms_reminders_enabled
    and schedule.sms_consent_recorded_at is not null
    and installment.status in ('scheduled','part_paid')
    and not installment.reconciliation_hold
    and installment.id = (
      select due.id from public.finance_monthly_payment_installments due
      where due.schedule_id = schedule.id and due.status in ('scheduled','part_paid')
      order by due.installment_no limit 1
    )
    and installment.due_date = (now() at time zone 'Africa/Accra')::date
    and public.finance_normalize_ghana_mobile(lead.contact) = schedule.sms_consent_phone
  on conflict (idempotency_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- due_soon: add the reconciliation_hold exclusion.
create or replace function public.queue_finance_monthly_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $function$
declare v_count integer;
begin
  insert into public.finance_monthly_payment_reminder_outbox(
    schedule_id, installment_id, lead_id, idempotency_key
  )
  select schedule.id, installment.id, schedule.lead_id,
    schedule.id::text || ':installment:' || installment.installment_no::text || ':' || installment.due_date::text
  from public.finance_monthly_payment_schedules schedule
  join public.finance_monthly_payment_installments installment on installment.schedule_id = schedule.id
  join public.leads lead on lead.id = schedule.lead_id and lead.deleted_at is null
  where schedule.status = 'active'
    and schedule.sms_reminders_enabled
    and schedule.sms_consent_recorded_at is not null
    and installment.status in ('scheduled','part_paid')
    and not installment.reconciliation_hold
    and installment.id = (
      select due.id from public.finance_monthly_payment_installments due
      where due.schedule_id = schedule.id and due.status in ('scheduled','part_paid')
      order by due.installment_no limit 1
    )
    and installment.due_date = (now() at time zone 'Africa/Accra')::date + 7
    and public.finance_normalize_ghana_mobile(lead.contact) = schedule.sms_consent_phone
  on conflict (idempotency_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- missed_payment: add the reconciliation_hold exclusion.
create or replace function public.queue_finance_missed_payment_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare v_count integer;
begin
  insert into public.finance_monthly_payment_reminder_outbox(
    schedule_id, installment_id, lead_id, idempotency_key, reminder_type
  )
  select schedule.id, installment.id, schedule.lead_id,
    schedule.id::text || ':missed:' || installment.installment_no::text || ':' || installment.due_date::text,
    'missed_payment'
  from public.finance_monthly_payment_schedules schedule
  join public.finance_monthly_payment_installments installment on installment.schedule_id = schedule.id
  join public.leads lead on lead.id = schedule.lead_id and lead.deleted_at is null
  where schedule.status = 'active'
    and schedule.sms_reminders_enabled
    and schedule.sms_consent_recorded_at is not null
    and installment.status in ('scheduled','part_paid')
    and not installment.reconciliation_hold
    and installment.id = (
      select due.id from public.finance_monthly_payment_installments due
      where due.schedule_id = schedule.id and due.status in ('scheduled','part_paid')
      order by due.installment_no limit 1
    )
    and installment.due_date < (now() at time zone 'Africa/Accra')::date
    and public.finance_normalize_ghana_mobile(lead.contact) = schedule.sms_consent_phone
  on conflict (idempotency_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- claim_finance_monthly_payment_reminders: add a due_today branch and the
-- reconciliation_hold re-check (defense in depth -- a hold placed between
-- queue time and claim time must still cancel the send).
create or replace function public.claim_finance_monthly_payment_reminders(p_limit integer DEFAULT 10)
 returns SETOF finance_monthly_payment_reminder_outbox
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
 set row_security to 'off'
as $function$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  update public.finance_monthly_payment_reminder_outbox
  set status = 'needs_review',
      last_error = 'Worker stopped after claiming the reminder. Check provider history before retrying.',
      lease_until = null, updated_at = now()
  where status = 'sending' and lease_until < now();

  return query
  with candidates as (
    select outbox.id
    from public.finance_monthly_payment_reminder_outbox outbox
    join public.finance_monthly_payment_schedules schedule on schedule.id = outbox.schedule_id
    join public.finance_monthly_payment_installments installment on installment.id = outbox.installment_id
    join public.leads lead on lead.id = outbox.lead_id and lead.deleted_at is null
    where outbox.status = 'queued' and outbox.next_attempt_at <= now()
      and schedule.status = 'active' and schedule.sms_reminders_enabled
      and schedule.sms_consent_recorded_at is not null
      and installment.status in ('scheduled','part_paid')
      and not installment.reconciliation_hold
      and installment.id = (
        select due.id from public.finance_monthly_payment_installments due
        where due.schedule_id = schedule.id and due.status in ('scheduled','part_paid')
        order by due.installment_no limit 1
      )
      and (
        (outbox.reminder_type = 'due_soon' and installment.due_date = (now() at time zone 'Africa/Accra')::date + 7)
        or
        (outbox.reminder_type = 'due_today' and installment.due_date = (now() at time zone 'Africa/Accra')::date)
        or
        (outbox.reminder_type = 'missed_payment' and installment.due_date < (now() at time zone 'Africa/Accra')::date)
      )
      and public.finance_normalize_ghana_mobile(lead.contact) = schedule.sms_consent_phone
    order by outbox.next_attempt_at, outbox.created_at
    for update of outbox skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  )
  update public.finance_monthly_payment_reminder_outbox outbox
  set status = 'sending', attempt_count = outbox.attempt_count + 1,
      lease_until = now() + interval '5 minutes', updated_at = now()
  from candidates where outbox.id = candidates.id
  returning outbox.*;
end;
$function$;

-- New cron, same slot family as the existing queue jobs: 08:00 UTC = 08:00
-- Accra, between the staff digest (07:00) and the due_soon/missed queues
-- (09:00/09:15).
select cron.schedule(
  'finance-due-today-reminder-queue',
  '0 8 * * *',
  $$select public.queue_finance_due_today_reminders();$$
);
