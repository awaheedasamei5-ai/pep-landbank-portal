-- Reliable follow-up SMS for timed Operations to-dos that remain open.
-- Existing due-time SMS remains in place; this adds a single 15-minute
-- missed-task follow-up and records provider outcomes without retrying an
-- ambiguous provider response. Historical overdue tasks are excluded by the
-- cutover timestamp so applying this migration cannot send a backlog burst.

alter table public.op_todos
  add column if not exists sms_missed_notified_at timestamptz;

create table if not exists public.op_todo_reminder_settings (
  singleton boolean primary key default true check (singleton),
  missed_sms_enabled_after timestamptz not null default clock_timestamp(),
  missed_grace_minutes integer not null default 15 check (missed_grace_minutes between 5 and 240)
);

insert into public.op_todo_reminder_settings(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.op_todo_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null,
  event_kind text not null check (event_kind = 'missed'),
  idempotency_key text not null unique,
  recipient_key text not null,
  recipient_phone text,
  scheduled_for timestamptz not null,
  message_body text not null,
  status text not null default 'queued'
    check (status in ('queued','sending','accepted','failed','needs_review','cancelled','blocked')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  provider_accepted_at timestamptz,
  provider_reference text,
  last_error text,
  provider_status jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (todo_id, event_kind)
);

alter table public.op_todo_reminder_settings enable row level security;
alter table public.op_todo_sms_outbox enable row level security;
revoke all on public.op_todo_reminder_settings, public.op_todo_sms_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.op_todo_reminder_settings, public.op_todo_sms_outbox to service_role;

create index if not exists op_todo_sms_outbox_claim_idx
  on public.op_todo_sms_outbox(next_attempt_at, created_at)
  where status = 'queued';

create index if not exists op_todos_missed_reminder_scan_idx
  on public.op_todos(item_date, start_time)
  where status = 'open' and start_time is not null and sms_missed_notified_at is null;

create or replace function public.enqueue_op_todo_missed_sms()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
begin
  -- A task completed, cancelled, rescheduled, reassigned, or moved after its
  -- reminder was queued must not receive a stale message.
  update public.op_todo_sms_outbox outbox
  set status = 'cancelled', lease_until = null, updated_at = v_now,
      last_error = 'Task changed before the missed reminder was sent.'
  where outbox.status = 'queued'
    and not exists (
      select 1 from public.op_todos todo
      where todo.id = outbox.todo_id
        and todo.status = 'open'
        and todo.assigned_to = outbox.recipient_key
        and ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') = outbox.scheduled_for
    );

  insert into public.op_todo_sms_outbox(
    todo_id, event_kind, idempotency_key, recipient_key, recipient_phone,
    scheduled_for, message_body, status, next_attempt_at
  )
  select todo.id,
         'missed',
         todo.id::text || ':missed:' || to_char(((todo.item_date + todo.start_time) at time zone 'Africa/Accra'), 'YYYYMMDDHH24MI'),
         todo.assigned_to,
         nullif(btrim(profile.phone), ''),
         ((todo.item_date + todo.start_time) at time zone 'Africa/Accra'),
         'Missed Operations task: "' || left(todo.title, 90) || '" was due ' ||
           to_char(((todo.item_date + todo.start_time) at time zone 'Africa/Accra'), 'DD Mon at HH24:MI') ||
           ' and is still open. Please update it in Palmstead.',
         case when nullif(btrim(profile.phone), '') is null then 'blocked' else 'queued' end,
         v_now
  from public.op_todos todo
  join public.op_todo_reminder_settings settings on settings.singleton
  left join public.profiles profile on profile.agent_key = todo.assigned_to
  where todo.status = 'open'
    and todo.start_time is not null
    and todo.sms_missed_notified_at is null
    and ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') >= settings.missed_sms_enabled_after
    and ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') <= v_now - make_interval(mins => settings.missed_grace_minutes)
  on conflict (todo_id, event_kind) do update
  set recipient_key = excluded.recipient_key,
      recipient_phone = excluded.recipient_phone,
      scheduled_for = excluded.scheduled_for,
      idempotency_key = excluded.idempotency_key,
      message_body = excluded.message_body,
      status = excluded.status,
      next_attempt_at = excluded.next_attempt_at,
      updated_at = v_now,
      last_error = case when excluded.status = 'blocked' then 'Assigned staff member has no phone number on file.' else null end
  where public.op_todo_sms_outbox.status in ('blocked','cancelled');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.claim_op_todo_sms_outbox(p_limit integer default 10)
returns setof public.op_todo_sms_outbox
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  update public.op_todo_sms_outbox
  set status = 'needs_review', last_error = 'Worker stopped before recording the provider outcome. Check provider history before retrying.', lease_until = null, updated_at = now()
  where status = 'sending' and lease_until < now();

  return query
  with candidates as (
    select outbox.id
    from public.op_todo_sms_outbox outbox
    join public.op_todos todo on todo.id = outbox.todo_id
    where outbox.status = 'queued'
      and outbox.next_attempt_at <= now()
      and todo.status = 'open'
      and todo.assigned_to = outbox.recipient_key
      and ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') = outbox.scheduled_for
    order by outbox.next_attempt_at, outbox.created_at
    for update of outbox skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  )
  update public.op_todo_sms_outbox outbox
  set status = 'sending', attempt_count = outbox.attempt_count + 1,
      lease_until = now() + interval '5 minutes', updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.verify_op_todo_sms_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select p_token is not null
    and p_token = (select decrypted_secret from vault.decrypted_secrets where name = 'op_todo_sms_worker_token' limit 1)
$$;

create or replace function public.dispatch_op_todo_missed_sms()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
set row_security = off
as $$
declare
  v_token text;
begin
  perform public.enqueue_op_todo_missed_sms();
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'op_todo_sms_worker_token' limit 1;
  if v_token is null then raise exception 'Operations SMS worker token is not configured.'; end if;
  perform net.http_post(
    url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/process-op-todo-missed-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_token),
    body := jsonb_build_object('source', 'operations_missed_task_reminder')
  );
end;
$$;

revoke all on function public.enqueue_op_todo_missed_sms() from public, anon, authenticated;
revoke all on function public.claim_op_todo_sms_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_op_todo_sms_outbox(integer) to service_role;
revoke all on function public.verify_op_todo_sms_worker_token(text) from public, anon, authenticated;
grant execute on function public.verify_op_todo_sms_worker_token(text) to service_role;
revoke all on function public.dispatch_op_todo_missed_sms() from public, anon, authenticated;
-- The legacy due-time cron still needs this function as its owner, but no API
-- role should be able to trigger paid SMS delivery over PostgREST.
revoke all on function public.send_op_todos_sms_reminders() from public, anon, authenticated;

do $$
declare v_job_id bigint;
begin
  if not exists (select 1 from vault.secrets where name = 'op_todo_sms_worker_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'op_todo_sms_worker_token', 'Internal token for the Operations missed-task SMS worker');
  end if;
  select jobid into v_job_id from cron.job where jobname = 'send-op-todo-missed-sms-reminders' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('send-op-todo-missed-sms-reminders', '* * * * *', 'select public.dispatch_op_todo_missed_sms();');
end;
$$;
