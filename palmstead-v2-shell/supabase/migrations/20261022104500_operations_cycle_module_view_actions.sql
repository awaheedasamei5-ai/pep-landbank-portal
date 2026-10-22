-- Guard Operations cycles, modules and saved views behind audited server actions.

create or replace function app_operations_private.can_contribute_project(
  p_actor public.profiles,
  p_project public.op_projects
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_actor.role = 'manager'
    or p_project.created_by = p_actor.agent_key
    or p_project.project_lead_key = p_actor.agent_key
    or p_project.network = 2
    or exists (
      select 1 from public.op_project_members m
      where m.project_id = p_project.id
        and m.member_key = p_actor.agent_key
        and m.role >= 15
    )
$$;

create or replace function app_operations_private.assert_project_contributor(p_project_id uuid)
returns public.op_projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype;
begin
  select p.* into v_project from public.op_projects p where p.id = p_project_id for update;
  if not found then raise exception 'Project not found.' using errcode = 'P0002'; end if;
  if v_project.archived_at is not null then
    raise exception 'Restore this project before changing its work plan.' using errcode = '22023';
  end if;
  if not app_operations_private.can_contribute_project(v_actor, v_project) then
    raise exception 'You do not have permission to contribute to this project.' using errcode = '42501';
  end if;
  return v_project;
end;
$$;

create or replace function app_operations_private.create_cycle(
  p_project_id uuid,
  p_name text,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_cycle public.op_cycles%rowtype;
  v_name text := btrim(p_name);
  v_description text := nullif(btrim(p_description), '');
begin
  if length(v_name) not between 1 and 120 then
    raise exception 'Cycle name must be between 1 and 120 characters.' using errcode = '22023';
  end if;
  if length(coalesce(v_description, '')) > 2000 then
    raise exception 'Cycle description is too long.' using errcode = '22023';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'Cycle end date cannot be before its start date.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.op_cycles c
    where c.project_id = v_project.id and lower(c.name) = lower(v_name) and c.archived_at is null
  ) then
    raise exception 'An active cycle with this name already exists.' using errcode = '23505';
  end if;

  insert into public.op_cycles(
    workspace_id, project_id, name, description, start_date, end_date,
    owned_by_key, sort_order, created_by, updated_at
  )
  select v_project.workspace_id, v_project.id, v_name, v_description, p_start_date, p_end_date,
    v_actor.agent_key, coalesce(max(c.sort_order), 0) + 10000, v_actor.agent_key, clock_timestamp()
  from public.op_cycles c where c.project_id = v_project.id
  returning * into v_cycle;

  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','cycle_created',v_actor.agent_key,v_actor.name,'operations_cycle',v_cycle.id::text,
    'Created cycle ' || v_cycle.name,
    jsonb_build_object('project_id',v_project.id,'after',to_jsonb(v_cycle)),'server');
  return to_jsonb(v_cycle);
end;
$$;

