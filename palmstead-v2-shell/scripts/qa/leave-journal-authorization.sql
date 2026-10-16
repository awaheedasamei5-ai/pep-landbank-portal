-- V2 sbydzrlzqxcdbudjaube only. Read-only real-identity checks; always rollback.
begin;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where agent_key='manager' and active and role='manager'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare report jsonb; begin
  report := public.get_leave_report_snapshot(2026);
  if report->>'scope' <> 'management' or not (report->>'journalComplete')::boolean
     or (report->>'journalTotal')::int <> jsonb_array_length(report->'journalEvents') then
    raise exception 'Management journal scope or reconciliation failed';
  end if;
  if has_table_privilege(current_user,'leave_reporting_private.request_journal','INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception 'Application identity can rewrite the journal';
  end if;
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where agent_key='adams' and active and role='agent'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare report jsonb; begin
  report := public.get_leave_report_snapshot(2026);
  if report->>'scope' <> 'personal' or not (report->>'journalComplete')::boolean
     or (report->>'journalTotal')::int <> jsonb_array_length(report->'journalEvents')
     or exists(select 1 from jsonb_array_elements(report->'journalEvents') e where e->>'ownerKey' <> 'adams') then
    raise exception 'Staff journal scope or reconciliation failed';
  end if;
  if exists(select 1 from leave_reporting_private.request_journal where owner_key <> 'adams') then
    raise exception 'Staff can read another owner journal';
  end if;
end $$;
rollback;
