-- The queue stays private. Only this explicit, read-only Management projection
-- crosses the API boundary; no provider payload, phone or message text leaves it.
create schema if not exists leave_reporting_private;
revoke all on schema leave_reporting_private from public, anon;
grant usage on schema leave_reporting_private to authenticated;

create function leave_reporting_private.reminder_report(p_from date, p_to date, p_compare text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_previous_from date; v_previous_to date; v_result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'manager' and active = true
  ) then raise exception 'Active Management access required.' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
     or p_from < date '1901-01-01' or p_to > date '2199-12-31'
     or p_compare is null or p_compare not in ('previous_period', 'previous_year') then
    raise exception 'Choose a valid report period of at most 366 days and comparison.' using errcode = '22023';
  end if;
  if p_compare = 'previous_year' then
    v_previous_from := (p_from - interval '1 year')::date;
    v_previous_to := (p_to - interval '1 year')::date;
  else
    v_previous_to := p_from - 1;
    v_previous_from := p_from - (p_to - p_from + 1);
  end if;
  with periods as (
    select 'current'::text period, p_from date_from, p_to date_to
    union all select 'previous', v_previous_from, v_previous_to
  ), records as materialized (
    select period.period, outbox.id, outbox.request_id as "requestId",
      coalesce(request.request_no, outbox.request_id::text) as reference,
      request.id is not null as "requestExists", request.agent_key as "ownerKey",
      coalesce(owner.name, request.agent_name, 'Request owner unavailable') as "ownerName",
      coalesce(recipient.name, 'Former or unavailable recipient') as "recipientName",
      case when request.id is null then 'unavailable'
        when request.agent_key = outbox.recipient_key then 'owner' else 'other' end as relationship,
      case when outbox.event_key like 'auto-submit:%' then 'Seven-day submission'
        when outbox.event_key like 'transition:%' then 'Workflow update' else 'Other recorded event' end as event,
      outbox.status, outbox.attempt_count as attempts, outbox.created_at as "createdAt",
      outbox.provider_accepted_at as "acceptedAt", outbox.last_retry_at as "retriedAt",
      case when outbox.status = 'queued' then outbox.next_attempt_at end as "nextAttemptAt"
    from periods period join public.leave_sms_outbox outbox
      on outbox.created_at >= (period.date_from::timestamp at time zone 'UTC')
      and outbox.created_at < ((period.date_to + 1)::timestamp at time zone 'UTC')
    left join public.leave_requests request on request.id = outbox.request_id
    left join public.profiles owner on owner.agent_key = request.agent_key
    left join public.profiles recipient on recipient.agent_key = outbox.recipient_key
  ), numbered as (
    select *, row_number() over(partition by period order by "createdAt" desc, id) row_number from records
  ), cohorts as (
    select period.period, period.date_from, period.date_to,
      count(numbered.id) total,
      coalesce(jsonb_agg(to_jsonb(numbered) - 'period' - 'row_number' order by numbered."createdAt" desc, numbered.id)
        filter(where numbered.id is not null and numbered.row_number <= 10000), '[]'::jsonb) rows
    from periods period left join numbered on numbered.period = period.period
    group by period.period, period.date_from, period.date_to
  ) select jsonb_build_object('generatedAt', now(), 'comparisonMode', p_compare,
    'current', (select jsonb_build_object('from',date_from,'to',date_to,'total',total,'complete',total <= 10000,'rows',rows) from cohorts where period='current'),
    'previous', (select jsonb_build_object('from',date_from,'to',date_to,'total',total,'complete',total <= 10000,'rows',rows) from cohorts where period='previous')) into v_result;
  return v_result;
end;
$$;
revoke all on function leave_reporting_private.reminder_report(date,date,text) from public, anon;
grant execute on function leave_reporting_private.reminder_report(date,date,text) to authenticated;

create function public.get_leave_reminder_report(p_from date, p_to date, p_compare text default 'previous_period')
returns jsonb language sql stable security invoker set search_path = '' as $$
  select leave_reporting_private.reminder_report(p_from, p_to, p_compare);
$$;
revoke all on function public.get_leave_reminder_report(date,date,text) from public, anon;
grant execute on function public.get_leave_reminder_report(date,date,text) to authenticated;
comment on function public.get_leave_reminder_report(date,date,text) is
  'Active Management only. Messages grouped by queue creation date, current status. Provider acceptance is not handset delivery. No private message payloads.';
