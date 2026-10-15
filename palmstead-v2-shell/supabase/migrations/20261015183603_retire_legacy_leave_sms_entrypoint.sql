-- The protected outbox replaces the old approved-leave reminder sender,
-- which still has a company-phone fallback and cannot verify SMS outcome.
do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname = 'leave-reminder-7am' loop
    perform cron.alter_job(v_job, active := false);
  end loop;
end;
$$;
revoke all on function public.send_leave_reminders() from public, anon, authenticated;
grant execute on function public.send_leave_reminders() to service_role;
revoke all on function public.next_leave_request_no() from public, anon;
grant execute on function public.next_leave_request_no() to authenticated;