create or replace function app_operations_private.update_cycle(
  p_project_id uuid,
  p_cycle_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_before public.op_cycles%rowtype;
  v_after public.op_cycles%rowtype;
  v_keys text[];
  v_allowed constant text[] := array['name','description','start_date','end_date','sort_order'];
  v_name text;
  v_description text;
  v_start date;
  v_end date;
  v_sort numeric;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Choose at least one cycle field to update.' using errcode = '22023';
  end if;
  select array_agg(key order by key) into v_keys from jsonb_object_keys(p_patch) key;
  if not v_keys <@ v_allowed then
    raise exception 'The cycle update contains an unsupported field.' using errcode = '22023';
  end if;
  select c.* into v_before from public.op_cycles c
  where c.id = p_cycle_id and c.project_id = v_project.id for update;
  if not found then raise exception 'Cycle not found in this project.' using errcode = 'P0002'; end if;
  if v_before.archived_at is not null then
    raise exception 'Restore this cycle before editing it.' using errcode = '22023';
  end if;
  if not (app_operations_private.can_manage_project(v_actor, v_project)
    or v_before.created_by = v_actor.agent_key
    or v_before.owned_by_key = v_actor.agent_key) then
    raise exception 'You can edit only cycles you own.' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'This cycle changed after you opened it. Reload and try again.' using errcode = '40001';
  end if;

  v_name := case when p_patch ? 'name' then btrim(p_patch->>'name') else v_before.name end;
  v_description := case when p_patch ? 'description' then nullif(btrim(p_patch->>'description'),'') else v_before.description end;
  v_start := case when p_patch ? 'start_date' then nullif(p_patch->>'start_date','')::date else v_before.start_date end;
  v_end := case when p_patch ? 'end_date' then nullif(p_patch->>'end_date','')::date else v_before.end_date end;
  v_sort := case when p_patch ? 'sort_order' then (p_patch->>'sort_order')::numeric else v_before.sort_order end;
  if length(v_name) not between 1 and 120 then raise exception 'Cycle name must be between 1 and 120 characters.' using errcode='22023'; end if;
  if length(coalesce(v_description,'')) > 2000 then raise exception 'Cycle description is too long.' using errcode='22023'; end if;
  if v_start is not null and v_end is not null and v_end < v_start then raise exception 'Cycle end date cannot be before its start date.' using errcode='22023'; end if;
  if v_sort < -1000000000 or v_sort > 1000000000 then raise exception 'Cycle position is outside the supported range.' using errcode='22023'; end if;
  if exists(select 1 from public.op_cycles c where c.project_id=v_project.id and c.id<>v_before.id and c.archived_at is null and lower(c.name)=lower(v_name)) then
    raise exception 'An active cycle with this name already exists.' using errcode='23505';
  end if;
  update public.op_cycles set name=v_name,description=v_description,start_date=v_start,end_date=v_end,
    sort_order=v_sort,updated_at=clock_timestamp()
  where id=v_before.id returning * into v_after;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','cycle_updated',v_actor.agent_key,v_actor.name,'operations_cycle',v_after.id::text,
    'Updated cycle '||v_after.name,jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_before),'after',to_jsonb(v_after)),'server');
  return to_jsonb(v_after);
end;
$$;

create or replace function app_operations_private.set_cycle_archive(
  p_project_id uuid,
  p_cycle_id uuid,
  p_archived boolean,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_before public.op_cycles%rowtype;
  v_after public.op_cycles%rowtype;
begin
  select c.* into v_before from public.op_cycles c where c.id=p_cycle_id and c.project_id=v_project.id for update;
  if not found then raise exception 'Cycle not found in this project.' using errcode='P0002'; end if;
  if not (app_operations_private.can_manage_project(v_actor,v_project) or v_before.created_by=v_actor.agent_key or v_before.owned_by_key=v_actor.agent_key) then
    raise exception 'You can archive or restore only cycles you own.' using errcode='42501';
  end if;
  if p_expected_updated_at is not null and v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'This cycle changed after you opened it. Reload and try again.' using errcode='40001';
  end if;
  if (v_before.archived_at is not null) = p_archived then return to_jsonb(v_before); end if;
  update public.op_cycles set archived_at=case when p_archived then clock_timestamp() else null end,
    updated_at=clock_timestamp() where id=v_before.id returning * into v_after;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations',case when p_archived then 'cycle_archived' else 'cycle_restored' end,
    v_actor.agent_key,v_actor.name,'operations_cycle',v_after.id::text,
    case when p_archived then 'Archived cycle ' else 'Restored cycle ' end || v_after.name,
    jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_before),'after',to_jsonb(v_after)),'server');
  return to_jsonb(v_after);
end;
$$;

create or replace function app_operations_private.delete_cycle(
  p_project_id uuid,
  p_cycle_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_cycle public.op_cycles%rowtype;
  v_issue_count integer;
begin
  select c.* into v_cycle from public.op_cycles c where c.id=p_cycle_id and c.project_id=v_project.id for update;
  if not found then raise exception 'Cycle not found in this project.' using errcode='P0002'; end if;
  if not (app_operations_private.can_manage_project(v_actor,v_project) or v_cycle.created_by=v_actor.agent_key or v_cycle.owned_by_key=v_actor.agent_key) then
    raise exception 'You can delete only cycles you own.' using errcode='42501';
  end if;
  if p_expected_updated_at is null or v_cycle.updated_at is distinct from p_expected_updated_at then
    raise exception 'This cycle changed after you opened it. Reload and try again.' using errcode='40001';
  end if;
  select count(*) into v_issue_count from public.op_issues i where i.cycle_id=v_cycle.id;
  update public.op_issues set cycle_id=null,updated_by=v_actor.agent_key,updated_at=clock_timestamp() where cycle_id=v_cycle.id;
  delete from public.op_cycles where id=v_cycle.id;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','cycle_deleted',v_actor.agent_key,v_actor.name,'operations_cycle',v_cycle.id::text,
    'Deleted cycle '||v_cycle.name,jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_cycle),'issues_unassigned',v_issue_count),'server');
  return jsonb_build_object('cycle',to_jsonb(v_cycle),'issues_unassigned',v_issue_count);
