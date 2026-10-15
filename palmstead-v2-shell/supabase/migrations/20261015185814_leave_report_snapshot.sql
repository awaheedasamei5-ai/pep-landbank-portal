-- Read-only, allowlisted reporting projection. Caller RLS remains enabled.
create or replace function public.get_leave_report_snapshot(p_year integer)
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp as $$
declare
  v_key text; v_role text; v_active boolean;
  v_requests jsonb; v_roster jsonb; v_events jsonb; v_years jsonb;
  v_total bigint; v_event_total bigint; v_days integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view Leave reports.' using errcode = '42501';
  end if;
  select agent_key, role, active into v_key, v_role, v_active
    from public.profiles where id = auth.uid();
  if v_key is null or v_role not in ('agent', 'manager') or v_active is distinct from true then
    raise exception 'Active staff access required.' using errcode = '42501';
  end if;
  if p_year is null or p_year < 1901 or p_year > 2199 then
    raise exception 'Choose a year between 1901 and 2199.' using errcode = '22023';
  end if;
  select leave_total_days into v_days from public.app_config where id = 1;
  if v_days is null or v_days < 0 or v_days > 365 then
    raise exception 'The company Leave policy needs review before generating balances.' using errcode = '22023';
  end if;
  select count(*) into v_total from public.leave_requests r
    where r.year in (p_year, p_year - 1) and (v_role = 'manager' or r.agent_key = v_key);
  select coalesce(jsonb_agg(to_jsonb(item) order by item."createdAt", item.id), '[]'::jsonb)
    into v_requests from (
      select r.id, r.agent_key as "agentKey", r.agent_name as "agentName", r.request_no as "requestNo",
        r.year, r.dates, r.days_count as "daysCount", r.status, r.is_emergency as "isEmergency",
        r.deduct_quota as "deductQuota", r.created_at as "createdAt", r.decided_at as "decidedAt",
        r.decided_by_name as "decidedByName", r.auto_submitted_at as "autoSubmittedAt", r.used_confirmed_at as "usedConfirmedAt"
      from public.leave_requests r where r.year in (p_year, p_year - 1)
        and (v_role = 'manager' or r.agent_key = v_key)
      order by r.created_at, r.id limit 20000
    ) item;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.name, item.key), '[]'::jsonb)
    into v_roster from (
      select p.agent_key as key, p.name, p.department, p.active,
        (p.active is true and p.role in ('agent', 'manager')) as "policyEligible"
      from public.profiles p where (v_role = 'manager' or p.agent_key = v_key)
        and (p.role = 'agent' or p.agent_key = v_key or exists (
          select 1 from public.leave_requests r where r.agent_key = p.agent_key and r.year in (p_year, p_year - 1)
        ))
    ) item;
  select coalesce(jsonb_agg(year order by year desc), '[]'::jsonb) into v_years
    from (select distinct r.year from public.leave_requests r where v_role = 'manager' or r.agent_key = v_key) years;
  select count(*) into v_event_total from public.leave_request_logs l join public.leave_requests r on r.id = l.request_id
    where r.year = p_year and (v_role = 'manager' or r.agent_key = v_key);
  select coalesce(jsonb_agg(to_jsonb(item) order by item."createdAt", item."requestId"), '[]'::jsonb)
    into v_events from (
      select l.request_id as "requestId", l.created_at as "createdAt", l.actor_key as "actorKey",
        l.from_status as "fromStatus", l.to_status as "toStatus"
      from public.leave_request_logs l join public.leave_requests r on r.id = l.request_id
      where r.year = p_year and (v_role = 'manager' or r.agent_key = v_key)
      order by l.created_at, l.id limit 20000
    ) item;
  return jsonb_build_object('generatedAt', statement_timestamp(), 'scope', case when v_role = 'manager' then 'management' else 'personal' end,
    'annualDays', v_days, 'year', p_year, 'requests', v_requests, 'roster', v_roster,
    'complete', v_total = jsonb_array_length(v_requests), 'totalRequests', v_total,
    'availableYears', v_years, 'events', v_events, 'eventsComplete', v_event_total = jsonb_array_length(v_events));
end;
$$;
revoke all on function public.get_leave_report_snapshot(integer) from public, anon;
grant execute on function public.get_leave_report_snapshot(integer) to authenticated;
