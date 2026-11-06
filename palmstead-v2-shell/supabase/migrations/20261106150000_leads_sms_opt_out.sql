-- docs/plans/47 open item 3: no real do-not-contact/opt-out flag existed
-- for the new automated-SMS audience queries. Real nullable-by-default-false
-- boolean; every automated client-facing SMS QUEUEING query now excludes
-- sms_opt_out = true leads (the due-soon/missed-payment worker itself also
-- re-checks it as a last-moment gate, alongside the real-time changes
-- below).
alter table public.leads add column if not exists sms_opt_out boolean not null default false;

create or replace function public.compute_lead_closing_candidates(p_limit integer default 25)
returns table(lead_id uuid, name text, plot_type text, contact text, agent_key text, agent_name text, agent_phone text, prior_draft_count integer)
language sql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
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
    and l.sms_opt_out is not true
    and not exists (
      select 1 from public.outbound_sms_drafts d
      where d.lead_id = l.id and d.kind = 'lead_closing_sms'
        and d.created_at > now() - interval '30 days'
    )
  order by l.created_at asc
  limit greatest(p_limit, 1);
$function$;

create or replace function public.queue_finance_monthly_payment_reminders()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
 set row_security to 'off'
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
    and lead.sms_opt_out is not true
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
$function$;

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
    and lead.sms_opt_out is not true
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
