-- Keep an audit trail for Management edits without putting full phone or ID
-- values into the general audit register.
create or replace function public.audit_management_profile_changes()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  v_fields text[] := array[]::text[];
begin
  if current_user <> 'authenticated' or auth.uid() is null then return new; end if;
  if new.name is distinct from old.name then v_fields := array_append(v_fields, 'name'); end if;
  if new.email is distinct from old.email then v_fields := array_append(v_fields, 'email'); end if;
  if new.role is distinct from old.role then v_fields := array_append(v_fields, 'role'); end if;
  if new.active is distinct from old.active then v_fields := array_append(v_fields, 'active'); end if;
  if new.department is distinct from old.department then v_fields := array_append(v_fields, 'department'); end if;
  if new.position is distinct from old.position then v_fields := array_append(v_fields, 'position'); end if;
  if new.phone is distinct from old.phone then v_fields := array_append(v_fields, 'phone'); end if;
  if cardinality(v_fields) > 0 then
    perform public.record_audit_event(
      'audit', 'profile.management_updated', 'warning', 'profiles', old.agent_key,
      'Management updated staff employment or contact fields.',
      jsonb_build_object('staffKey', old.agent_key, 'fields', to_jsonb(v_fields))
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_management_profile_changes() from public, anon, authenticated;
create trigger audit_management_profile_changes
after update on public.profiles
for each row execute function public.audit_management_profile_changes();