end;
$$;

create or replace function app_operations_private.create_module(
  p_project_id uuid,
  p_name text,
  p_description text default null,
  p_lead_key text default null,
  p_status text default 'planned',
  p_start_date date default null,
  p_target_date date default null,
  p_member_keys text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_module public.op_modules%rowtype;
  v_name text := btrim(p_name);
  v_description text := nullif(btrim(p_description),'');
  v_lead text := coalesce(nullif(btrim(p_lead_key),''),v_actor.agent_key);
  v_members text[] := coalesce(p_member_keys,'{}'::text[]);
begin
  if length(v_name) not between 1 and 120 then raise exception 'Module name must be between 1 and 120 characters.' using errcode='22023'; end if;
  if length(coalesce(v_description,'')) > 4000 then raise exception 'Module description is too long.' using errcode='22023'; end if;
  if p_status not in ('backlog','planned','in-progress','paused','completed','cancelled') then raise exception 'Choose a valid module status.' using errcode='22023'; end if;
  if p_start_date is not null and p_target_date is not null and p_target_date < p_start_date then raise exception 'Module target date cannot be before its start date.' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.agent_key=v_lead and p.active is true) then raise exception 'Choose an active module lead.' using errcode='22023'; end if;
  if exists(select 1 from unnest(v_members) k where not exists(select 1 from public.profiles p where p.agent_key=k and p.active is true)) then raise exception 'Every module member must be an active staff member.' using errcode='22023'; end if;
  if exists(select 1 from public.op_modules m where m.project_id=v_project.id and lower(m.name)=lower(v_name) and m.archived_at is null) then raise exception 'An active module with this name already exists.' using errcode='23505'; end if;
  insert into public.op_modules(workspace_id,project_id,name,description,lead_key,status,start_date,target_date,sort_order,created_by,updated_at)
  select v_project.workspace_id,v_project.id,v_name,v_description,v_lead,p_status,p_start_date,p_target_date,
    coalesce(max(m.sort_order),0)+10000,v_actor.agent_key,clock_timestamp()
  from public.op_modules m where m.project_id=v_project.id returning * into v_module;
  insert into public.op_module_members(module_id,member_key)
  select v_module.id,k from (select distinct unnest(v_members) k) x where k is not null and k<>'';
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','module_created',v_actor.agent_key,v_actor.name,'operations_module',v_module.id::text,
    'Created module '||v_module.name,jsonb_build_object('project_id',v_project.id,'after',to_jsonb(v_module),'member_keys',to_jsonb(v_members)),'server');
  return to_jsonb(v_module);
end;
$$;

