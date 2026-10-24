-- Cancel queued or blocked missed-task SMS when its source task is completed,
-- canceled, rescheduled, reassigned, or moved to a different time.
create schema if not exists app_operations_private;

create or replace function app_operations_private.cancel_stale_todo_sms()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  if new.status is distinct from old.status
     or new.assigned_to is distinct from old.assigned_to
     or new.item_date is distinct from old.item_date
     or new.start_time is distinct from old.start_time then
    update public.op_todo_sms_outbox
    set status = 'cancelled',
        lease_until = null,
        last_error = 'Task changed before the missed reminder was sent.',
        updated_at = clock_timestamp()
    where todo_id = old.id
      and status in ('queued', 'blocked');
  end if;
  return new;
end;
$$;

revoke all on function app_operations_private.cancel_stale_todo_sms() from public, anon, authenticated, service_role;
revoke all on function public.send_op_todos_sms_reminders() from public, anon, authenticated;

drop trigger if exists cancel_stale_todo_sms on public.op_todos;
create trigger cancel_stale_todo_sms
after update of status, assigned_to, item_date, start_time on public.op_todos
for each row execute function app_operations_private.cancel_stale_todo_sms();
