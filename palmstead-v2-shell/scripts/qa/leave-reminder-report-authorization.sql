-- V2 only: sbydzrlzqxcdbudjaube. Real identity, read-only checks, always rollback.
begin;
do $$ begin
  if not exists(select 1 from public.profiles where agent_key='manager' and role='manager' and active) then
    raise exception 'Active Management test profile required';
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where agent_key='manager'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare result jsonb; begin
  result := public.get_leave_reminder_report('2026-01-01','2026-10-15','previous_year');
  if (result->'current'->>'total')::int <> jsonb_array_length(result->'current'->'rows') or not (result->'current'->>'complete')::boolean then
    raise exception 'QA failure: reminder snapshot not reconciled';
  end if;
  if result::text ~ '(recipient_phone|message_body|provider_reference|provider_status|last_error|recipient_key)' then
    raise exception 'QA failure: private queue field exposed';
  end if;
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where agent_key='adams'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.get_leave_reminder_report('2026-01-01','2026-10-15','previous_year');
    raise exception 'QA failure: Staff reminder report accepted';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