create or replace function app_operations_private.update_module(
  p_project_id uuid,
  p_module_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_before public.op_modules%rowtype;
  v_after public.op_modules%rowtype;
  v_keys text[];
  v_allowed constant text[] := array['name','description','description_html','lead_key','status','start_date','target_date','sort_order','member_ids'];
  v_name text;
  v_description text;
  v_description_html text;
  v_lead text;
  v_status text;
  v_start date;
  v_target date;
  v_sort numeric;
  v_members text[];
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Choose at least one module field to update.' using errcode='22023'; end if;
  select array_agg(key order by key) into v_keys from jsonb_object_keys(p_patch) key;
  if not v_keys <@ v_allowed then raise exception 'The module update contains an unsupported field.' using errcode='22023'; end if;
  select m.* into v_before from public.op_modules m where m.id=p_module_id and m.project_id=v_project.id for update;
  if not found then raise exception 'Module not found in this project.' using errcode='P0002'; end if;
  if v_before.archived_at is not null then raise exception 'Restore this module before editing it.' using errcode='22023'; end if;
  if not (app_operations_private.can_manage_project(v_actor,v_project) or v_before.created_by=v_actor.agent_key or v_before.lead_key=v_actor.agent_key) then raise exception 'You can edit only modules you own or lead.' using errcode='42501'; end if;
  if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then raise exception 'This module changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  v_name:=case when p_patch?'name' then btrim(p_patch->>'name') else v_before.name end;
  v_description:=case when p_patch?'description' then nullif(btrim(p_patch->>'description'),'') else v_before.description end;
  v_description_html:=case when p_patch?'description_html' then nullif(p_patch->>'description_html','') else v_before.description_html end;
  v_lead:=case when p_patch?'lead_key' then nullif(btrim(p_patch->>'lead_key'),'') else v_before.lead_key end;
  v_status:=case when p_patch?'status' then p_patch->>'status' else v_before.status end;
  v_start:=case when p_patch?'start_date' then nullif(p_patch->>'start_date','')::date else v_before.start_date end;
  v_target:=case when p_patch?'target_date' then nullif(p_patch->>'target_date','')::date else v_before.target_date end;
  v_sort:=case when p_patch?'sort_order' then (p_patch->>'sort_order')::numeric else v_before.sort_order end;
  if p_patch?'member_ids' then select coalesce(array_agg(value),'{}'::text[]) into v_members from jsonb_array_elements_text(p_patch->'member_ids'); end if;
  if length(v_name) not between 1 and 120 then raise exception 'Module name must be between 1 and 120 characters.' using errcode='22023'; end if;
  if length(coalesce(v_description,'')) > 4000 or length(coalesce(v_description_html,'')) > 20000 then raise exception 'Module description is too long.' using errcode='22023'; end if;
  if v_status not in ('backlog','planned','in-progress','paused','completed','cancelled') then raise exception 'Choose a valid module status.' using errcode='22023'; end if;
  if v_start is not null and v_target is not null and v_target < v_start then raise exception 'Module target date cannot be before its start date.' using errcode='22023'; end if;
  if v_lead is not null and not exists(select 1 from public.profiles p where p.agent_key=v_lead and p.active is true) then raise exception 'Choose an active module lead.' using errcode='22023'; end if;
  if p_patch?'member_ids' and exists(select 1 from unnest(v_members) k where not exists(select 1 from public.profiles p where p.agent_key=k and p.active is true)) then raise exception 'Every module member must be an active staff member.' using errcode='22023'; end if;
  if v_sort < -1000000000 or v_sort > 1000000000 then raise exception 'Module position is outside the supported range.' using errcode='22023'; end if;
  if exists(select 1 from public.op_modules m where m.project_id=v_project.id and m.id<>v_before.id and m.archived_at is null and lower(m.name)=lower(v_name)) then raise exception 'An active module with this name already exists.' using errcode='23505'; end if;
  update public.op_modules set name=v_name,description=v_description,description_html=v_description_html,
    lead_key=v_lead,status=v_status,start_date=v_start,target_date=v_target,sort_order=v_sort,updated_at=clock_timestamp()
  where id=v_before.id returning * into v_after;
  if p_patch?'member_ids' then
    delete from public.op_module_members where module_id=v_before.id;
    insert into public.op_module_members(module_id,member_key)
    select v_before.id,k from (select distinct unnest(v_members) k) x where k is not null and k<>'';
  end if;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','module_updated',v_actor.agent_key,v_actor.name,'operations_module',v_after.id::text,
    'Updated module '||v_after.name,jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_before),'after',to_jsonb(v_after),'member_keys',case when p_patch?'member_ids' then to_jsonb(v_members) else null end),'server');
  return to_jsonb(v_after);
end;
$$;

