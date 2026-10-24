do $$
declare v_job_id bigint;
begin
  if not exists (select 1 from vault.secrets where name = 'finance_monthly_reminder_worker_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'finance_monthly_reminder_worker_token', 'Internal token for the Finance monthly reminder worker');
  end if;
  select jobid into v_job_id from cron.job where jobname = 'finance-monthly-reminder-queue' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('finance-monthly-reminder-queue', '0 9 * * *', 'select public.queue_finance_monthly_payment_reminders();');
  select jobid into v_job_id from cron.job where jobname = 'finance-monthly-reminder-sms-worker' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('finance-monthly-reminder-sms-worker', '* * * * *', 'select public.dispatch_finance_monthly_reminders();');
end;
$$;

