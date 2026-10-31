-- The previous testing-phase version of has_permission returned true to every
-- signed-in caller. Preserve today's access as the agent role default, then
-- restore effective per-staff overrides so Management can actually deny it.
insert into public.role_permissions (role, permission_key)
select 'agent', key from public.permissions
on conflict do nothing;

create or replace function public.has_permission(p_key text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_key text;
  v_role text;
  v_granted boolean;
begin
  if auth.uid() is null or not exists (select 1 from public.permissions where key = p_key) then
    return false;
  end if;
  select agent_key, role into v_key, v_role
    from public.profiles where id = auth.uid() and active is true;
  if not found then return false; end if;
  if v_role = 'manager' then return true; end if;

  select granted into v_granted
    from public.staff_permission_overrides
    where staff_key = v_key and permission_key = p_key;
  if found then return v_granted; end if;

  return exists (
    select 1 from public.role_permissions
    where role = v_role and permission_key = p_key
  );
end;
$$;

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;