create or replace function app_operations_private.set_module_archive(
  p_project_id uuid,
  p_module_id uuid,
  p_archived boolean,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_before public.op_modules%rowtype;
  v_after public.op_modules%rowtype;
begin
  select m.* into v_before from public.op_modules m where m.id=p_module_id and m.project_id=v_project.id for update;
  if not found then raise exception 'Module not found in this project.' using errcode='P0002'; end if;
  if not (app_operations_private.can_manage_project(v_actor,v_project) or v_before.created_by=v_actor.agent_key or v_before.lead_key=v_actor.agent_key) then raise exception 'You can archive or restore only modules you own or lead.' using errcode='42501'; end if;
  if p_expected_updated_at is not null and v_before.updated_at is distinct from p_expected_updated_at then raise exception 'This module changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  if (v_before.archived_at is not null)=p_archived then return to_jsonb(v_before); end if;
  update public.op_modules set archived_at=case when p_archived then clock_timestamp() else null end,updated_at=clock_timestamp()
  where id=v_before.id returning * into v_after;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations',case when p_archived then 'module_archived' else 'module_restored' end,v_actor.agent_key,v_actor.name,
    'operations_module',v_after.id::text,case when p_archived then 'Archived module ' else 'Restored module ' end||v_after.name,
    jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_before),'after',to_jsonb(v_after)),'server');
  return to_jsonb(v_after);
end;
$$;

create or replace function app_operations_private.delete_module(
  p_project_id uuid,
  p_module_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_module public.op_modules%rowtype;
  v_issue_count integer;
  v_member_count integer;
begin
  select m.* into v_module from public.op_modules m where m.id=p_module_id and m.project_id=v_project.id for update;
  if not found then raise exception 'Module not found in this project.' using errcode='P0002'; end if;
  if not (app_operations_private.can_manage_project(v_actor,v_project) or v_module.created_by=v_actor.agent_key or v_module.lead_key=v_actor.agent_key) then raise exception 'You can delete only modules you own or lead.' using errcode='42501'; end if;
  if p_expected_updated_at is null or v_module.updated_at is distinct from p_expected_updated_at then raise exception 'This module changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  select count(*) into v_issue_count from public.op_issue_modules x where x.module_id=v_module.id;
  select count(*) into v_member_count from public.op_module_members x where x.module_id=v_module.id;
  delete from public.op_modules where id=v_module.id;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','module_deleted',v_actor.agent_key,v_actor.name,'operations_module',v_module.id::text,
    'Deleted module '||v_module.name,jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_module),'issue_links_removed',v_issue_count,'members_removed',v_member_count),'server');
  return jsonb_build_object('module',to_jsonb(v_module),'issue_links_removed',v_issue_count,'members_removed',v_member_count);
end;
$$;

create or replace function app_operations_private.change_module_issues(
  p_project_id uuid,
  p_module_id uuid,
  p_issue_ids uuid[],
  p_add boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_module public.op_modules%rowtype;
  v_ids uuid[] := coalesce(p_issue_ids,'{}'::uuid[]);
  v_changed integer := 0;
begin
  select m.* into v_module from public.op_modules m where m.id=p_module_id and m.project_id=v_project.id and m.archived_at is null for update;
  if not found then raise exception 'Active module not found in this project.' using errcode='P0002'; end if;
  if cardinality(v_ids)=0 then return jsonb_build_object('changed',0); end if;
  if exists(select 1 from unnest(v_ids) id where not exists(select 1 from public.op_issues i where i.id=id and i.project_id=v_project.id and i.archived_at is null)) then raise exception 'Every work item must be active and belong to this project.' using errcode='22023'; end if;
  if exists(select 1 from public.op_issues i where i.id=any(v_ids) and not app_operations_private.can_edit_issue(v_actor,i)) then raise exception 'You cannot change modules for one or more selected work items.' using errcode='42501'; end if;
  if p_add then
    insert into public.op_issue_modules(issue_id,module_id) select distinct id,v_module.id from unnest(v_ids) id on conflict do nothing;
  else
    delete from public.op_issue_modules where module_id=v_module.id and issue_id=any(v_ids);
  end if;
  get diagnostics v_changed=row_count;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations',case when p_add then 'module_issues_added' else 'module_issues_removed' end,v_actor.agent_key,v_actor.name,
    'operations_module',v_module.id::text,case when p_add then 'Added work items to module ' else 'Removed work items from module ' end||v_module.name,
    jsonb_build_object('project_id',v_project.id,'issue_ids',to_jsonb(v_ids),'changed',v_changed),'server');
  return jsonb_build_object('changed',v_changed);
end;
$$;

