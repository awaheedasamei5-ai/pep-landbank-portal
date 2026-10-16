-- Atomic, permission-checked Operations work-item edits and recoverable removal.
-- Existing direct writers remain in place until every Operations mutation has
-- been ported; this migration only moves the active issue-detail paths behind
-- reviewed RPCs and closes the anonymous sequence-function grant.

create schema if not exists app_operations_private;
revoke all on schema app_operations_private from public, anon, authenticated;
grant usage on schema app_operations_private to authenticated;

create or replace function app_operations_private.current_actor()
returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update Operations work.' using errcode = '42501';
  end if;

  select p.* into v_actor
  from public.profiles p
  where p.id = auth.uid() and p.active is true
  for share;

  if not found or v_actor.agent_key is null then
    raise exception 'Your active staff profile is unavailable.' using errcode = '42501';
  end if;

  return v_actor;
end;
$$;

create or replace function app_operations_private.can_edit_issue(
  p_actor public.profiles,
  p_issue public.op_issues
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_actor.role = 'manager'
    or p_issue.created_by = p_actor.agent_key
    or exists (
      select 1 from public.op_issue_assignees a
      where a.issue_id = p_issue.id and a.assignee_key = p_actor.agent_key
    )
    or exists (
      select 1 from public.op_project_members m
      where m.project_id = p_issue.project_id and m.member_key = p_actor.agent_key
    )
$$;

create or replace function app_operations_private.issue_capabilities(p_issue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_issue public.op_issues%rowtype;
begin
  select i.* into v_issue from public.op_issues i where i.id = p_issue_id;
  if not found then
    raise exception 'Work item not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'can_edit', app_operations_private.can_edit_issue(v_actor, v_issue),
    'can_manage_assignments', v_actor.role = 'manager',
    'can_archive', v_actor.role = 'manager' or v_issue.created_by = v_actor.agent_key,
    'can_restore', v_actor.role = 'manager' or v_issue.created_by = v_actor.agent_key,
    'actor_key', v_actor.agent_key,
    'actor_role', v_actor.role
  );
end;
$$;

create or replace function app_operations_private.update_issue(
  p_issue_id uuid,
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
  v_before public.op_issues%rowtype;
  v_after public.op_issues%rowtype;
  v_patch_keys text[];
  v_allowed_keys constant text[] := array[
    'name','description_html','state_id','priority','parent_id','cycle_id',
    'start_date','target_date','is_draft','sort_order','assignee_ids','label_ids','module_ids'
  ];
  v_name text;
  v_description text;
  v_state_id uuid;
  v_priority text;
  v_parent_id uuid;
  v_cycle_id uuid;
  v_start_date date;
  v_target_date date;
  v_assignees text[];
  v_labels uuid[];
  v_modules uuid[];
  v_old_ids text;
  v_new_ids text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Choose at least one field to update.' using errcode = '22023';
  end if;

  select array_agg(key order by key) into v_patch_keys from jsonb_object_keys(p_patch) key;
  if not v_patch_keys <@ v_allowed_keys then
    raise exception 'The update contains an unsupported field.' using errcode = '22023';
  end if;

  select i.* into v_before from public.op_issues i where i.id = p_issue_id for update;
  if not found then raise exception 'Work item not found.' using errcode = 'P0002'; end if;
  if v_before.archived_at is not null then raise exception 'Restore this work item before editing it.' using errcode = '22023'; end if;
  if not app_operations_private.can_edit_issue(v_actor, v_before) then
    raise exception 'You do not have permission to edit this work item.' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'This work item changed after you opened it. Reload and try again.' using errcode = '40001';
  end if;

  v_name := case when p_patch ? 'name' then btrim(p_patch->>'name') else v_before.name end;
  if v_name is null or length(v_name) not between 1 and 300 then
    raise exception 'Work-item title must be between 1 and 300 characters.' using errcode = '22023';
  end if;
  v_description := case when p_patch ? 'description_html' then nullif(p_patch->>'description_html','') else v_before.description_html end;
  if length(coalesce(v_description,'')) > 100000 then
    raise exception 'Description is too long.' using errcode = '22023';
  end if;
  v_priority := case when p_patch ? 'priority' then p_patch->>'priority' else v_before.priority end;
  if v_priority not in ('none','low','medium','high','urgent') then
    raise exception 'Choose a valid priority.' using errcode = '22023';
  end if;
  v_state_id := case when p_patch ? 'state_id' then nullif(p_patch->>'state_id','')::uuid else v_before.state_id end;
  if v_state_id is not null and not exists (
    select 1 from public.op_states s where s.id = v_state_id and s.project_id = v_before.project_id
  ) then raise exception 'Choose a state from this project.' using errcode = '22023'; end if;
  v_cycle_id := case when p_patch ? 'cycle_id' then nullif(p_patch->>'cycle_id','')::uuid else v_before.cycle_id end;
  if v_cycle_id is not null and not exists (
    select 1 from public.op_cycles c where c.id = v_cycle_id and c.project_id = v_before.project_id
  ) then raise exception 'Choose a cycle from this project.' using errcode = '22023'; end if;
  v_parent_id := case when p_patch ? 'parent_id' then nullif(p_patch->>'parent_id','')::uuid else v_before.parent_id end;
  if v_parent_id = v_before.id then raise exception 'A work item cannot be its own parent.' using errcode = '22023'; end if;
  if v_parent_id is not null and not exists (
    select 1 from public.op_issues i where i.id = v_parent_id and i.project_id = v_before.project_id
  ) then raise exception 'Choose a parent from this project.' using errcode = '22023'; end if;
  if v_parent_id is not null and exists (
    with recursive descendants as (
      select i.id from public.op_issues i where i.parent_id = v_before.id
      union all
      select i.id from public.op_issues i join descendants d on i.parent_id = d.id
    ) select 1 from descendants where id = v_parent_id
  ) then raise exception 'That parent would create a work-item cycle.' using errcode = '22023'; end if;
  v_start_date := case when p_patch ? 'start_date' then nullif(p_patch->>'start_date','')::date else v_before.start_date end;
  v_target_date := case when p_patch ? 'target_date' then nullif(p_patch->>'target_date','')::date else v_before.target_date end;
  if v_start_date is not null and v_target_date is not null and v_start_date > v_target_date then
    raise exception 'Start date cannot be after due date.' using errcode = '22023';
  end if;

  if p_patch ? 'assignee_ids' then
    if v_actor.role <> 'manager' then
      raise exception 'Only Management can change assignees.' using errcode = '42501';
    end if;
    if jsonb_typeof(p_patch->'assignee_ids') <> 'array' then raise exception 'Assignees must be a list.' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct value order by value),'{}') into v_assignees
    from jsonb_array_elements_text(p_patch->'assignee_ids');
    if cardinality(v_assignees) > 50 or exists (
      select 1 from unnest(v_assignees) k
      where not exists (select 1 from public.profiles p where p.agent_key = k and p.active is true)
    ) then raise exception 'Choose up to 50 active staff members.' using errcode = '22023'; end if;
  end if;
  if p_patch ? 'label_ids' then
    if jsonb_typeof(p_patch->'label_ids') <> 'array' then raise exception 'Labels must be a list.' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into v_labels
    from jsonb_array_elements_text(p_patch->'label_ids');
    if cardinality(v_labels) > 50 or exists (
      select 1 from unnest(v_labels) x where not exists (
        select 1 from public.op_labels l where l.id = x and l.project_id = v_before.project_id
      )
    ) then raise exception 'Choose labels from this project.' using errcode = '22023'; end if;
  end if;
  if p_patch ? 'module_ids' then
    if jsonb_typeof(p_patch->'module_ids') <> 'array' then raise exception 'Modules must be a list.' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into v_modules
    from jsonb_array_elements_text(p_patch->'module_ids');
    if cardinality(v_modules) > 50 or exists (
      select 1 from unnest(v_modules) x where not exists (
        select 1 from public.op_modules m where m.id = x and m.project_id = v_before.project_id
      )
    ) then raise exception 'Choose modules from this project.' using errcode = '22023'; end if;
  end if;

  update public.op_issues i set
    name = v_name,
    description_html = v_description,
    state_id = v_state_id,
    priority = v_priority,
    parent_id = v_parent_id,
    cycle_id = v_cycle_id,
    start_date = v_start_date,
    target_date = v_target_date,
    is_draft = case when p_patch ? 'is_draft' then (p_patch->>'is_draft')::boolean else v_before.is_draft end,
    sort_order = case when p_patch ? 'sort_order' then (p_patch->>'sort_order')::numeric else v_before.sort_order end,
    completed_at = case
      when v_state_id is null then null
      when exists (select 1 from public.op_states s where s.id = v_state_id and s."group" = 'completed')
        then coalesce(v_before.completed_at, clock_timestamp())
      else null
    end,
    updated_by = v_actor.agent_key,
    updated_at = clock_timestamp()
  where i.id = v_before.id
  returning i.* into v_after;

  if p_patch ? 'assignee_ids' then
    select string_agg(a.assignee_key, ',' order by a.assignee_key) into v_old_ids
    from public.op_issue_assignees a where a.issue_id = v_before.id;
    delete from public.op_issue_assignees a where a.issue_id = v_before.id;
    insert into public.op_issue_assignees(issue_id,assignee_key)
      select v_before.id, value from unnest(v_assignees) value;
    v_new_ids := array_to_string(v_assignees, ',');
    if coalesce(v_old_ids,'') is distinct from coalesce(v_new_ids,'') then
      insert into public.op_issue_activity(issue_id,actor_key,verb,field,old_value,new_value)
      values(v_before.id,v_actor.agent_key,'updated','assignees',v_old_ids,v_new_ids);
    end if;
  end if;
  if p_patch ? 'label_ids' then
    delete from public.op_issue_labels x where x.issue_id = v_before.id;
    insert into public.op_issue_labels(issue_id,label_id) select v_before.id, value from unnest(v_labels) value;
  end if;
  if p_patch ? 'module_ids' then
    delete from public.op_issue_modules x where x.issue_id = v_before.id;
    insert into public.op_issue_modules(issue_id,module_id) select v_before.id, value from unnest(v_modules) value;
  end if;

  insert into public.op_issue_activity(issue_id,actor_key,verb,field,old_value,new_value)
  select v_before.id,v_actor.agent_key,'updated',d.field,d.old_value,d.new_value
  from (values
    ('name',v_before.name,v_after.name),
    ('description',v_before.description_html,v_after.description_html),
    ('state',v_before.state_id::text,v_after.state_id::text),
    ('priority',v_before.priority,v_after.priority),
    ('parent',v_before.parent_id::text,v_after.parent_id::text),
    ('cycle',v_before.cycle_id::text,v_after.cycle_id::text),
    ('start_date',v_before.start_date::text,v_after.start_date::text),
    ('target_date',v_before.target_date::text,v_after.target_date::text)
  ) d(field,old_value,new_value)
  where d.old_value is distinct from d.new_value;

  return to_jsonb(v_after);
