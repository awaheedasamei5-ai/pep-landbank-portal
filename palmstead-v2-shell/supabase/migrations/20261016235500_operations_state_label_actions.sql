-- Guard Operations project state and label configuration behind audited server actions.

create or replace function app_operations_private.assert_project_manager(p_project_id uuid)
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
    raise exception 'Restore this project before changing its settings.' using errcode = '22023';
  end if;
  if not app_operations_private.can_manage_project(v_actor, v_project) then
    raise exception 'You do not have permission to manage this project.' using errcode = '42501';
  end if;
  return v_project;
end;
$$;

create or replace function app_operations_private.create_state(
  p_project_id uuid,
  p_name text,
  p_color text,
  p_group text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_manager(p_project_id);
  v_state public.op_states%rowtype;
  v_name text := btrim(p_name);
  v_color text := upper(btrim(coalesce(p_color, '#60646C')));
begin
  if length(v_name) not between 1 and 80 then
    raise exception 'State name must be between 1 and 80 characters.' using errcode = '22023';
  end if;
  if v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Choose a valid six-digit colour.' using errcode = '22023';
  end if;
  if p_group not in ('backlog','unstarted','started','completed','cancelled') then
    raise exception 'Choose a valid state group.' using errcode = '22023';
  end if;
  if exists (select 1 from public.op_states s where s.project_id=p_project_id and lower(s.name)=lower(v_name)) then
    raise exception 'A state with this name already exists.' using errcode = '23505';
  end if;

  insert into public.op_states(workspace_id,project_id,name,color,"group",sequence,"order","default",updated_at)
  select v_project.workspace_id,v_project.id,v_name,v_color,p_group,
    coalesce(max(s.sequence),0)+10000,coalesce(max(s."order"),-1)+1,false,clock_timestamp()
  from public.op_states s where s.project_id=v_project.id
  returning * into v_state;

  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','state_created',v_actor.agent_key,v_actor.name,'operations_state',v_state.id::text,
    'Created project state '||v_state.name,jsonb_build_object('project_id',v_project.id,'after',to_jsonb(v_state)),'server');
  return to_jsonb(v_state);
end;
$$;

create or replace function app_operations_private.update_state(
  p_project_id uuid,
  p_state_id uuid,
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
  v_project public.op_projects%rowtype := app_operations_private.assert_project_manager(p_project_id);
  v_before public.op_states%rowtype;
  v_after public.op_states%rowtype;
  v_keys text[];
  v_allowed constant text[] := array['name','color','description','group','sequence','order'];
  v_name text;
  v_color text;
  v_description text;
  v_group text;
  v_sequence numeric;
  v_order integer;
  v_affected integer := 0;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch='{}'::jsonb then
    raise exception 'Choose at least one state field to update.' using errcode='22023';
  end if;
  select array_agg(key order by key) into v_keys from jsonb_object_keys(p_patch) key;
  if not v_keys <@ v_allowed then raise exception 'The state update contains an unsupported field.' using errcode='22023'; end if;

  select s.* into v_before from public.op_states s where s.id=p_state_id and s.project_id=v_project.id for update;
  if not found then raise exception 'State not found in this project.' using errcode='P0002'; end if;
  if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'This state changed after you opened it. Reload and try again.' using errcode='40001';
  end if;

  v_name := case when p_patch ? 'name' then btrim(p_patch->>'name') else v_before.name end;
  v_color := case when p_patch ? 'color' then upper(btrim(p_patch->>'color')) else v_before.color end;
  v_description := case when p_patch ? 'description' then nullif(btrim(p_patch->>'description'),'') else v_before.description end;
  v_group := case when p_patch ? 'group' then p_patch->>'group' else v_before."group" end;
  v_sequence := case when p_patch ? 'sequence' then (p_patch->>'sequence')::numeric else v_before.sequence end;
  v_order := case when p_patch ? 'order' then (p_patch->>'order')::integer else v_before."order" end;
  if length(v_name) not between 1 and 80 then raise exception 'State name must be between 1 and 80 characters.' using errcode='22023'; end if;
  if v_color !~ '^#[0-9A-F]{6}$' then raise exception 'Choose a valid six-digit colour.' using errcode='22023'; end if;
  if length(coalesce(v_description,'')) > 500 then raise exception 'State description is too long.' using errcode='22023'; end if;
  if v_group not in ('backlog','unstarted','started','completed','cancelled') then raise exception 'Choose a valid state group.' using errcode='22023'; end if;
  if v_sequence < -1000000000 or v_sequence > 1000000000 or v_order < -1000000 or v_order > 1000000 then
    raise exception 'State position is outside the supported range.' using errcode='22023';
  end if;
  if exists (select 1 from public.op_states s where s.project_id=v_project.id and s.id<>v_before.id and lower(s.name)=lower(v_name)) then
    raise exception 'A state with this name already exists.' using errcode='23505';
  end if;

  update public.op_states s set name=v_name,color=v_color,description=v_description,"group"=v_group,
    sequence=v_sequence,"order"=v_order,updated_at=clock_timestamp()
  where s.id=v_before.id returning * into v_after;

  if v_before."group" is distinct from v_after."group" then
    update public.op_issues i set
      completed_at=case when v_after."group"='completed' then coalesce(i.completed_at,clock_timestamp()) else null end,
      updated_at=clock_timestamp(),updated_by=v_actor.agent_key
    where i.state_id=v_after.id;
    get diagnostics v_affected = row_count;
  end if;

  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','state_updated',v_actor.agent_key,v_actor.name,'operations_state',v_after.id::text,
    'Updated project state '||v_after.name,jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_before),'after',to_jsonb(v_after),'issues_reconciled',v_affected),'server');
  return to_jsonb(v_after);
