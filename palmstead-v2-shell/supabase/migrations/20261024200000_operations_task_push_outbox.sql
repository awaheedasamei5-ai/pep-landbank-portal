-- Durable Web Push reminders for the active Operations planner (op_todos).
-- User opt-in lives in push_subscriptions; the server outbox owns timing,
-- deduplication, cancellation and retry independently of an open browser tab.

create table if not exists public.op_todo_push_outbox (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null,
  event_kind text not null check (event_kind in ('due', 'missed')),
  task_signature text not null,
  recipient_key text not null,
  task_title text not null,
  scheduled_for timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'retry', 'failed', 'blocked', 'unsubscribed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  accepted_devices integer not null default 0 check (accepted_devices >= 0),
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (todo_id, event_kind, task_signature)
);

create index if not exists op_todo_push_outbox_due_idx
  on public.op_todo_push_outbox (next_attempt_at, scheduled_for)
  where status in ('queued', 'retry');
create index if not exists op_todo_push_outbox_todo_idx
  on public.op_todo_push_outbox (todo_id, status);

alter table public.op_todo_push_outbox enable row level security;
revoke all on public.op_todo_push_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.op_todo_push_outbox to service_role;

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

  select coalesce(settings.missed_grace_minutes, 30)
  into v_grace
  from public.op_todo_reminder_settings settings
  where settings.singleton
  limit 1;

  v_due := ((new.item_date + new.start_time) at time zone 'Africa/Accra');
  v_deadline := ((new.item_date + coalesce(new.end_time, new.start_time)) at time zone 'Africa/Accra');
  v_missed := v_deadline + make_interval(mins => greatest(0, least(coalesce(v_grace, 30), 1440)));
  v_signature := md5(concat_ws(chr(31), new.title, new.assigned_to, new.item_date::text,
                                coalesce(new.start_time::text, ''), coalesce(new.end_time::text, '')));

  insert into public.op_todo_push_outbox (
    todo_id, event_kind, task_signature, recipient_key, task_title, scheduled_for, status, next_attempt_at
  ) values
    (new.id, 'due', v_signature, new.assigned_to, left(new.title, 160), v_due, 'queued', greatest(v_due, v_now)),
    (new.id, 'missed', v_signature, new.assigned_to, left(new.title, 160), v_missed, 'queued', greatest(v_missed, v_now))
  on conflict (todo_id, event_kind, task_signature) do update
    set recipient_key = excluded.recipient_key,
        task_title = excluded.task_title,
        scheduled_for = excluded.scheduled_for,
        status = 'queued', attempt_count = 0, next_attempt_at = excluded.next_attempt_at,
        lease_until = null, accepted_devices = 0, last_error_code = null,
        updated_at = v_now
    where public.op_todo_push_outbox.status in ('cancelled', 'failed', 'blocked', 'unsubscribed');

  return new;
end;
$$;

revoke all on function public.enqueue_op_todo_push_reminders() from public, anon, authenticated;
drop trigger if exists enqueue_op_todo_push_reminders on public.op_todos;
create trigger enqueue_op_todo_push_reminders
  after insert or update of title, assigned_to, item_date, start_time, end_time, status
  on public.op_todos
  for each row execute function public.enqueue_op_todo_push_reminders();

-- Existing upcoming tasks also receive queue rows without sending anything
-- during migration. Tasks already due are not replayed as stale alarms.
with task_times as (
  select todo.*,
         ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') as due_at,
         ((todo.item_date + coalesce(todo.end_time, todo.start_time)) at time zone 'Africa/Accra') as deadline_at,
         md5(concat_ws(chr(31), todo.title, todo.assigned_to, todo.item_date::text,
                       coalesce(todo.start_time::text, ''), coalesce(todo.end_time::text, ''))) as task_signature
  from public.op_todos todo
  where todo.status = 'open' and todo.start_time is not null and todo.assigned_to is not null
)
insert into public.op_todo_push_outbox (
  todo_id, event_kind, task_signature, recipient_key, task_title, scheduled_for, status, next_attempt_at
)
select task.id, 'due', task.task_signature, task.assigned_to, left(task.title, 160), task.due_at, 'queued', task.due_at
from task_times task
where task.due_at >= clock_timestamp()
  and task.due_at <= clock_timestamp() + interval '90 days'
on conflict (todo_id, event_kind, task_signature) do nothing;

