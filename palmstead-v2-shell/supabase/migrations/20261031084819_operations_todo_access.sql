-- First enforced Operations access slice: personal to-dos. Preserve existing
-- Staff defaults while allowing Management to restrict a specific account.
insert into public.permissions(key,label,description) values
  ('operations.todos.view','View Operations to-dos','Read your own and assigned Operations to-dos.'),
  ('operations.todos.manage','Manage Operations to-dos','Create and change to-dos permitted by ownership and assignment rules.')
on conflict (key) do update set label=excluded.label, description=excluded.description;

insert into public.role_permissions(role,permission_key)
select 'agent', key from public.permissions
where key in ('operations.todos.view','operations.todos.manage')
on conflict do nothing;

drop policy if exists op_todos_sel on public.op_todos;
create policy op_todos_sel on public.op_todos for select to authenticated
using (
  public.has_permission('operations.todos.view')
  and (assigned_to=public.my_key() or owner_key=public.my_key() or public.my_role()='manager')
);

-- This SECURITY DEFINER action is directly executable by authenticated users.
-- Keep its current implementation and insert the grant guard at its entry point,
-- so the public wrapper and direct private-schema calls have the same boundary.
do $migration$
declare
  v_definition text;
  v_anchor text := '  if v_actor.id is null or not v_actor.active then raise exception ''An active profile is required.'' using errcode=''42501''; end if;';
  v_guard text := E'\n  if not public.has_permission(''operations.todos.view'') or not public.has_permission(''operations.todos.manage'') then\n    raise exception ''To-do access is restricted.'' using errcode=''42501'';\n  end if;';
begin
  select pg_get_functiondef('app_operations_private.todo_action(text,jsonb)'::regprocedure)
    into v_definition;
  if v_definition is null or strpos(v_definition,v_anchor)=0
     or strpos(v_definition,'operations.todos.manage')>0 then
    raise exception 'Unexpected Operations to-do action definition; review before applying access guard.';
  end if;
  execute replace(v_definition,v_anchor,v_anchor||v_guard);
end;
$migration$;

