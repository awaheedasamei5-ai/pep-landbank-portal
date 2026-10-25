-- Serialize writes for one staff member on one local calendar day. Invitees may
-- deliberately accept a busy meeting; only the organizer and task assignee are
-- protected. This complements the privacy-safe availability RPC used by forms.
create or replace function app_schedule_private.assert_staff_slot_available(
  p_staff_key text,
  p_item_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_exclude_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_staff_key is null or p_staff_key = '' or p_item_date is null then
    raise exception 'A staff member and schedule date are required.' using errcode = '22023';
  end if;
  if p_start_time is not null and p_end_time is not null and p_end_time <= p_start_time then
    raise exception 'End time must be after start time.' using errcode = '22023';
  end if;

  -- Every meeting and to-do write takes the same transaction-scoped lock.
  -- A later transaction reads committed rows only after the first has finished.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('palmstead_schedule:' || p_staff_key || ':' || p_item_date::text, 0)
  );

  if exists (
    select 1 from public.op_todos task
    where task.assigned_to = p_staff_key
      and task.item_date = p_item_date
      and task.status not in ('done', 'cancelled', 'rescheduled')
      and task.id is distinct from p_exclude_id
      and coalesce(task.start_time, time '00:00') < coalesce(p_end_time, time '24:00')
      and coalesce(p_start_time, time '00:00') < coalesce(task.end_time, time '24:00')
  ) or exists (
    select 1 from public.schedule_items meeting
    where meeting.kind = 'meeting'
      and meeting.owner_key = p_staff_key
      and meeting.item_date = p_item_date
      and meeting.status not in ('done', 'cancelled', 'rescheduled')
      and meeting.id is distinct from p_exclude_id
      and meeting.start_time < coalesce(p_end_time, time '24:00')
      and coalesce(p_start_time, time '00:00') < meeting.end_time
  ) then
    raise exception 'This staff member already has a task or meeting at that time. Choose another slot.'
      using errcode = '23P01';
  end if;
end;
$$;

create or replace function app_schedule_private.guard_todo_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('done', 'cancelled', 'rescheduled') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status not in ('done', 'cancelled', 'rescheduled')
    and new.assigned_to is not distinct from old.assigned_to
    and new.item_date is not distinct from old.item_date
    and new.start_time is not distinct from old.start_time
    and new.end_time is not distinct from old.end_time then
    return new;
  end if;
  perform app_schedule_private.assert_staff_slot_available(
    new.assigned_to, new.item_date, new.start_time, new.end_time, new.id
  );
  return new;
end;
$$;

create or replace function app_schedule_private.guard_meeting_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'meeting' or new.status in ('done', 'cancelled', 'rescheduled') then
    return new;
  end if;
  if new.item_date is null or new.start_time is null or new.end_time is null then
    raise exception 'A meeting date and time are required.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.kind = 'meeting'
    and old.status not in ('done', 'cancelled', 'rescheduled')
    and new.owner_key is not distinct from old.owner_key
    and new.item_date is not distinct from old.item_date
    and new.start_time is not distinct from old.start_time
    and new.end_time is not distinct from old.end_time then
    return new;
  end if;
  perform app_schedule_private.assert_staff_slot_available(
    new.owner_key, new.item_date, new.start_time, new.end_time, new.id
  );
  return new;
end;
$$;

drop trigger if exists guard_op_todo_slot on public.op_todos;
create trigger guard_op_todo_slot
before insert or update on public.op_todos
for each row execute function app_schedule_private.guard_todo_slot();

drop trigger if exists guard_schedule_meeting_slot on public.schedule_items;
create trigger guard_schedule_meeting_slot
before insert or update on public.schedule_items
for each row execute function app_schedule_private.guard_meeting_slot();

revoke all on function app_schedule_private.assert_staff_slot_available(text,date,time without time zone,time without time zone,uuid)
  from public, anon, authenticated;
revoke all on function app_schedule_private.guard_todo_slot() from public, anon, authenticated;
revoke all on function app_schedule_private.guard_meeting_slot() from public, anon, authenticated;
