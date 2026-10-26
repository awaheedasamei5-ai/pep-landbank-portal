-- A hard-deleted task must not retain a queued SMS or device alarm.
create or replace function app_operations_private.cancel_deleted_todo_reminders()
returns trigger
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
begin
  update public.op_todo_sms_outbox sms
  set status = 'cancelled', lease_until = null,
      last_error = 'Task deleted before the reminder was sent.',
      updated_at = pg_catalog.clock_timestamp()
  where sms.todo_id = old.id and sms.status in ('queued', 'blocked');

  update public.op_todo_push_outbox push
  set status = 'cancelled', lease_until = null,
      last_error_code = 'task_deleted',
      updated_at = pg_catalog.clock_timestamp()
  where push.todo_id = old.id and push.status in ('queued', 'retry');

  return old;
end;
$$;

revoke all on function app_operations_private.cancel_deleted_todo_reminders()
  from public, anon, authenticated, service_role;
create trigger cancel_deleted_todo_reminders
  after delete on public.op_todos
  for each row execute function app_operations_private.cancel_deleted_todo_reminders();
