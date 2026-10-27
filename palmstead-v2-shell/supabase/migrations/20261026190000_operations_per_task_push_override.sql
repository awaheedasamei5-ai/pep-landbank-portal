-- An assignee can replace their private task-device default for one timed task.
-- No SMS or missed-task timing is changed.
create table app_schedule_private.op_todo_push_overrides (
  todo_id uuid not null references public.op_todos(id) on delete cascade,
  recipient_key text not null,
  advance_minutes integer not null check (advance_minutes in (0, 15, 60, 1440)),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (todo_id, recipient_key)
);
alter table app_schedule_private.op_todo_push_overrides enable row level security;
revoke all on app_schedule_private.op_todo_push_overrides from public, anon, authenticated;
grant select, insert, update, delete on app_schedule_private.op_todo_push_overrides to service_role;

create or replace function app_schedule_private.get_my_todo_push_override(p_todo_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
set row_security = off
as $$
declare
  v_key text;
  v_assignee text;
  v_default integer;
  v_override integer;
begin
  select p.agent_key into v_key from public.profiles p
  where p.id = auth.uid() and p.active is true and p.agent_key is not null;
  if v_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;
  select t.assigned_to into v_assignee from public.op_todos t where t.id = p_todo_id;
  if v_assignee is distinct from v_key then
    raise exception 'This task is not assigned to your account.' using errcode = '42501';
  end if;
  select p.advance_minutes into v_default
  from app_schedule_private.op_task_push_preferences p where p.agent_key = v_key;
  select o.advance_minutes into v_override
  from app_schedule_private.op_todo_push_overrides o
  where o.todo_id = p_todo_id and o.recipient_key = v_key;
  return jsonb_build_object('defaultMinutes', coalesce(v_default, 0),
                            'overrideMinutes', v_override,
                            'effectiveMinutes', coalesce(v_override, v_default, 0));
end;
$$;

create or replace function app_schedule_private.set_my_todo_push_override(
  p_todo_id uuid, p_minutes integer
)
returns jsonb
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
declare
  v_key text;
  v_todo public.op_todos%rowtype;
  v_default integer := 0;
  v_effective integer;
  v_now timestamptz := clock_timestamp();
  v_due timestamptz;
  v_reminder timestamptz;
begin
  if p_minutes is not null and p_minutes not in (0, 15, 60, 1440) then
    raise exception 'Choose a supported reminder time.' using errcode = '22023';
  end if;
  select p.agent_key into v_key from public.profiles p
  where p.id = auth.uid() and p.active is true and p.agent_key is not null;
  if v_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;
  select * into v_todo from public.op_todos t where t.id = p_todo_id for update;
  if not found or v_todo.assigned_to is distinct from v_key then
    raise exception 'This task is not assigned to your account.' using errcode = '42501';
  end if;
  if v_todo.status <> 'open' or v_todo.start_time is null then
    raise exception 'Only an open timed task can have a device reminder override.' using errcode = '22023';
  end if;
  v_due := ((v_todo.item_date + v_todo.start_time) at time zone 'Africa/Accra');
  if v_due <= v_now then
    raise exception 'The task has already started.' using errcode = '22023';
  end if;
  select p.advance_minutes into v_default
  from app_schedule_private.op_task_push_preferences p where p.agent_key = v_key;
  v_default := coalesce(v_default, 0);
  v_effective := coalesce(p_minutes, v_default);
  if p_minutes is null then
    delete from app_schedule_private.op_todo_push_overrides o
    where o.todo_id = p_todo_id and o.recipient_key = v_key;
  else
    insert into app_schedule_private.op_todo_push_overrides
      (todo_id, recipient_key, advance_minutes, updated_at)
    values (p_todo_id, v_key, p_minutes, v_now)
    on conflict (todo_id, recipient_key) do update
      set advance_minutes = excluded.advance_minutes, updated_at = excluded.updated_at;
  end if;
  v_reminder := greatest(v_due - make_interval(mins => v_effective), v_now);
  -- A provider call already in flight may not be recalled. Do not duplicate sent events.
  update public.op_todo_push_outbox event
  set advance_minutes = v_effective, scheduled_for = v_reminder,
      next_attempt_at = v_reminder, status = 'queued', lease_until = null,
      updated_at = v_now
  where event.todo_id = p_todo_id and event.recipient_key = v_key
    and event.event_kind = 'due' and event.status in ('queued', 'retry');
  return jsonb_build_object('defaultMinutes', v_default,
                            'overrideMinutes', p_minutes,
                            'effectiveMinutes', v_effective);
end;
$$;

create or replace function public.get_my_op_todo_push_override(p_todo_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_schedule_private.get_my_todo_push_override(p_todo_id) $$;
create or replace function public.set_my_op_todo_push_override(p_todo_id uuid, p_minutes integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_schedule_private.set_my_todo_push_override(p_todo_id, p_minutes) $$;
revoke all on function app_schedule_private.get_my_todo_push_override(uuid) from public, anon;
revoke all on function app_schedule_private.set_my_todo_push_override(uuid,integer) from public, anon;
grant execute on function app_schedule_private.get_my_todo_push_override(uuid) to authenticated;
grant execute on function app_schedule_private.set_my_todo_push_override(uuid,integer) to authenticated;
revoke all on function public.get_my_op_todo_push_override(uuid) from public, anon;
revoke all on function public.set_my_op_todo_push_override(uuid,integer) from public, anon;
grant execute on function public.get_my_op_todo_push_override(uuid) to authenticated;
grant execute on function public.set_my_op_todo_push_override(uuid,integer) to authenticated;

-- A personal default change affects only tasks that still inherit that default.
create or replace function app_schedule_private.save_my_task_push_preference(p_minutes integer)
returns integer
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
declare
  v_key text;
  v_now timestamptz := clock_timestamp();
begin
  if p_minutes is null or p_minutes not in (0, 15, 60, 1440) then
    raise exception 'Choose a supported reminder time.' using errcode = '22023';
  end if;
  select p.agent_key into v_key from public.profiles p
  where p.id = auth.uid() and p.active is true and p.agent_key is not null;
  if v_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;
  insert into app_schedule_private.op_task_push_preferences(agent_key, advance_minutes, updated_at)
  values (v_key, p_minutes, v_now)
  on conflict (agent_key) do update
    set advance_minutes = excluded.advance_minutes, updated_at = excluded.updated_at;

  update public.op_todo_push_outbox event
  set status = case
      when todo.status = 'open' and todo.assigned_to = v_key
        and ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') > v_now
      then 'queued' else 'cancelled' end,
      advance_minutes = p_minutes,
      scheduled_for = greatest(
        ((todo.item_date + todo.start_time) at time zone 'Africa/Accra')
          - make_interval(mins => p_minutes), v_now),
      next_attempt_at = greatest(
        ((todo.item_date + todo.start_time) at time zone 'Africa/Accra')
          - make_interval(mins => p_minutes), v_now),
      lease_until = null, updated_at = v_now
  from public.op_todos todo
  where event.todo_id = todo.id and event.recipient_key = v_key
    and event.event_kind = 'due' and event.status in ('queued', 'retry')
    and not exists (
      select 1 from app_schedule_private.op_todo_push_overrides o
      where o.todo_id = todo.id and o.recipient_key = v_key
    );
  return p_minutes;
end;
$$;

-- Future edits, reassignment and recurrence generation use the current assignee's setting.
create or replace function public.enqueue_op_todo_push_reminders()
returns trigger
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_due timestamptz;
  v_deadline timestamptz;
  v_missed timestamptz;
  v_grace integer := 30;
  v_advance integer := 0;
  v_reminder timestamptz;
  v_signature text;
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.assigned_to is not distinct from old.assigned_to
     and new.item_date is not distinct from old.item_date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.status is not distinct from old.status then
    return new;
  end if;
  update public.op_todo_push_outbox
  set status = 'cancelled', lease_until = null, updated_at = v_now,
      last_error_code = 'task_changed'
  where todo_id = new.id and status in ('queued', 'retry', 'sending');
  if new.status <> 'open' or new.start_time is null or new.assigned_to is null then
    return new;
  end if;
  select coalesce(settings.missed_grace_minutes, 30) into v_grace
  from public.op_todo_reminder_settings settings
  where settings.singleton limit 1;
  select coalesce(
    (select o.advance_minutes from app_schedule_private.op_todo_push_overrides o
     where o.todo_id = new.id and o.recipient_key = new.assigned_to),
    (select p.advance_minutes from app_schedule_private.op_task_push_preferences p
     where p.agent_key = new.assigned_to), 0) into v_advance;
  v_due := ((new.item_date + new.start_time) at time zone 'Africa/Accra');
  v_deadline := ((new.item_date + coalesce(new.end_time, new.start_time)) at time zone 'Africa/Accra');
  v_missed := v_deadline + make_interval(mins => greatest(0, least(coalesce(v_grace, 30), 1440)));
  v_reminder := greatest(v_due - make_interval(mins => v_advance), v_now);
  v_signature := md5(concat_ws(chr(31), new.title, new.assigned_to, new.item_date::text,
                                coalesce(new.start_time::text, ''), coalesce(new.end_time::text, '')));
  insert into public.op_todo_push_outbox (
    todo_id, event_kind, task_signature, recipient_key, task_title, scheduled_for,
    status, next_attempt_at, advance_minutes
  ) values
    (new.id, 'due', v_signature, new.assigned_to, left(new.title, 160),
      v_reminder, 'queued', v_reminder, v_advance),
    (new.id, 'missed', v_signature, new.assigned_to, left(new.title, 160),
      v_missed, 'queued', greatest(v_missed, v_now), 0)
  on conflict (todo_id, event_kind, task_signature) do update
    set recipient_key = excluded.recipient_key,
        task_title = excluded.task_title,
        scheduled_for = excluded.scheduled_for,
        advance_minutes = excluded.advance_minutes,
        status = 'queued', attempt_count = 0, next_attempt_at = excluded.next_attempt_at,
        lease_until = null, accepted_devices = 0, last_error_code = null,
        updated_at = v_now
    where public.op_todo_push_outbox.status in ('cancelled', 'failed', 'blocked', 'unsubscribed');
  return new;
end;
$$;
revoke all on function public.enqueue_op_todo_push_reminders() from public, anon, authenticated;

comment on table app_schedule_private.op_todo_push_overrides is
  'Private per-assignee device alert override for one Operations task.';
