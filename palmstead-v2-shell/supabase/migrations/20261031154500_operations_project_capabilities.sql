-- Read-only project access must report read-only capabilities to the UI.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('app_operations_private.issue_capabilities(uuid)'::regprocedure)
    into v_definition;
  if strpos(v_definition,'''can_edit'', app_operations_private.can_edit_issue(v_actor, v_issue)')=0 then
    raise exception 'Unexpected issue capabilities definition';
  end if;
  v_definition := replace(v_definition,
    '''can_edit'', app_operations_private.can_edit_issue(v_actor, v_issue)',
    '''can_edit'', public.has_permission(''operations.projects.manage'') and app_operations_private.can_edit_issue(v_actor, v_issue)');
  v_definition := replace(v_definition,
    '''can_manage_assignments'', v_actor.role = ''manager''',
    '''can_manage_assignments'', public.has_permission(''operations.projects.manage'') and v_actor.role = ''manager''');
  v_definition := replace(v_definition,
    '''can_archive'', v_actor.role = ''manager'' or v_issue.created_by = v_actor.agent_key',
    '''can_archive'', public.has_permission(''operations.projects.manage'') and (v_actor.role = ''manager'' or v_issue.created_by = v_actor.agent_key)');
  v_definition := replace(v_definition,
    '''can_restore'', v_actor.role = ''manager'' or v_issue.created_by = v_actor.agent_key',
    '''can_restore'', public.has_permission(''operations.projects.manage'') and (v_actor.role = ''manager'' or v_issue.created_by = v_actor.agent_key)');
  execute v_definition;
end;
$migration$;

