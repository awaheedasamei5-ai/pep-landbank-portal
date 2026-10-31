-- Project access covers the workspace, projects, issues, and their child records.
-- Keep the existing agent role access until Management changes an individual grant.
insert into public.permissions(key,label,description) values
  ('operations.projects.view','View Operations projects','Read shared projects, work items, comments and project settings.'),
  ('operations.projects.manage','Manage Operations projects','Create and change projects and work items within existing project role rules.')
on conflict (key) do update set label=excluded.label, description=excluded.description;

insert into public.role_permissions(role,permission_key)
select 'agent', key from public.permissions
where key in ('operations.projects.view','operations.projects.manage')
on conflict do nothing;

-- Restrictive policies combine with every existing permissive policy. This
-- closes direct PostgREST writes without changing project ownership rules.
do $migration$
declare
  v_table text;
begin
  foreach v_table in array array[
    'op_workspaces','op_projects','op_project_members','op_issues',
    'op_issue_activity','op_issue_assignees','op_issue_attachments',
    'op_issue_comments','op_issue_labels','op_issue_links',
    'op_issue_relations','op_issue_modules','op_states','op_labels',
    'op_cycles','op_modules','op_module_members','op_views'
  ] loop
    if to_regclass('public.'||v_table) is null then
      raise exception 'Missing Operations table: %',v_table;
    end if;
    execute format('create policy project_access_view on public.%I as restrictive for select to authenticated using (public.has_permission(''operations.projects.view''))',v_table);
    execute format('create policy project_access_insert on public.%I as restrictive for insert to authenticated with check (public.has_permission(''operations.projects.view'') and public.has_permission(''operations.projects.manage''))',v_table);
    execute format('create policy project_access_update on public.%I as restrictive for update to authenticated using (public.has_permission(''operations.projects.view'') and public.has_permission(''operations.projects.manage'')) with check (public.has_permission(''operations.projects.view'') and public.has_permission(''operations.projects.manage''))',v_table);
    execute format('create policy project_access_delete on public.%I as restrictive for delete to authenticated using (public.has_permission(''operations.projects.view'') and public.has_permission(''operations.projects.manage''))',v_table);
  end loop;
end;
$migration$;

-- Security-definer RPCs bypass caller RLS. Keep a separate read actor for
-- capability queries, and require both grants for every mutation entry point.
create or replace function app_operations_private.project_write_actor()
returns public.profiles
language plpgsql security invoker set search_path = '' as $$
declare v_actor public.profiles%rowtype;
begin
  v_actor := app_operations_private.current_actor();
  if not public.has_permission('operations.projects.view')
     or not public.has_permission('operations.projects.manage') then
    raise exception 'Operations project access is restricted.' using errcode='42501';
  end if;
  return v_actor;
end;
$$;

revoke all on function app_operations_private.project_write_actor() from public, anon;
grant execute on function app_operations_private.project_write_actor() to authenticated;

do $migration$
declare
  v_function record;
  v_definition text;
  v_old text := 'app_operations_private.current_actor()';
  v_new text := 'app_operations_private.project_write_actor()';
  v_count integer := 0;
begin
  for v_function in
    select p.oid, p.proname from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_operations_private' and p.prosecdef
      and p.proname not in ('todo_action','issue_capabilities',
        'cancel_deleted_todo_reminders','cancel_stale_todo_sms')
      and position(v_old in pg_get_functiondef(p.oid))>0
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    execute replace(v_definition,v_old,v_new);
    v_count := v_count+1;
  end loop;
  if v_count < 30 then
    raise exception 'Unexpected project RPC inventory: % functions guarded',v_count;
  end if;
end;
$migration$;

-- A capability response must not reveal issue details after view restriction.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('app_operations_private.issue_capabilities(uuid)'::regprocedure)
    into v_definition;
  if strpos(v_definition,'select i.* into v_issue')=0 then
    raise exception 'Unexpected issue capability definition';
  end if;
  execute replace(v_definition,'select i.* into v_issue',
    'if not public.has_permission(''operations.projects.view'') then raise exception ''Operations project access is restricted.'' using errcode=''42501''; end if;'
    || chr(10) || '  select i.* into v_issue');
end;
$migration$;

