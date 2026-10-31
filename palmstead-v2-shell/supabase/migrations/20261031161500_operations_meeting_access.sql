-- Meetings share schedule_items with personal tasks. Restrict only kind=meeting.
insert into public.permissions(key,label,description) values
  ('operations.meetings.view','View Operations meetings','Read meetings and invitations shared with this staff member.'),
  ('operations.meetings.manage','Manage Operations meetings','Schedule and edit meetings within existing organizer rules.')
on conflict (key) do update set label=excluded.label, description=excluded.description;

insert into public.role_permissions(role,permission_key)
select 'agent',key from public.permissions
where key in ('operations.meetings.view','operations.meetings.manage')
on conflict do nothing;

create or replace function public.is_meeting_schedule_item(p_id uuid)
returns boolean language sql stable security definer
set search_path='' as $$
  select exists(select 1 from public.schedule_items s where s.id=p_id and s.kind='meeting')
$$;
revoke all on function public.is_meeting_schedule_item(uuid) from public, anon;
grant execute on function public.is_meeting_schedule_item(uuid) to authenticated;

create policy meeting_access_view on public.schedule_items as restrictive
for select to authenticated
using (kind <> 'meeting' or public.has_permission('operations.meetings.view'));
create policy meeting_access_insert on public.schedule_items as restrictive
for insert to authenticated
with check (kind <> 'meeting' or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage')));
create policy meeting_access_update on public.schedule_items as restrictive
for update to authenticated
using (kind <> 'meeting' or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage')))
with check (kind <> 'meeting' or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage')));
create policy meeting_access_delete on public.schedule_items as restrictive
for delete to authenticated
using (kind <> 'meeting' or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage')));

create policy meeting_access_view on public.schedule_item_invitees as restrictive
for select to authenticated using (public.has_permission('operations.meetings.view'));

create policy meeting_access_view on public.schedule_item_attachments as restrictive
for select to authenticated
using (not public.is_meeting_schedule_item(schedule_item_id) or public.has_permission('operations.meetings.view'));
create policy meeting_access_insert on public.schedule_item_attachments as restrictive
for insert to authenticated
with check (not public.is_meeting_schedule_item(schedule_item_id) or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage')));
create policy meeting_access_delete on public.schedule_item_attachments as restrictive
for delete to authenticated
using (not public.is_meeting_schedule_item(schedule_item_id) or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage')));

create policy meeting_access_view on public.task_events as restrictive
for select to authenticated
using (not public.is_meeting_schedule_item(task_id) or public.has_permission('operations.meetings.view'));
create policy meeting_access_insert on public.task_events as restrictive
for insert to authenticated
with check (not public.is_meeting_schedule_item(task_id) or (public.has_permission('operations.meetings.view') and public.has_permission('operations.meetings.manage')));

-- Directly executable SECURITY DEFINER entry points need the same grant as RLS.
do $migration$
declare v_name text; v_definition text; v_anchor text := 'select p.* into v_actor';
  v_guard text := 'if not public.has_permission(''operations.meetings.view'') or not public.has_permission(''operations.meetings.manage'') then raise exception ''Meeting access is restricted.'' using errcode=''42501''; end if;' || chr(10) || '  ';
begin
  foreach v_name in array array['create_meeting','replace_meeting_invitees'] loop
    select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_schedule_private' and p.proname=v_name;
    if v_definition is null or strpos(v_definition,v_anchor)=0 then raise exception 'Unexpected meeting function: %',v_name; end if;
    execute replace(v_definition,v_anchor,v_guard||v_anchor);
  end loop;
end;
$migration$;

do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.respond_to_schedule_invite(uuid,text)'::regprocedure) into v_definition;
  if strpos(v_definition,'if p_response not in')=0 then raise exception 'Unexpected invite response function'; end if;
  execute replace(v_definition,'if p_response not in',
    'if not public.has_permission(''operations.meetings.view'') then raise exception ''Meeting access is restricted.'' using errcode=''42501''; end if;' || chr(10) || '  if p_response not in');
end;
$migration$;

do $migration$
declare v_definition text; v_anchor text;
begin
  -- Availability and slot suggestions expose busy colleagues' calendars.
  select pg_get_functiondef('public.check_schedule_meeting_availability(date,time without time zone,time without time zone,text[],uuid)'::regprocedure) into v_definition;
  v_anchor := 'if p_item_date is null';
  if strpos(v_definition,v_anchor)=0 then raise exception 'Unexpected meeting availability function'; end if;
  execute replace(v_definition,v_anchor,
    'if not public.has_permission(''operations.meetings.view'') then raise exception ''Meeting access is restricted.'' using errcode=''42501''; end if;' || chr(10) || '  ' || v_anchor);

  select pg_get_functiondef(p.oid) into v_definition from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_schedule_private' and p.proname='suggest_meeting_slots';
  v_anchor := 'select p.* into v_actor';
  if v_definition is null or strpos(v_definition,v_anchor)=0 then raise exception 'Unexpected meeting suggestions function'; end if;
  execute replace(v_definition,v_anchor,
    'if not public.has_permission(''operations.meetings.view'') or not public.has_permission(''operations.meetings.manage'') then raise exception ''Meeting access is restricted.'' using errcode=''42501''; end if;' || chr(10) || '  ' || v_anchor);
end;
$migration$;