end;
$$;

create or replace function app_operations_private.set_default_state(
  p_project_id uuid,
  p_state_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_manager(p_project_id);
  v_state public.op_states%rowtype;
begin
  select s.* into v_state from public.op_states s where s.id=p_state_id and s.project_id=v_project.id for update;
  if not found then raise exception 'State not found in this project.' using errcode='P0002'; end if;
  if p_expected_updated_at is null or v_state.updated_at is distinct from p_expected_updated_at then
    raise exception 'This state changed after you opened it. Reload and try again.' using errcode='40001';
  end if;
  update public.op_states set "default"=false,updated_at=clock_timestamp() where project_id=v_project.id and "default" is true and id<>v_state.id;
  update public.op_states set "default"=true,updated_at=clock_timestamp() where id=v_state.id returning * into v_state;
  update public.op_projects set default_state_id=v_state.id,updated_by=v_actor.agent_key,updated_at=clock_timestamp() where id=v_project.id;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','state_defaulted',v_actor.agent_key,v_actor.name,'operations_state',v_state.id::text,
    'Set default project state to '||v_state.name,jsonb_build_object('project_id',v_project.id),'server');
  return to_jsonb(v_state);
end;
$$;

create or replace function app_operations_private.delete_state(
  p_project_id uuid,
  p_state_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_manager(p_project_id);
  v_state public.op_states%rowtype;
begin
  select s.* into v_state from public.op_states s where s.id=p_state_id and s.project_id=v_project.id for update;
  if not found then raise exception 'State not found in this project.' using errcode='P0002'; end if;
  if p_expected_updated_at is null or v_state.updated_at is distinct from p_expected_updated_at then
    raise exception 'This state changed after you opened it. Reload and try again.' using errcode='40001';
  end if;
  if (select count(*) from public.op_states s where s.project_id=v_project.id) <= 1 then
    raise exception 'A project must keep at least one state.' using errcode='23514';
  end if;
  if v_state."default" or v_project.default_state_id=v_state.id then
    raise exception 'Choose another default state before deleting this one.' using errcode='23503';
  end if;
  if exists(select 1 from public.op_issues i where i.state_id=v_state.id) then
    raise exception 'Move work items out of this state before deleting it.' using errcode='23503';
  end if;
  delete from public.op_states where id=v_state.id;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','state_deleted',v_actor.agent_key,v_actor.name,'operations_state',v_state.id::text,
    'Deleted project state '||v_state.name,jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_state)),'server');
  return to_jsonb(v_state);
end;
$$;

