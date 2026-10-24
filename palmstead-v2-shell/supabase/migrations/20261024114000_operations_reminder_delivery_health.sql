-- Route scheduled-start and missed-task texts through the provider worker.
-- Task SMS timestamps are recorded only after provider acceptance.
alter table public.op_todo_sms_outbox
  drop constraint if exists op_todo_sms_outbox_event_kind_check;
alter table public.op_todo_sms_outbox
  add constraint op_todo_sms_outbox_event_kind_check check (event_kind in ('due', 'missed'));

create or replace function public.enqueue_op_todo_due_sms()
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
begin
  update public.op_todo_sms_outbox outbox
  set status = 'cancelled', lease_until = null, updated_at = v_now,
      last_error = 'Task changed before the due reminder was sent.'
  where outbox.event_kind = 'due'
    and outbox.status in ('queued', 'blocked')
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
         'due',
         todo.id::text || ':due:' || to_char(((todo.item_date + todo.start_time) at time zone 'Africa/Accra'), 'YYYYMMDDHH24MI'),
         todo.assigned_to,
         nullif(btrim(profile.phone), ''),
         ((todo.item_date + todo.start_time) at time zone 'Africa/Accra'),
         'Reminder: "' || left(todo.title, 90) || '" is due now (' || to_char(todo.start_time, 'HH24:MI') || ').',
         case when nullif(btrim(profile.phone), '') is null then 'blocked' else 'queued' end,
         v_now
  from public.op_todos todo
  join public.op_todo_reminder_settings settings on settings.singleton
  left join public.profiles profile on profile.agent_key = todo.assigned_to
  where todo.status = 'open'
    and todo.start_time is not null
    and todo.sms_notified_at is null
    and ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') >= settings.missed_sms_enabled_after
    and ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') <= v_now
    and ((todo.item_date + todo.start_time) at time zone 'Africa/Accra') >= v_now - interval '15 minutes'
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
  where public.op_todo_sms_outbox.status in ('blocked', 'cancelled');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.enqueue_op_todo_due_sms() from public, anon, authenticated;

-- Preserve the existing due-time cron entry point, but make it enqueue only.
-- A provider outcome is now handled and recorded by the service-role worker.
create or replace function public.send_op_todos_sms_reminders()
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform public.enqueue_op_todo_due_sms();
end;
$$;
revoke all on function public.send_op_todos_sms_reminders() from public, anon, authenticated;

-- The one-minute worker now drains both due and missed reminders.
create or replace function public.dispatch_op_todo_missed_sms()
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_token text;
begin
  perform public.enqueue_op_todo_due_sms();
  perform public.enqueue_op_todo_missed_sms();
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'op_todo_sms_worker_token'
  limit 1;
  if v_token is null then raise exception 'Operations SMS worker token is not configured.'; end if;
  perform net.http_post(
    url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/process-op-todo-missed-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_token),
    body := jsonb_build_object('source', 'operations_task_reminders')
  );
end;
$$;
revoke all on function public.dispatch_op_todo_missed_sms() from public, anon, authenticated;

-- Management-only projection: no phone number, message body, provider reference,
-- raw provider response, or unredacted error leaves the database.
create or replace function public.get_operations_task_reminder_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_counts jsonb;
  v_messages jsonb;
  v_scheduler jsonb;
  v_grace integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active is true and p.role = 'manager'
  ) then
    raise exception 'Management access required.' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
  into v_counts
  from (
    select outbox.status, count(*) as total
    from public.op_todo_sms_outbox outbox
    group by outbox.status
  ) grouped;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.attention_order, item.updated_at desc), '[]'::jsonb)
  into v_messages
  from (
    select outbox.id,
      outbox.todo_id,
      outbox.event_kind,
      outbox.status,
      outbox.attempt_count,
      outbox.scheduled_for,
      outbox.provider_accepted_at,
      outbox.updated_at,
      coalesce(todo.title, 'Task no longer available') as task_title,
      coalesce(profile.name, outbox.recipient_key, 'Former staff member') as staff_name,
      case
        when outbox.status = 'blocked' then 'Check that the assigned staff profile has a valid phone number.'
        when outbox.status = 'failed' then 'The SMS provider rejected or could not process this message. Check provider configuration.'
        when outbox.status = 'needs_review' then 'The result is uncertain. Check SMS provider history before any resend.'
        when outbox.status = 'queued' and outbox.attempt_count > 0 then 'A provider rate-limit retry is queued.'
        else null
      end as status_detail,
      case
        when outbox.status in ('failed', 'needs_review', 'blocked') then 0
        when outbox.status in ('queued', 'sending') then 1
        when outbox.status = 'accepted' then 2
        else 3
      end as attention_order
    from public.op_todo_sms_outbox outbox
    left join public.op_todos todo on todo.id = outbox.todo_id
    left join public.profiles profile on profile.agent_key = outbox.recipient_key
    order by attention_order, outbox.updated_at desc
    limit 50
  ) item;

  select settings.missed_grace_minutes into v_grace
  from public.op_todo_reminder_settings settings
  where settings.singleton;

  select jsonb_build_object(
    'active', job.active,
    'schedule', job.schedule,
    'last_run_at', run.start_time,
    'last_run_status', run.status
  ) into v_scheduler
  from cron.job job
  left join lateral (
    select details.start_time, details.status
    from cron.job_run_details details
    where details.jobid = job.jobid
    order by details.start_time desc
    limit 1
  ) run on true
  where job.jobname = 'send-op-todo-missed-sms-reminders'
  limit 1;

  return jsonb_build_object(
    'counts', v_counts,
    'messages', v_messages,
    'scheduler', coalesce(v_scheduler, jsonb_build_object('active', false, 'schedule', null, 'last_run_at', null, 'last_run_status', null)),
    'missed_grace_minutes', coalesce(v_grace, 15)
  );
end;
$$;
revoke all on function public.get_operations_task_reminder_health() from public, anon;
grant execute on function public.get_operations_task_reminder_health() to authenticated;