with reminder_policy as (
  select coalesce(max(settings.missed_grace_minutes), 30) as grace_minutes
  from public.op_todo_reminder_settings settings
  where settings.singleton
), task_times as (
  select todo.*,
         ((todo.item_date + coalesce(todo.end_time, todo.start_time)) at time zone 'Africa/Accra')
           + make_interval(mins => greatest(0, least(policy.grace_minutes, 1440))) as missed_at,
         md5(concat_ws(chr(31), todo.title, todo.assigned_to, todo.item_date::text,
                       coalesce(todo.start_time::text, ''), coalesce(todo.end_time::text, ''))) as task_signature
  from public.op_todos todo
  cross join reminder_policy policy
  where todo.status = 'open' and todo.start_time is not null and todo.assigned_to is not null
)
insert into public.op_todo_push_outbox (
  todo_id, event_kind, task_signature, recipient_key, task_title, scheduled_for, status, next_attempt_at
)
select task.id, 'missed', task.task_signature, task.assigned_to, left(task.title, 160), task.missed_at, 'queued', task.missed_at
from task_times task
where task.missed_at >= clock_timestamp()
  and task.missed_at <= clock_timestamp() + interval '90 days'
on conflict (todo_id, event_kind, task_signature) do nothing;

create or replace function public.claim_op_todo_push_outbox(p_limit integer default 30)
returns setof public.op_todo_push_outbox
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update public.op_todo_push_outbox event
  set status = case when event.attempt_count < 5 then 'retry' else 'failed' end,
      next_attempt_at = clock_timestamp(), lease_until = null,
      last_error_code = 'worker_lease_expired', updated_at = clock_timestamp()
  where event.status = 'sending' and event.lease_until < clock_timestamp();

  return query
  with candidates as (
    select event.id
    from public.op_todo_push_outbox event
    where event.status in ('queued', 'retry')
      and event.scheduled_for <= clock_timestamp()
      and event.next_attempt_at <= clock_timestamp()
    order by event.scheduled_for, event.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  )
  update public.op_todo_push_outbox event
  set status = 'sending', attempt_count = event.attempt_count + 1,
      lease_until = clock_timestamp() + interval '2 minutes', updated_at = clock_timestamp()
  from candidates
  where event.id = candidates.id
  returning event.*;
end;
$$;

revoke all on function public.claim_op_todo_push_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_op_todo_push_outbox(integer) to service_role;

create or replace function public.finish_op_todo_push_delivery(
  p_id uuid,
  p_attempt_count integer,
  p_outcome text,
  p_accepted_devices integer default 0,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_status text;
  v_next_attempt timestamptz := clock_timestamp() + make_interval(secs => least(21600, 60 * power(2, greatest(p_attempt_count, 0))::integer));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_outcome = 'sent' then
    v_status := 'sent';
  elsif p_outcome = 'cancelled' then
    v_status := 'cancelled';
  elsif p_outcome = 'unsubscribed' then
    v_status := 'unsubscribed';
  elsif p_outcome = 'blocked' then
    v_status := 'blocked';
  elsif p_outcome = 'retry' and p_attempt_count < 5 then
    v_status := 'retry';
  else
    v_status := 'failed';
  end if;

  update public.op_todo_push_outbox
  set status = v_status,
      accepted_devices = greatest(0, coalesce(p_accepted_devices, 0)),
      last_error_code = left(nullif(p_error_code, ''), 80),
      next_attempt_at = case when v_status = 'retry' then v_next_attempt else next_attempt_at end,
      lease_until = null,
      updated_at = clock_timestamp()
  where id = p_id and status = 'sending' and attempt_count = p_attempt_count;

  return found;
end;
$$;

revoke all on function public.finish_op_todo_push_delivery(uuid, integer, text, integer, text) from public, anon, authenticated;
grant execute on function public.finish_op_todo_push_delivery(uuid, integer, text, integer, text) to service_role;

-- Reclaim an abandoned worker lease without duplicating the event.
update public.op_todo_push_outbox
set status = case when attempt_count < 5 then 'retry' else 'failed' end,
    next_attempt_at = clock_timestamp(), lease_until = null,
    last_error_code = 'worker_lease_expired', updated_at = clock_timestamp()
where status = 'sending' and lease_until < clock_timestamp();

comment on table public.op_todo_push_outbox is
  'Private server queue for opt-in due-time and missed-task Web Push reminders. Payloads contain no staff phone number.';