create or replace function app_operations_private.create_label(
  p_project_id uuid,
  p_name text,
  p_color text,
  p_parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_manager(p_project_id);
  v_label public.op_labels%rowtype;
  v_name text := btrim(p_name);
  v_color text := upper(btrim(coalesce(p_color,'#60646C')));
begin
  if length(v_name) not between 1 and 80 then raise exception 'Label name must be between 1 and 80 characters.' using errcode='22023'; end if;
  if v_color !~ '^#[0-9A-F]{6}$' then raise exception 'Choose a valid six-digit colour.' using errcode='22023'; end if;
  if p_parent_id is not null and not exists(select 1 from public.op_labels l where l.id=p_parent_id and l.project_id=v_project.id) then
    raise exception 'Choose a parent label from this project.' using errcode='22023';
  end if;
  if exists(select 1 from public.op_labels l where l.project_id=v_project.id and lower(l.name)=lower(v_name)) then
    raise exception 'A label with this name already exists.' using errcode='23505';
  end if;
  insert into public.op_labels(workspace_id,project_id,name,color,parent_id,sort_order,updated_at)
  select v_project.workspace_id,v_project.id,v_name,v_color,p_parent_id,coalesce(max(l.sort_order),0)+10000,clock_timestamp()
  from public.op_labels l where l.project_id=v_project.id returning * into v_label;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','label_created',v_actor.agent_key,v_actor.name,'operations_label',v_label.id::text,
    'Created project label '||v_label.name,jsonb_build_object('project_id',v_project.id,'after',to_jsonb(v_label)),'server');
  return to_jsonb(v_label);
end;
$$;

create or replace function app_operations_private.update_label(
  p_project_id uuid,
  p_label_id uuid,
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
  v_project public.op_projects%rowtype := app_operations_private.assert_project_manager(p_project_id);
  v_before public.op_labels%rowtype;
  v_after public.op_labels%rowtype;
  v_keys text[];
  v_allowed constant text[] := array['name','color','parent_id','sort_order'];
  v_name text;
  v_color text;
  v_parent uuid;
  v_sort numeric;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Choose at least one label field to update.' using errcode='22023'; end if;
  select array_agg(key order by key) into v_keys from jsonb_object_keys(p_patch) key;
  if not v_keys <@ v_allowed then raise exception 'The label update contains an unsupported field.' using errcode='22023'; end if;
  select l.* into v_before from public.op_labels l where l.id=p_label_id and l.project_id=v_project.id for update;
  if not found then raise exception 'Label not found in this project.' using errcode='P0002'; end if;
  if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then raise exception 'This label changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  v_name := case when p_patch ? 'name' then btrim(p_patch->>'name') else v_before.name end;
  v_color := case when p_patch ? 'color' then upper(btrim(p_patch->>'color')) else v_before.color end;
  v_parent := case when p_patch ? 'parent_id' then nullif(p_patch->>'parent_id','')::uuid else v_before.parent_id end;
  v_sort := case when p_patch ? 'sort_order' then (p_patch->>'sort_order')::numeric else v_before.sort_order end;
  if length(v_name) not between 1 and 80 then raise exception 'Label name must be between 1 and 80 characters.' using errcode='22023'; end if;
  if v_color !~ '^#[0-9A-F]{6}$' then raise exception 'Choose a valid six-digit colour.' using errcode='22023'; end if;
  if v_sort < -1000000000 or v_sort > 1000000000 then raise exception 'Label position is outside the supported range.' using errcode='22023'; end if;
  if v_parent=v_before.id then raise exception 'A label cannot be its own parent.' using errcode='22023'; end if;
  if v_parent is not null and not exists(select 1 from public.op_labels l where l.id=v_parent and l.project_id=v_project.id) then raise exception 'Choose a parent label from this project.' using errcode='22023'; end if;
  if v_parent is not null and exists(
    with recursive descendants as (
      select l.id from public.op_labels l where l.parent_id=v_before.id
      union all select l.id from public.op_labels l join descendants d on l.parent_id=d.id
    ) select 1 from descendants where id=v_parent
  ) then raise exception 'That parent would create a label cycle.' using errcode='22023'; end if;
  if exists(select 1 from public.op_labels l where l.project_id=v_project.id and l.id<>v_before.id and lower(l.name)=lower(v_name)) then raise exception 'A label with this name already exists.' using errcode='23505'; end if;
  update public.op_labels set name=v_name,color=v_color,parent_id=v_parent,sort_order=v_sort,updated_at=clock_timestamp()
  where id=v_before.id returning * into v_after;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','label_updated',v_actor.agent_key,v_actor.name,'operations_label',v_after.id::text,
    'Updated project label '||v_after.name,jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_before),'after',to_jsonb(v_after)),'server');
  return to_jsonb(v_after);
