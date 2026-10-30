-- Delegated work occupies the assignee, not the person who created it.
-- Staff may see only busy counts, never another person's task or meeting details.
create or replace function public.check_schedule_meeting_availability(
  p_item_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_staff_keys text[],
  p_exclude_id uuid default null
)
returns table(staff_key text, task_count bigint, meeting_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active is true and p.agent_key is not null
  ) then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;
  if p_item_date is null or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Choose a date and an end time after the start time.' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(distinct requested.key order by requested.key), array[]::text[])
  into v_keys
  from pg_catalog.unnest(coalesce(p_staff_keys, array[]::text[])) as requested(key);
  if pg_catalog.cardinality(v_keys) > 101 or exists (
    select 1 from pg_catalog.unnest(v_keys) as requested(key)
    where not exists (
      select 1 from public.profiles p where p.agent_key = requested.key and p.active is true
    )
  ) then
    raise exception 'Select at most 101 active staff members.' using errcode = '22023';
  end if;

  return query
  select person.key,
    (
      select pg_catalog.count(*)
      from public.op_todos task
      where task.item_date = p_item_date
        and task.status not in ('done', 'cancelled', 'rescheduled')
        and task.assigned_to = person.key
        and task.id is distinct from p_exclude_id
        and coalesce(task.start_time, time '00:00') < p_end_time
        and p_start_time < coalesce(task.end_time, time '24:00')
    ),
    (
      select pg_catalog.count(*)
      from public.schedule_items meeting
      where meeting.kind = 'meeting'
        and meeting.item_date = p_item_date
        and meeting.status not in ('done', 'cancelled', 'rescheduled')
        and meeting.id is distinct from p_exclude_id
        and meeting.start_time < p_end_time
        and p_start_time < meeting.end_time
        and (
          meeting.owner_key = person.key or meeting.assigned_to = person.key
          or exists (
            select 1 from public.schedule_item_invitees invitee
            where invitee.schedule_item_id = meeting.id
              and invitee.staff_key = person.key and invitee.status <> 'declined'
          )
        )
    )
  from pg_catalog.unnest(v_keys) as person(key);
end;
$$;

revoke all on function public.check_schedule_meeting_availability(date,time without time zone,time without time zone,text[],uuid) from public, anon;
grant execute on function public.check_schedule_meeting_availability(date,time without time zone,time without time zone,text[],uuid) to authenticated;
