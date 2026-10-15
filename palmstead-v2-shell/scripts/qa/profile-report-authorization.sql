-- V2 ONLY: sbydzrlzqxcdbudjaube. Test transaction always rolls back.
-- Uses the authorized Adams test profile; no credential or generated UUID.
begin;
do $$ begin
  if not exists (select 1 from public.profiles where agent_key = 'adams' and role = 'agent' and active) then
    raise exception 'Active V2 Adams test profile required';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', (select id from public.profiles where agent_key = 'adams'), 'role', 'authenticated'
  )::text, true);
end $$;
set local role authenticated;
do $$ begin
  begin
    update public.profiles set role = 'manager' where id = auth.uid();
    raise exception 'QA failure: Staff role change accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set active = false where id = auth.uid();
    raise exception 'QA failure: Staff active-status change accepted';
  exception when insufficient_privilege then null; end;
  update public.profiles set phone = phone where id = auth.uid();
  if (select role from public.profiles where id = auth.uid()) <> 'agent' then
    raise exception 'QA failure: role changed';
  end if;
  if public.get_leave_report_snapshot(2026)->>'scope' <> 'personal' then
    raise exception 'QA failure: Staff report scope widened';
  end if;
end $$;
rollback;
