-- Existing self-profile UPDATE policy also allowed self-promotion and reactivation.
-- Preserve ordinary bio-data/signature/presence updates while protecting identity
-- and authorization fields. Management and trusted server provisioning remain.
create or replace function public.protect_profile_authorization_fields()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_manager boolean;
begin
  if current_user in ('postgres', 'service_role', 'supabase_auth_admin') then return new; end if;
  select (p.role = 'manager' and p.active is true) into v_manager
    from public.profiles p where p.id = auth.uid();
  if coalesce(v_manager, false) then return new; end if;
  if new.id is distinct from old.id or new.agent_key is distinct from old.agent_key
    or new.role is distinct from old.role or new.active is distinct from old.active
    or new.created_at is distinct from old.created_at then
    raise exception 'Only active Management can change staff identity, role or active status.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_authorization_fields() from public, anon, authenticated;
create trigger protect_profile_authorization_fields before update on public.profiles
for each row execute function public.protect_profile_authorization_fields();
