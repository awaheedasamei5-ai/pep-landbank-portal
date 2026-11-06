-- Phase H (client-ID integration plan, docs/plans/43 §5.1): missed-payment
-- SMS. Mirrors the existing "due in 7 days" pattern exactly
-- (queue_finance_monthly_payment_reminders / claim_finance_monthly_payment_reminders
-- / process-finance-monthly-reminders), reusing the same outbox table and
-- worker, distinguished by a new reminder_type column so one worker can
-- serve both reminder kinds without duplicating the SMS-delivery/retry
-- machinery.

alter table public.finance_monthly_payment_reminder_outbox
  add column if not exists reminder_type text not null default 'due_soon';

alter table public.finance_monthly_payment_reminder_outbox
  drop constraint if exists finance_monthly_payment_reminder_outbox_reminder_type_check;
alter table public.finance_monthly_payment_reminder_outbox
  add constraint finance_monthly_payment_reminder_outbox_reminder_type_check
  check (reminder_type = any (array['due_soon', 'missed_payment']));

-- New queue function: mirrors queue_finance_monthly_payment_reminders
-- exactly, but selects the earliest unpaid installment once its due_date
-- has already passed, instead of the one 7 days out. Idempotency key uses
-- a 'missed:' infix so it can never collide with the existing due_soon key
-- for the same (schedule, installment, due_date) -- each installment gets
-- queued for a missed-payment SMS exactly once, not once per day overdue.
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

-- claim_finance_monthly_payment_reminders now branches its due_date
-- revalidation on outbox.reminder_type: due_soon keeps the original
-- "exactly 7 days out" check, missed_payment requires the due_date to
-- still be in the past (it could have flipped to paid/current since
-- queueing, in which case the installment-status/first-unpaid join
-- conditions already exclude it).
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
      and installment.id = (
        select due.id from public.finance_monthly_payment_installments due
        where due.schedule_id = schedule.id and due.status in ('scheduled','part_paid')
        order by due.installment_no limit 1
      )
      and (
        (outbox.reminder_type = 'due_soon' and installment.due_date = (now() at time zone 'Africa/Accra')::date + 7)
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

-- New cron entry, same schedule convention as the existing queue job
-- (09:00 daily), offset by 15 minutes so the two queue functions don't
-- contend for the same lock window.
select cron.schedule(
  'finance-missed-payment-reminder-queue',
  '15 9 * * *',
  $$select public.queue_finance_missed_payment_reminders();$$
);
