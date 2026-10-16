-- Atomic Operations project creation, editing and recoverable removal.

create or replace function app_operations_private.can_manage_project(
  p_actor public.profiles,
  p_project public.op_projects
)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_actor.role = 'manager'
    or p_project.created_by = p_actor.agent_key
    or p_project.project_lead_key = p_actor.agent_key
    or exists (
      select 1 from public.op_project_members m
      where m.project_id = p_project.id and m.member_key = p_actor.agent_key and m.role >= 20
    )
$$;

create or replace function app_operations_private.create_project(
  p_workspace_slug text,
  p_name text,
  p_identifier text,
  p_description text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_workspace public.op_workspaces%rowtype;
  v_project public.op_projects%rowtype;
  v_default_state uuid;
  v_name text := btrim(p_name);
  v_identifier text := upper(btrim(p_identifier));
begin
  select w.* into v_workspace from public.op_workspaces w where w.slug = p_workspace_slug;
  if not found then raise exception 'Operations workspace not found.' using errcode='P0002'; end if;
  if length(v_name) not between 1 and 120 then raise exception 'Project name must be between 1 and 120 characters.' using errcode='22023'; end if;
  if v_identifier !~ '^[A-Z][A-Z0-9]{1,11}$' then raise exception 'Identifier must be 2–12 uppercase letters or numbers and start with a letter.' using errcode='22023'; end if;
  if length(coalesce(p_description,'')) > 2000 then raise exception 'Project description is too long.' using errcode='22023'; end if;

  insert into public.op_projects(workspace_id,name,identifier,description,logo_props,network,project_lead_key,created_by,updated_by)
  values(v_workspace.id,v_name,v_identifier,nullif(btrim(p_description),''),jsonb_build_object('emoji',jsonb_build_object('value','📁')),2,v_actor.agent_key,v_actor.agent_key,v_actor.agent_key)
  returning * into v_project;

  insert into public.op_states(workspace_id,project_id,name,"group",color,sequence,"order","default") values
    (v_workspace.id,v_project.id,'Backlog','backlog','#60646C',15000,0,true),
    (v_workspace.id,v_project.id,'Todo','unstarted','#3A3A3A',25000,1,false),
    (v_workspace.id,v_project.id,'In Progress','started','#F59E0B',35000,2,false),
    (v_workspace.id,v_project.id,'Done','completed','#16A34A',45000,3,false),
    (v_workspace.id,v_project.id,'Cancelled','cancelled','#EF4444',55000,4,false);
  select s.id into v_default_state from public.op_states s where s.project_id=v_project.id and s."default" is true;
  update public.op_projects set default_state_id=v_default_state where id=v_project.id returning * into v_project;
  insert into public.op_project_members(project_id,member_key,role) values(v_project.id,v_actor.agent_key,20) on conflict do nothing;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','project_created',v_actor.agent_key,v_actor.name,'operations_project',v_project.id::text,'Created Operations project '||v_identifier,jsonb_build_object('name',v_name,'identifier',v_identifier),'server');
  return to_jsonb(v_project);
end; $$;

create or replace function app_operations_private.update_project(p_project_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_before public.op_projects%rowtype; v_after public.op_projects%rowtype;
  v_keys text[]; v_allowed constant text[] := array['name','identifier','description','cycle_view','module_view','issue_views_view','page_view','inbox_view'];
  v_name text; v_identifier text; v_description text;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Choose at least one project field to update.' using errcode='22023'; end if;
  select array_agg(key order by key) into v_keys from jsonb_object_keys(p_patch) key;
  if not v_keys <@ v_allowed then raise exception 'The project update contains an unsupported field.' using errcode='22023'; end if;
  select p.* into v_before from public.op_projects p where p.id=p_project_id for update;
  if not found then raise exception 'Project not found.' using errcode='P0002'; end if;
  if v_before.archived_at is not null then raise exception 'Restore this project before editing it.' using errcode='22023'; end if;
  if not app_operations_private.can_manage_project(v_actor,v_before) then raise exception 'You do not have permission to edit this project.' using errcode='42501'; end if;
  if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then raise exception 'This project changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  v_name := case when p_patch?'name' then btrim(p_patch->>'name') else v_before.name end;
  v_identifier := case when p_patch?'identifier' then upper(btrim(p_patch->>'identifier')) else v_before.identifier end;
  v_description := case when p_patch?'description' then nullif(btrim(p_patch->>'description'),'') else v_before.description end;
  if length(v_name) not between 1 and 120 then raise exception 'Project name must be between 1 and 120 characters.' using errcode='22023'; end if;
  if v_identifier !~ '^[A-Z][A-Z0-9]{1,11}$' then raise exception 'Identifier must be 2–12 uppercase letters or numbers and start with a letter.' using errcode='22023'; end if;
  if length(coalesce(v_description,'')) > 2000 then raise exception 'Project description is too long.' using errcode='22023'; end if;
  update public.op_projects set
    name=v_name,identifier=v_identifier,description=v_description,
    cycle_view=case when p_patch?'cycle_view' then (p_patch->>'cycle_view')::boolean else cycle_view end,
    module_view=case when p_patch?'module_view' then (p_patch->>'module_view')::boolean else module_view end,
    issue_views_view=case when p_patch?'issue_views_view' then (p_patch->>'issue_views_view')::boolean else issue_views_view end,
    page_view=case when p_patch?'page_view' then (p_patch->>'page_view')::boolean else page_view end,
    inbox_view=case when p_patch?'inbox_view' then (p_patch->>'inbox_view')::boolean else inbox_view end,
    updated_by=v_actor.agent_key,updated_at=clock_timestamp()
  where id=p_project_id returning * into v_after;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','project_updated',v_actor.agent_key,v_actor.name,'operations_project',v_after.id::text,'Updated Operations project '||v_after.identifier,jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_after)),'server');
  return to_jsonb(v_after);
end; $$;

create or replace function app_operations_private.archive_project(p_project_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles%rowtype:=app_operations_private.current_actor(); v_project public.op_projects%rowtype;
begin
  if v_actor.role<>'manager' then raise exception 'Only Management can delete a project.' using errcode='42501'; end if;
  select p.* into v_project from public.op_projects p where p.id=p_project_id for update;
  if not found then raise exception 'Project not found.' using errcode='P0002'; end if;
  if v_project.archived_at is not null then return to_jsonb(v_project); end if;
  if p_expected_updated_at is null or v_project.updated_at is distinct from p_expected_updated_at then raise exception 'This project changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  update public.op_projects set archived_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=v_actor.agent_key where id=p_project_id returning * into v_project;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','project_archived',v_actor.agent_key,v_actor.name,'operations_project',v_project.id::text,'Archived Operations project '||v_project.identifier,jsonb_build_object('recoverable',true),'server');
  return to_jsonb(v_project);
end; $$;

create or replace function app_operations_private.restore_project(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles%rowtype:=app_operations_private.current_actor(); v_project public.op_projects%rowtype;
begin
  if v_actor.role<>'manager' then raise exception 'Only Management can restore a project.' using errcode='42501'; end if;
  update public.op_projects set archived_at=null,updated_at=clock_timestamp(),updated_by=v_actor.agent_key where id=p_project_id and archived_at is not null returning * into v_project;
  if not found then raise exception 'Archived project not found.' using errcode='P0002'; end if;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','project_restored',v_actor.agent_key,v_actor.name,'operations_project',v_project.id::text,'Restored Operations project '||v_project.identifier,jsonb_build_object('recoverable',true),'server');
  return to_jsonb(v_project);
end; $$;

create or replace function public.create_operation_project(p_workspace_slug text,p_name text,p_identifier text,p_description text default null)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.create_project(p_workspace_slug,p_name,p_identifier,p_description) $$;
create or replace function public.update_operation_project(p_project_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.update_project(p_project_id,p_expected_updated_at,p_patch) $$;
create or replace function public.archive_operation_project(p_project_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.archive_project(p_project_id,p_expected_updated_at) $$;
create or replace function public.restore_operation_project(p_project_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.restore_project(p_project_id) $$;
revoke all on function public.create_operation_project(text,text,text,text) from public,anon;
revoke all on function public.update_operation_project(uuid,timestamptz,jsonb) from public,anon;
revoke all on function public.archive_operation_project(uuid,timestamptz) from public,anon;
revoke all on function public.restore_operation_project(uuid) from public,anon;
grant execute on function public.create_operation_project(text,text,text,text) to authenticated;
grant execute on function public.update_operation_project(uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.archive_operation_project(uuid,timestamptz) to authenticated;
grant execute on function public.restore_operation_project(uuid) to authenticated;
