create or replace function public.queue_finance_monthly_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
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
$$;

create or replace function public.claim_finance_monthly_payment_reminders(p_limit integer default 10)
returns setof public.finance_monthly_payment_reminder_outbox
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
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
      and installment.due_date = (now() at time zone 'Africa/Accra')::date + 7
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
$$;

create or replace function public.verify_finance_monthly_reminder_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select p_token is not null
    and p_token = (select decrypted_secret from vault.decrypted_secrets where name = 'finance_monthly_reminder_worker_token' limit 1)
$$;

create or replace function public.dispatch_finance_monthly_reminders()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
set row_security = off
as $$
declare v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name = 'finance_monthly_reminder_worker_token' limit 1;
  if v_token is null then raise exception 'Monthly reminder worker token is not configured.'; end if;
  perform net.http_post(
    url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/process-finance-monthly-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_token),
    body := jsonb_build_object('source', 'finance_monthly_reminder_cron')
  );
end;
$$;

-- Remove PostgreSQL's default PUBLIC execution grants from every API function
-- created in the foundation and worker migrations. Only authenticated managers
-- may create schedules or change consent; cron and the worker use service_role.
revoke all on function public.create_finance_monthly_payment_schedule(uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_finance_monthly_payment_schedule(uuid, boolean) to authenticated;
revoke all on function public.set_finance_monthly_payment_reminders(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_finance_monthly_payment_reminders(uuid, boolean) to authenticated;
revoke all on function public.queue_finance_monthly_payment_reminders() from public, anon, authenticated;
revoke all on function public.claim_finance_monthly_payment_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_finance_monthly_payment_reminders(integer) to service_role;
revoke all on function public.verify_finance_monthly_reminder_worker_token(text) from public, anon, authenticated;
grant execute on function public.verify_finance_monthly_reminder_worker_token(text) to service_role;
revoke all on function public.dispatch_finance_monthly_reminders() from public, anon, authenticated;

