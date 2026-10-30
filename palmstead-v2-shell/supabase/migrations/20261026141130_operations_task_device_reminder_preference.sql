-- Private, per-recipient default for timed task Web Push alerts.
-- SMS and missed-task alerts keep their existing company policy.
create table app_schedule_private.op_task_push_preferences (
  agent_key text primary key,
  advance_minutes integer not null default 0
    check (advance_minutes in (0, 15, 60, 1440)),
  updated_at timestamptz not null default clock_timestamp()
);
alter table app_schedule_private.op_task_push_preferences enable row level security;
revoke all on app_schedule_private.op_task_push_preferences from public, anon, authenticated;
grant select, insert, update on app_schedule_private.op_task_push_preferences to service_role;

alter table public.op_todo_push_outbox
  add column advance_minutes integer not null default 0
  check (advance_minutes in (0, 15, 60, 1440));

create or replace function app_schedule_private.my_task_push_preference()
returns integer
language plpgsql stable security definer
set search_path = ''
set row_security = off
as $$
declare
  v_key text;
  v_minutes integer;
begin
  select p.agent_key into v_key
  from public.profiles p
  where p.id = auth.uid() and p.active is true and p.agent_key is not null;
  if v_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;
  select preference.advance_minutes into v_minutes
  from app_schedule_private.op_task_push_preferences preference
  where preference.agent_key = v_key;
  return coalesce(v_minutes, 0);
end;
$$;

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
  select p.agent_key into v_key
  from public.profiles p
  where p.id = auth.uid() and p.active is true and p.agent_key is not null;
  if v_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;

  insert into app_schedule_private.op_task_push_preferences(agent_key, advance_minutes, updated_at)
  values (v_key, p_minutes, v_now)
  on conflict (agent_key) do update
    set advance_minutes = excluded.advance_minutes, updated_at = excluded.updated_at;

  -- In-flight deliveries cannot be recalled. Only waiting events are retimed.
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
    and event.event_kind = 'due' and event.status in ('queued', 'retry');
  return p_minutes;
end;
$$;

create or replace function public.get_my_op_task_push_preference()
returns integer
language sql stable security invoker
set search_path = ''
as $$ select app_schedule_private.my_task_push_preference() $$;

create or replace function public.set_my_op_task_push_preference(p_minutes integer)
returns integer
language sql security invoker
set search_path = ''
as $$ select app_schedule_private.save_my_task_push_preference(p_minutes) $$;

revoke all on function app_schedule_private.my_task_push_preference() from public, anon;
revoke all on function app_schedule_private.save_my_task_push_preference(integer) from public, anon;
grant execute on function app_schedule_private.my_task_push_preference() to authenticated;
grant execute on function app_schedule_private.save_my_task_push_preference(integer) to authenticated;
revoke all on function public.get_my_op_task_push_preference() from public, anon;
revoke all on function public.set_my_op_task_push_preference(integer) from public, anon;
grant execute on function public.get_my_op_task_push_preference() to authenticated;
grant execute on function public.set_my_op_task_push_preference(integer) to authenticated;

create or replace function public.enqueue_op_todo_push_reminders()
returns trigger
language plpgsql
security definer
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
  select coalesce(preference.advance_minutes, 0) into v_advance
  from app_schedule_private.op_task_push_preferences preference
  where preference.agent_key = new.assigned_to;
  v_advance := coalesce(v_advance, 0);
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

comment on table app_schedule_private.op_task_push_preferences is
  'Private per-staff default for timed task device alerts; no client table grant.';
