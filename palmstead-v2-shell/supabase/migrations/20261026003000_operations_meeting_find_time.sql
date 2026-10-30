-- Suggest working-hour meeting slots without exposing another person's work.
create or replace function app_schedule_private.suggest_meeting_slots(
  p_item_date date,
  p_preferred_start time without time zone,
  p_duration_minutes integer,
  p_organizer_key text,
  p_invitee_keys text[],
  p_exclude_id uuid default null
)
returns table(
  slot_start time without time zone,
  slot_end time without time zone,
  busy_invitee_count integer,
  invitee_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_keys text[];
  v_invitee_count integer;
  v_preferred_minutes integer;
begin
  select p.* into v_actor
  from public.profiles p
  where p.id = auth.uid() and p.active is true and p.agent_key is not null;
  if not found then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;
  if p_organizer_key is null or (v_actor.role <> 'manager' and p_organizer_key <> v_actor.agent_key) then
    raise exception 'Only the organizer or Management can find a meeting time.' using errcode = '42501';
  end if;
  if p_item_date is null or p_preferred_start is null or p_duration_minutes not between 15 and 180 then
    raise exception 'Choose a date, preferred time, and duration from 15 to 180 minutes.' using errcode = '22023';
  end if;
  if p_exclude_id is not null and not exists (
    select 1 from public.schedule_items meeting
    where meeting.id = p_exclude_id and meeting.kind = 'meeting'
      and meeting.owner_key = p_organizer_key
  ) then
    raise exception 'The meeting being edited does not belong to this organizer.' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.array_agg(distinct requested.key order by requested.key), array[]::text[])
  into v_keys
  from pg_catalog.unnest(pg_catalog.array_append(coalesce(p_invitee_keys, array[]::text[]), p_organizer_key))
    as requested(key);
  if pg_catalog.cardinality(v_keys) > 101 or exists (
    select 1 from pg_catalog.unnest(v_keys) as requested(key)
    where requested.key is null or requested.key = '' or not exists (
      select 1 from public.profiles person
      where person.agent_key = requested.key and person.active is true
    )
  ) then
    raise exception 'Choose at most 100 active staff invitees.' using errcode = '22023';
  end if;
  v_invitee_count := pg_catalog.cardinality(v_keys) - 1;
  v_preferred_minutes := extract(hour from p_preferred_start)::integer * 60
    + extract(minute from p_preferred_start)::integer;

  return query
  with candidate as (
    select minute_of_day,
      pg_catalog.make_time(minute_of_day / 60, minute_of_day % 60, 0) as starts_at,
      pg_catalog.make_time((minute_of_day + p_duration_minutes) / 60,
        (minute_of_day + p_duration_minutes) % 60, 0) as ends_at
    from pg_catalog.generate_series(9 * 60, 18 * 60 - p_duration_minutes, 30) as minute_of_day
  ), availability as (
    select candidate.minute_of_day,
      busy.staff_key,
      (busy.task_count + busy.meeting_count > 0) as is_busy
    from candidate
    cross join lateral public.check_schedule_meeting_availability(
      p_item_date, candidate.starts_at, candidate.ends_at, v_keys, p_exclude_id
    ) busy
    where (p_item_date + candidate.starts_at) at time zone 'Africa/Accra' > pg_catalog.now()
  ), ranked as (
    select availability.minute_of_day,
      pg_catalog.count(*) filter (
        where availability.staff_key <> p_organizer_key and availability.is_busy
      )::integer as busy_count
    from availability
    group by availability.minute_of_day
    having pg_catalog.bool_and(not availability.is_busy)
      filter (where availability.staff_key = p_organizer_key)
  )
  select pg_catalog.make_time(ranked.minute_of_day / 60, ranked.minute_of_day % 60, 0),
    pg_catalog.make_time((ranked.minute_of_day + p_duration_minutes) / 60,
      (ranked.minute_of_day + p_duration_minutes) % 60, 0),
    ranked.busy_count, v_invitee_count
  from ranked
  order by ranked.busy_count, pg_catalog.abs(ranked.minute_of_day - v_preferred_minutes), ranked.minute_of_day
  limit 5;
end;
$$;

create or replace function public.suggest_schedule_meeting_slots(
  p_item_date date,
  p_preferred_start time without time zone,
  p_duration_minutes integer,
  p_organizer_key text,
  p_invitee_keys text[],
  p_exclude_id uuid default null
)
returns table(
  slot_start time without time zone,
  slot_end time without time zone,
  busy_invitee_count integer,
  invitee_count integer
)
language sql
security invoker
set search_path = ''
as $$
  select * from app_schedule_private.suggest_meeting_slots(
    p_item_date, p_preferred_start, p_duration_minutes, p_organizer_key, p_invitee_keys, p_exclude_id
  )
$$;

revoke all on function app_schedule_private.suggest_meeting_slots(date,time without time zone,integer,text,text[],uuid)
  from public, anon;
grant execute on function app_schedule_private.suggest_meeting_slots(date,time without time zone,integer,text,text[],uuid)
  to authenticated;
revoke all on function public.suggest_schedule_meeting_slots(date,time without time zone,integer,text,text[],uuid)
  from public, anon;
grant execute on function public.suggest_schedule_meeting_slots(date,time without time zone,integer,text,text[],uuid)
  to authenticated;