end;
$$;

create or replace function app_operations_private.archive_issue(
  p_issue_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_issue public.op_issues%rowtype;
begin
  select i.* into v_issue from public.op_issues i where i.id = p_issue_id for update;
  if not found then raise exception 'Work item not found.' using errcode = 'P0002'; end if;
  if v_actor.role <> 'manager' and v_issue.created_by is distinct from v_actor.agent_key then
    raise exception 'Only Management or the creator can archive this work item.' using errcode = '42501';
  end if;
  if v_issue.archived_at is not null then return to_jsonb(v_issue); end if;
  if p_expected_updated_at is null or v_issue.updated_at is distinct from p_expected_updated_at then
    raise exception 'This work item changed after you opened it. Reload and try again.' using errcode = '40001';
  end if;
  if exists (select 1 from public.op_issues child where child.parent_id = v_issue.id and child.archived_at is null) then
    raise exception 'Archive or move this work item''s active sub-items first.' using errcode = '23503';
  end if;

  update public.op_issues i set archived_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=v_actor.agent_key
  where i.id=v_issue.id returning i.* into v_issue;
  insert into public.op_issue_activity(issue_id,actor_key,verb,field,old_value,new_value)
  values(v_issue.id,v_actor.agent_key,'archived','archived_at',null,v_issue.archived_at::text);
  return to_jsonb(v_issue);
end;
$$;

create or replace function app_operations_private.restore_issue(p_issue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_issue public.op_issues%rowtype;
begin
  select i.* into v_issue from public.op_issues i where i.id = p_issue_id for update;
  if not found then raise exception 'Work item not found.' using errcode = 'P0002'; end if;
  if v_actor.role <> 'manager' and v_issue.created_by is distinct from v_actor.agent_key then
    raise exception 'Only Management or the creator can restore this work item.' using errcode = '42501';
  end if;
  if v_issue.archived_at is null then return to_jsonb(v_issue); end if;

  update public.op_issues i set archived_at=null,updated_at=clock_timestamp(),updated_by=v_actor.agent_key
  where i.id=v_issue.id returning i.* into v_issue;
  insert into public.op_issue_activity(issue_id,actor_key,verb,field,old_value,new_value)
  values(v_issue.id,v_actor.agent_key,'restored','archived_at','archived',null);
  return to_jsonb(v_issue);
end;
$$;

create or replace function public.get_operation_issue_capabilities(p_issue_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_operations_private.issue_capabilities(p_issue_id) $$;

create or replace function public.update_operation_issue(
  p_issue_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_operations_private.update_issue(p_issue_id,p_expected_updated_at,p_patch) $$;

create or replace function public.archive_operation_issue(p_issue_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_operations_private.archive_issue(p_issue_id,p_expected_updated_at) $$;

create or replace function public.restore_operation_issue(p_issue_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_operations_private.restore_issue(p_issue_id) $$;

revoke all on function app_operations_private.current_actor() from public, anon;
revoke all on function app_operations_private.can_edit_issue(public.profiles,public.op_issues) from public, anon;
revoke all on function app_operations_private.issue_capabilities(uuid) from public, anon;
revoke all on function app_operations_private.update_issue(uuid,timestamptz,jsonb) from public, anon;
revoke all on function app_operations_private.archive_issue(uuid,timestamptz) from public, anon;
revoke all on function app_operations_private.restore_issue(uuid) from public, anon;
grant execute on function app_operations_private.current_actor() to authenticated;
grant execute on function app_operations_private.can_edit_issue(public.profiles,public.op_issues) to authenticated;
grant execute on function app_operations_private.issue_capabilities(uuid) to authenticated;
grant execute on function app_operations_private.update_issue(uuid,timestamptz,jsonb) to authenticated;
grant execute on function app_operations_private.archive_issue(uuid,timestamptz) to authenticated;
grant execute on function app_operations_private.restore_issue(uuid) to authenticated;

revoke all on function public.get_operation_issue_capabilities(uuid) from public, anon;
revoke all on function public.update_operation_issue(uuid,timestamptz,jsonb) from public, anon;
revoke all on function public.archive_operation_issue(uuid,timestamptz) from public, anon;
revoke all on function public.restore_operation_issue(uuid) from public, anon;
grant execute on function public.get_operation_issue_capabilities(uuid) to authenticated;
grant execute on function public.update_operation_issue(uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.archive_operation_issue(uuid,timestamptz) to authenticated;
grant execute on function public.restore_operation_issue(uuid) to authenticated;

-- This function was accidentally executable by anon. It updates a project
-- counter and must never be reachable without a signed-in staff identity.
revoke execute on function public.op_claim_issue_sequence(uuid) from public, anon;
grant execute on function public.op_claim_issue_sequence(uuid) to authenticated;

