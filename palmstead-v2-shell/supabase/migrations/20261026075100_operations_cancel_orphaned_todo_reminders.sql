-- One-time cleanup for task rows deleted before the delete trigger existed.
-- Preserve the outbox history and mark only reminders that are still pending.
update public.op_todo_sms_outbox sms
set status = 'cancelled', lease_until = null,
    last_error = 'Task deleted before the reminder was sent.',
    updated_at = pg_catalog.clock_timestamp()
where sms.status in ('queued', 'blocked')
  and not exists (select 1 from public.op_todos todo where todo.id = sms.todo_id);

update public.op_todo_push_outbox push
set status = 'cancelled', lease_until = null,
    last_error_code = 'task_deleted',
    updated_at = pg_catalog.clock_timestamp()
where push.status in ('queued', 'retry')
  and not exists (select 1 from public.op_todos todo where todo.id = push.todo_id);
