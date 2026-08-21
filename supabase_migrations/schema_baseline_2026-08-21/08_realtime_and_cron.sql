-- ============ REALTIME PUBLICATION MEMBERSHIP ============

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.banners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contract_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.memo_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.memos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.plot_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_item_invitees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_visit_feedback;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_visit_forms;

-- ============ SCHEDULED JOBS (pg_cron) ============
-- Note: the Authorization header on job 5 carries the project's anon
-- (publishable) key -- the same key already shipped in the client-side app
-- bundle, safe to store here since it carries no elevated privilege.

select cron.schedule('monthly-commission-check', '0 6 * * *', $$select run_monthly_commission_check();$$);
select cron.schedule('backup-6am', '0 6 * * *', $$select public.create_backup('scheduled');$$);
select cron.schedule('backup-2pm', '0 14 * * *', $$select public.create_backup('scheduled');$$);
select cron.schedule('backup-10pm', '0 22 * * *', $$select public.create_backup('scheduled');$$);
select cron.schedule('send-todo-alarms-every-minute', '* * * * *', $$
  select net.http_post(
    url:='https://lrahgcnftetnyxunaljs.supabase.co/functions/v1/send-todo-alarms',
    headers:=jsonb_build_object(
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyYWhnY25mdGV0bnl4dW5hbGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MTQwOTAsImV4cCI6MjEwMDI5MDA5MH0.zU-PbScaadUG1jNej_P1RnwZHa_X6qwp15QisQlTPD4',
      'Content-Type','application/json'
    ),
    body:='{}'::jsonb
  );
  $$);
