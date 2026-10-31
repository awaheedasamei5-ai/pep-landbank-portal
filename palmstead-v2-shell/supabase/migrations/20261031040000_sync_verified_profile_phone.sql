-- A contact phone becomes an SMS destination only after Supabase Auth has
-- verified ownership. The browser cannot supply the value to this RPC.
create or replace function public.sync_verified_profile_phone()
returns text
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_phone text;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select u.phone into v_phone from auth.users u
    where u.id = auth.uid() and u.phone_confirmed_at is not null;
  if v_phone is null or v_phone !~ '^\+233[0-9]{9}$' then
    raise exception 'A verified Ghana sign-in phone is required.' using errcode = '42501';
  end if;
  update public.profiles set phone = v_phone
    where id = auth.uid() and active is true
    returning agent_key into v_key;
  if v_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;
  perform public.record_audit_event(
    'audit', 'profile.phone_verified', 'info', 'profiles', v_key,
    'Staff verified a sign-in phone for account contact use.',
    jsonb_build_object('staffKey', v_key)
  );
  return v_phone;
end;
$$;

revoke all on function public.sync_verified_profile_phone() from public, anon;
grant execute on function public.sync_verified_profile_phone() to authenticated;
