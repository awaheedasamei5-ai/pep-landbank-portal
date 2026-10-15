-- Limit staff to their own Leave requests while retaining the calendar's
-- collision feedback through a bounded, date-only availability function.
-- Apply only after the matching client changes are deployed and verified.

alter table public.leave_requests
  add column if not exists auto_submitted_at timestamptz;

drop policy if exists leave_requests_sel on public.leave_requests;
create policy leave_requests_sel
  on public.leave_requests
  for select
  to authenticated
  using (agent_key = public.my_key() or public.my_role() = 'manager');

drop policy if exists leave_requests_ins on public.leave_requests;
create policy leave_requests_ins
  on public.leave_requests
  for insert
  to authenticated
  with check (
    (
      agent_key = public.my_key()
      and status in ('planned', 'pending')
      and decided_at is null
      and decided_by is null
      and decided_by_name is null
      and decided_signature is null
      and used_confirmed_at is null
      and auto_submitted_at is null
      and deduct_quota = true
    )
    or public.my_role() = 'manager'
  );

drop policy if exists leave_requests_del on public.leave_requests;
create policy leave_requests_del
  on public.leave_requests
  for delete
  to authenticated
  using (
    (agent_key = public.my_key() and status = 'planned')
    or public.my_role() = 'manager'
  );

drop policy if exists leave_requests_upd on public.leave_requests;
create policy leave_requests_upd
  on public.leave_requests
  for update
  to authenticated
  using (agent_key = public.my_key() or public.my_role() = 'manager')
  with check (agent_key = public.my_key() or public.my_role() = 'manager');

create or replace function public.guard_staff_leave_request_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Trusted server routines (including the existing scheduled reminder
  -- job) must continue to update delivery metadata without a user JWT.
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if public.my_role() = 'manager' then
    return new;
  end if;

  if auth.uid() is null or old.agent_key <> public.my_key() then
    raise exception 'You may only update your own leave request.' using errcode = '42501';
  end if;

  if old.status = 'planned' and new.status = 'planned' then
    if (to_jsonb(new) - array['dates', 'days_count', 'year', 'letter_text'])
       is distinct from (to_jsonb(old) - array['dates', 'days_count', 'year', 'letter_text']) then
      raise exception 'Only the dates and letter on a planned request can be edited.' using errcode = '42501';
    end if;
  elsif old.status = 'planned' and new.status = 'pending' then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'A planned request can only be submitted without changing its contents.' using errcode = '42501';
    end if;
  elsif old.status = 'rescheduled' and new.status = 'pending' then
    if new.decided_at is not null or new.decided_by is not null or new.decided_by_name is not null
       or new.decided_signature is not null or new.reschedule_note is not null
       or (to_jsonb(new) - array['dates', 'days_count', 'year', 'letter_text', 'status', 'decided_at', 'decided_by', 'decided_by_name', 'decided_signature', 'reschedule_note'])
       is distinct from (to_jsonb(old) - array['dates', 'days_count', 'year', 'letter_text', 'status', 'decided_at', 'decided_by', 'decided_by_name', 'decided_signature', 'reschedule_note']) then
      raise exception 'A reschedule response may only change dates and return the request to Management.' using errcode = '42501';
    end if;
  elsif old.status = 'approved' and new.status = 'approved' then
    if (to_jsonb(new) - 'used_confirmed_at') is distinct from (to_jsonb(old) - 'used_confirmed_at')
       or old.used_confirmed_at is not null
       or new.used_confirmed_at is null
       or (select max(value::date) from jsonb_array_elements_text(old.dates)) >= (now() at time zone 'Africa/Accra')::date then
      raise exception 'Only completed approved leave can be confirmed as taken.' using errcode = '42501';
    end if;
  else
    raise exception 'This leave request cannot be changed by staff in its current state.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_staff_leave_request_update on public.leave_requests;
create trigger guard_staff_leave_request_update
  before update on public.leave_requests
  for each row execute function public.guard_staff_leave_request_update();