create or replace function app_operations_private.change_issue_modules(
  p_project_id uuid,
  p_issue_id uuid,
  p_add_module_ids uuid[] default '{}'::uuid[],
  p_remove_module_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_contributor(p_project_id);
  v_issue public.op_issues%rowtype;
  v_add uuid[] := coalesce(p_add_module_ids,'{}'::uuid[]);
  v_remove uuid[] := coalesce(p_remove_module_ids,'{}'::uuid[]);
  v_added integer := 0;
  v_removed integer := 0;
begin
  select i.* into v_issue from public.op_issues i where i.id=p_issue_id and i.project_id=v_project.id and i.archived_at is null for update;
  if not found then raise exception 'Active work item not found in this project.' using errcode='P0002'; end if;
  if not app_operations_private.can_edit_issue(v_actor,v_issue) then raise exception 'You cannot change modules for this work item.' using errcode='42501'; end if;
  if exists(select 1 from unnest(v_add) id where not exists(select 1 from public.op_modules m where m.id=id and m.project_id=v_project.id and m.archived_at is null)) then raise exception 'Every added module must be active and belong to this project.' using errcode='22023'; end if;
  if exists(select 1 from unnest(v_remove) id where not exists(select 1 from public.op_modules m where m.id=id and m.project_id=v_project.id)) then raise exception 'Every removed module must belong to this project.' using errcode='22023'; end if;
  delete from public.op_issue_modules where issue_id=v_issue.id and module_id=any(v_remove);
  get diagnostics v_removed=row_count;
  insert into public.op_issue_modules(issue_id,module_id) select distinct v_issue.id,id from unnest(v_add) id on conflict do nothing;
  get diagnostics v_added=row_count;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','issue_modules_changed',v_actor.agent_key,v_actor.name,'operations_issue',v_issue.id::text,
    'Changed work item modules',jsonb_build_object('project_id',v_project.id,'added_module_ids',to_jsonb(v_add),'removed_module_ids',to_jsonb(v_remove),'added',v_added,'removed',v_removed),'server');
  return jsonb_build_object('added',v_added,'removed',v_removed);
end;
$$;

create or replace function app_operations_private.create_view(p_project_id uuid,p_name text,p_query jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor public.profiles%rowtype:=app_operations_private.current_actor();
  v_project public.op_projects%rowtype:=app_operations_private.assert_project_contributor(p_project_id);
  v_view public.op_views%rowtype;
  v_name text:=btrim(p_name);
  v_query jsonb:=coalesce(p_query,'{}'::jsonb);
begin
  if length(v_name) not between 1 and 120 then raise exception 'View name must be between 1 and 120 characters.' using errcode='22023'; end if;
  if jsonb_typeof(v_query)<>'object' or octet_length(v_query::text)>20000 then raise exception 'Choose a valid saved filter.' using errcode='22023'; end if;
  if exists(select 1 from public.op_views v where v.project_id=v_project.id and lower(v.name)=lower(v_name)) then raise exception 'A view with this name already exists.' using errcode='23505'; end if;
  insert into public.op_views(workspace_id,project_id,name,query,created_by,updated_at)
  values(v_project.workspace_id,v_project.id,v_name,v_query,v_actor.agent_key,clock_timestamp()) returning * into v_view;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','view_created',v_actor.agent_key,v_actor.name,'operations_view',v_view.id::text,'Created saved view '||v_view.name,
    jsonb_build_object('project_id',v_project.id,'after',to_jsonb(v_view)),'server');
  return to_jsonb(v_view);
end; $$;