end;
$$;

create or replace function app_operations_private.delete_label(
  p_project_id uuid,
  p_label_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_project public.op_projects%rowtype := app_operations_private.assert_project_manager(p_project_id);
  v_label public.op_labels%rowtype;
  v_usage integer;
begin
  select l.* into v_label from public.op_labels l where l.id=p_label_id and l.project_id=v_project.id for update;
  if not found then raise exception 'Label not found in this project.' using errcode='P0002'; end if;
  if p_expected_updated_at is null or v_label.updated_at is distinct from p_expected_updated_at then raise exception 'This label changed after you opened it. Reload and try again.' using errcode='40001'; end if;
  if exists(select 1 from public.op_labels child where child.parent_id=v_label.id) then raise exception 'Move or delete this label''s child labels first.' using errcode='23503'; end if;
  select count(*) into v_usage from public.op_issue_labels x where x.label_id=v_label.id;
  delete from public.op_labels where id=v_label.id;
  insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
  values('operations','label_deleted',v_actor.agent_key,v_actor.name,'operations_label',v_label.id::text,
    'Deleted project label '||v_label.name,jsonb_build_object('project_id',v_project.id,'before',to_jsonb(v_label),'issue_links_removed',v_usage),'server');
  return jsonb_build_object('label',to_jsonb(v_label),'issue_links_removed',v_usage);
end;
$$;

create or replace function public.create_operation_state(p_project_id uuid,p_name text,p_color text,p_group text)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.create_state(p_project_id,p_name,p_color,p_group) $$;
create or replace function public.update_operation_state(p_project_id uuid,p_state_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.update_state(p_project_id,p_state_id,p_expected_updated_at,p_patch) $$;
create or replace function public.set_operation_default_state(p_project_id uuid,p_state_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.set_default_state(p_project_id,p_state_id,p_expected_updated_at) $$;
create or replace function public.delete_operation_state(p_project_id uuid,p_state_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.delete_state(p_project_id,p_state_id,p_expected_updated_at) $$;
create or replace function public.create_operation_label(p_project_id uuid,p_name text,p_color text,p_parent_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.create_label(p_project_id,p_name,p_color,p_parent_id) $$;
create or replace function public.update_operation_label(p_project_id uuid,p_label_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.update_label(p_project_id,p_label_id,p_expected_updated_at,p_patch) $$;
create or replace function public.delete_operation_label(p_project_id uuid,p_label_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select app_operations_private.delete_label(p_project_id,p_label_id,p_expected_updated_at) $$;

revoke all on function public.create_operation_state(uuid,text,text,text) from public,anon;
revoke all on function public.update_operation_state(uuid,uuid,timestamptz,jsonb) from public,anon;
revoke all on function public.set_operation_default_state(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.delete_operation_state(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.create_operation_label(uuid,text,text,uuid) from public,anon;
revoke all on function public.update_operation_label(uuid,uuid,timestamptz,jsonb) from public,anon;
revoke all on function public.delete_operation_label(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.create_operation_state(uuid,text,text,text) to authenticated;
grant execute on function public.update_operation_state(uuid,uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.set_operation_default_state(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.delete_operation_state(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.create_operation_label(uuid,text,text,uuid) to authenticated;
grant execute on function public.update_operation_label(uuid,uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.delete_operation_label(uuid,uuid,timestamptz) to authenticated;

drop policy if exists op_states_all on public.op_states;
drop policy if exists op_labels_all on public.op_labels;
drop policy if exists op_states_read on public.op_states;
drop policy if exists op_labels_read on public.op_labels;
create policy op_states_read on public.op_states for select to authenticated using (public.my_key() is not null);
create policy op_labels_read on public.op_labels for select to authenticated using (public.my_key() is not null);