-- Serialize reservations so two concurrent submissions cannot both pass
-- the same quota or colleague-date check before either insert commits.
create or replace function public.validate_leave_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_dates date[];
  v_day_count integer;
  v_quota integer;
  v_reserved integer;
  v_validate boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    v_validate := new.dates is distinct from old.dates
      or new.days_count is distinct from old.days_count
      or new.year is distinct from old.year
      or new.agent_key is distinct from old.agent_key
      or new.deduct_quota is distinct from old.deduct_quota
      or (new.status = 'approved' and old.status <> 'approved')
      or (old.status = 'declined' and new.status <> 'declined');
    if old.status in ('pending', 'approved', 'rescheduled')
       and new.status in ('pending', 'approved', 'rescheduled')
       and new.days_count is distinct from old.days_count then
      raise exception 'A reschedule must retain the original number of leave days.' using errcode = '23514';
    end if;
  end if;
  if not v_validate or new.status = 'declined' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('palmstead_leave_reservations', 0));
  if jsonb_typeof(new.dates) is distinct from 'array' then
    raise exception 'Select at least one valid leave date.' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(new.dates) d where jsonb_typeof(d) <> 'string')
     or exists (select 1 from jsonb_array_elements_text(new.dates) d where d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'Leave dates must use YYYY-MM-DD.' using errcode = '23514';
  end if;
  select array_agg(value::date order by value::date), count(distinct value::date)
  into v_dates, v_day_count
  from jsonb_array_elements_text(new.dates);
  if coalesce(v_day_count, 0) = 0 or v_day_count <> jsonb_array_length(new.dates)
     or new.days_count is distinct from v_day_count then
    raise exception 'Select unique leave dates and a matching day count.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(v_dates) d where extract(year from d)::integer <> new.year) then
    raise exception 'Each request must contain dates from one calendar year.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.dates is distinct from old.dates) then
    if v_dates[1] < (now() at time zone 'Africa/Accra')::date then
      raise exception 'Choose today or a future leave date.' using errcode = '23514';
    end if;
    if exists (select 1 from unnest(v_dates) d where extract(isodow from d) > 5) then
      raise exception 'Leave dates must be Monday to Friday.' using errcode = '23514';
    end if;
    if exists (select 1 from public.leave_holidays h where h.holiday_date = any(v_dates)) and not new.is_emergency then
      raise exception 'The selected dates include a company closure or configured public holiday.' using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1 from public.leave_requests r
    cross join lateral jsonb_array_elements_text(r.dates) d
    where r.id is distinct from new.id and r.agent_key = new.agent_key
      and r.status in ('planned', 'pending', 'approved', 'rescheduled')
      and d = any(select to_char(day, 'YYYY-MM-DD') from unnest(v_dates) day)
  ) then
    raise exception 'You already have leave reserved on a selected date.' using errcode = '23514';
  end if;
  if not new.is_emergency and exists (
    select 1 from public.leave_requests r
    cross join lateral jsonb_array_elements_text(r.dates) d
    where r.id is distinct from new.id and r.agent_key <> new.agent_key
      and r.status in ('planned', 'pending', 'approved', 'rescheduled')
      and d = any(select to_char(day, 'YYYY-MM-DD') from unnest(v_dates) day)
  ) then
    raise exception 'A selected date conflicts with a colleague''s leave. Choose another date.' using errcode = '23514';
  end if;

  select leave_total_days into v_quota from public.app_config where id = 1 for share;
  if v_quota is null or v_quota < 0 or v_quota > 365 then
    raise exception 'Management must configure the annual leave allowance before dates can be reserved.' using errcode = '23514';
  end if;
  select coalesce(sum(r.days_count), 0) into v_reserved
  from public.leave_requests r
  where r.agent_key = new.agent_key and r.year = new.year
    and r.id is distinct from new.id and r.deduct_quota = true
    and r.status in ('planned', 'pending', 'approved', 'rescheduled');
  -- Emergency applications can reach Management over quota; approval still
  -- needs either available allowance or Management's explicit exemption.
  if new.deduct_quota and v_reserved + v_day_count > v_quota
     and (not new.is_emergency or new.status = 'approved') then
    raise exception 'These dates exceed the staff member''s annual allowance.' using errcode = '23514';
  end if;
  new.dates := to_jsonb(v_dates);
  return new;
end;
$$;

drop trigger if exists validate_leave_reservation on public.leave_requests;
create trigger validate_leave_reservation
  before insert or update on public.leave_requests
  for each row execute function public.validate_leave_reservation();
revoke all on function public.validate_leave_reservation() from public, anon, authenticated;

create or replace function public.get_leave_conflict_dates(
  p_start_date date,
  p_end_date date,
  p_exclude_request_id uuid default null
)
returns table (conflict_date date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.my_key() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date - p_start_date > 366 then
    raise exception 'Availability range must be between 1 and 367 days.' using errcode = '22023';
  end if;

  return query
  select distinct dates.value::date
  from public.leave_requests as request
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(request.dates) = 'array' then request.dates else '[]'::jsonb end
  ) as dates(value)
  where request.agent_key <> public.my_key()
    and request.status in ('planned', 'pending', 'approved', 'rescheduled')
    and request.id is distinct from p_exclude_request_id
    and dates.value ~ '^\d{4}-\d{2}-\d{2}$'
    and dates.value::date between p_start_date and p_end_date
  order by 1;
end;
$$;

create or replace function public.get_leave_assignee_conflicts(
  p_staff_keys text[],
  p_start_date date,
  p_end_date date
)
returns table (staff_key text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.my_key() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_staff_keys), 0) > 100 then
    raise exception 'A maximum of 100 assignees can be checked.' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date - p_start_date > 366 then
    raise exception 'Availability range must be between 1 and 367 days.' using errcode = '22023';
  end if;

  return query
  select distinct request.agent_key
  from public.leave_requests as request
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(request.dates) = 'array' then request.dates else '[]'::jsonb end
  ) as dates(value)
  where request.agent_key = any(coalesce(p_staff_keys, array[]::text[]))
    and request.status in ('planned', 'pending', 'approved', 'rescheduled')
    and dates.value ~ '^\d{4}-\d{2}-\d{2}$'
    and dates.value::date between p_start_date and p_end_date;
end;
$$;

revoke all on function public.get_leave_conflict_dates(date, date, uuid) from public, anon;
grant execute on function public.get_leave_conflict_dates(date, date, uuid) to authenticated;
revoke all on function public.get_leave_assignee_conflicts(text[], date, date) from public, anon;
grant execute on function public.get_leave_assignee_conflicts(text[], date, date) to authenticated;
revoke all on function public.guard_staff_leave_request_update() from public, anon, authenticated;

comment on function public.get_leave_conflict_dates(date, date, uuid) is
  'Returns only unavailable dates for other staff leave, for a bounded date range. Does not expose request identity, status, notes, or letter content.';