create or replace function app_operations_private.update_view(p_project_id uuid,p_view_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor public.profiles%rowtype:=app_operations_private.current_actor();
  v_project public.op_projects%rowtype:=app_operations_private.assert_project_contributor(p_project_id);
  v_before public.op_views%rowtype; v_after public.op_views%rowtype; v_keys text[];
  v_allowed constant text[]:=array['name','query']; v_name text; v_query jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Choose at least one view field to update.' using errcode='22023'; end if;
  select array_agg(key order by key) into v_keys from jsonb_object_keys(p_patch) key;
  if not v_keys <@ v_allowed then raise exception 'The view update contains an unsupported field.' using errcode='22023'; end if;
  select v.* into v_before from public.op_views v where v.id=p_view_id and v.project_id=v_project.id for update;
  if not found then raise exception 'View not found in this project.' using errcode='P0002'; end if;
  if not (app_operations_private.can_manage_project(v_actor,v_project) or v_before.created_by=v_actor.agent_key) then raise exception 'You can edit only views you created.' using errcode='42501'; end if;
  if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then raise exception 'This view changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  v_name:=case when p_patch?'name' then btrim(p_patch->>'name') else v_before.name end;
  v_query:=case when p_patch?'query' then p_patch->'query' else v_before.query end;
  if length(v_name) not between 1 and 120 then raise exception 'View name must be between 1 and 120 characters.' using errcode='22023'; end if;
  if jsonb_typeof(v_query)<>'object' or octet_length(v_query::text)>20000 then raise exception 'Choose a valid saved filter.' using errcode='22023'; end if;
  if exists(select 1 from public.op_views v where v.project_id=v_project.id and v.id<>v_before.id and lower(v.name)=lower(v_name)) then raise exception 'A view with this name already exists.' using errcode='23505'; end if;
  update public.op_views set name=v_name,query=v_query,updated_at=clock_timestamp() where id=v_before.id returning * into v_after;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','view_updated',v_actor.agent_key,v_actor.name,'operations_view',v_after.id::text,'Updated saved view '||v_after.name,
    jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_before),'after',to_jsonb(v_after)),'server');
  return to_jsonb(v_after);
end; $$;

create or replace function app_operations_private.delete_view(p_project_id uuid,p_view_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor public.profiles%rowtype:=app_operations_private.current_actor();
  v_project public.op_projects%rowtype:=app_operations_private.assert_project_contributor(p_project_id);
  v_view public.op_views%rowtype;
begin
  select v.* into v_view from public.op_views v where v.id=p_view_id and v.project_id=v_project.id for update;
  if not found then raise exception 'View not found in this project.' using errcode='P0002'; end if;
  if not (app_operations_private.can_manage_project(v_actor,v_project) or v_view.created_by=v_actor.agent_key) then raise exception 'You can delete only views you created.' using errcode='42501'; end if;
  if p_expected_updated_at is null or v_view.updated_at is distinct from p_expected_updated_at then raise exception 'This view changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  delete from public.op_views where id=v_view.id;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','view_deleted',v_actor.agent_key,v_actor.name,'operations_view',v_view.id::text,'Deleted saved view '||v_view.name,
    jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_view)),'server');
  return to_jsonb(v_view);
end; $$;

create or replace function public.create_operation_cycle(p_project_id uuid,p_name text,p_description text default null,p_start_date date default null,p_end_date date default null)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.create_cycle(p_project_id,p_name,p_description,p_start_date,p_end_date) $$;
create or replace function public.update_operation_cycle(p_project_id uuid,p_cycle_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.update_cycle(p_project_id,p_cycle_id,p_expected_updated_at,p_patch) $$;
create or replace function public.set_operation_cycle_archive(p_project_id uuid,p_cycle_id uuid,p_archived boolean,p_expected_updated_at timestamptz default null)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.set_cycle_archive(p_project_id,p_cycle_id,p_archived,p_expected_updated_at) $$;
create or replace function public.delete_operation_cycle(p_project_id uuid,p_cycle_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.delete_cycle(p_project_id,p_cycle_id,p_expected_updated_at) $$;
create or replace function public.create_operation_module(p_project_id uuid,p_name text,p_description text default null,p_lead_key text default null,p_status text default 'planned',p_start_date date default null,p_target_date date default null,p_member_keys text[] default '{}'::text[])
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.create_module(p_project_id,p_name,p_description,p_lead_key,p_status,p_start_date,p_target_date,p_member_keys) $$;
create or replace function public.update_operation_module(p_project_id uuid,p_module_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.update_module(p_project_id,p_module_id,p_expected_updated_at,p_patch) $$;
create or replace function public.set_operation_module_archive(p_project_id uuid,p_module_id uuid,p_archived boolean,p_expected_updated_at timestamptz default null)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.set_module_archive(p_project_id,p_module_id,p_archived,p_expected_updated_at) $$;
create or replace function public.delete_operation_module(p_project_id uuid,p_module_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.delete_module(p_project_id,p_module_id,p_expected_updated_at) $$;
create or replace function public.change_operation_module_issues(p_project_id uuid,p_module_id uuid,p_issue_ids uuid[],p_add boolean)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.change_module_issues(p_project_id,p_module_id,p_issue_ids,p_add) $$;
create or replace function public.change_operation_issue_modules(p_project_id uuid,p_issue_id uuid,p_add_module_ids uuid[] default '{}'::uuid[],p_remove_module_ids uuid[] default '{}'::uuid[])
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.change_issue_modules(p_project_id,p_issue_id,p_add_module_ids,p_remove_module_ids) $$;
create or replace function public.create_operation_view(p_project_id uuid,p_name text,p_query jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.create_view(p_project_id,p_name,p_query) $$;
create or replace function public.update_operation_view(p_project_id uuid,p_view_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.update_view(p_project_id,p_view_id,p_expected_updated_at,p_patch) $$;
create or replace function public.delete_operation_view(p_project_id uuid,p_view_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.delete_view(p_project_id,p_view_id,p_expected_updated_at) $$;

revoke all on function public.create_operation_cycle(uuid,text,text,date,date) from public,anon;
revoke all on function public.update_operation_cycle(uuid,uuid,timestamptz,jsonb) from public,anon;
revoke all on function public.set_operation_cycle_archive(uuid,uuid,boolean,timestamptz) from public,anon;
revoke all on function public.delete_operation_cycle(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.create_operation_module(uuid,text,text,text,text,date,date,text[]) from public,anon;
revoke all on function public.update_operation_module(uuid,uuid,timestamptz,jsonb) from public,anon;
revoke all on function public.set_operation_module_archive(uuid,uuid,boolean,timestamptz) from public,anon;
revoke all on function public.delete_operation_module(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.change_operation_module_issues(uuid,uuid,uuid[],boolean) from public,anon;
revoke all on function public.change_operation_issue_modules(uuid,uuid,uuid[],uuid[]) from public,anon;
revoke all on function public.create_operation_view(uuid,text,jsonb) from public,anon;
revoke all on function public.update_operation_view(uuid,uuid,timestamptz,jsonb) from public,anon;
revoke all on function public.delete_operation_view(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.create_operation_cycle(uuid,text,text,date,date) to authenticated;
grant execute on function public.update_operation_cycle(uuid,uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.set_operation_cycle_archive(uuid,uuid,boolean,timestamptz) to authenticated;
grant execute on function public.delete_operation_cycle(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.create_operation_module(uuid,text,text,text,text,date,date,text[]) to authenticated;
grant execute on function public.update_operation_module(uuid,uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.set_operation_module_archive(uuid,uuid,boolean,timestamptz) to authenticated;
grant execute on function public.delete_operation_module(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.change_operation_module_issues(uuid,uuid,uuid[],boolean) to authenticated;
grant execute on function public.change_operation_issue_modules(uuid,uuid,uuid[],uuid[]) to authenticated;
grant execute on function public.create_operation_view(uuid,text,jsonb) to authenticated;
grant execute on function public.update_operation_view(uuid,uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.delete_operation_view(uuid,uuid,timestamptz) to authenticated;

drop policy if exists op_cycles_all on public.op_cycles;
drop policy if exists op_modules_all on public.op_modules;
drop policy if exists op_module_members_all on public.op_module_members;
drop policy if exists op_views_all on public.op_views;
drop policy if exists op_issue_modules_all on public.op_issue_modules;
drop policy if exists op_cycles_read on public.op_cycles;
drop policy if exists op_modules_read on public.op_modules;
drop policy if exists op_module_members_read on public.op_module_members;
drop policy if exists op_views_read on public.op_views;
drop policy if exists op_issue_modules_read on public.op_issue_modules;
create policy op_cycles_read on public.op_cycles for select to authenticated using (public.my_key() is not null);
create policy op_modules_read on public.op_modules for select to authenticated using (public.my_key() is not null);
create policy op_module_members_read on public.op_module_members for select to authenticated using (public.my_key() is not null);
create policy op_views_read on public.op_views for select to authenticated using (public.my_key() is not null);
create policy op_issue_modules_read on public.op_issue_modules for select to authenticated using (public.my_key() is not null);

