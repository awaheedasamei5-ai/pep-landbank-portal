-- Keep employment identity and SMS destination under Management control.
-- Self-service bio fields are deliberately explicit; adding a column to profiles
-- cannot silently make it staff-editable.
create or replace function public.protect_profile_authorization_fields()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  v_manager boolean;
begin
  if current_user in ('postgres', 'service_role', 'supabase_auth_admin') then
    return new;
  end if;

  select (p.role = 'manager' and p.active is true)
    into v_manager from public.profiles p where p.id = auth.uid();
  if coalesce(v_manager, false) then return new; end if;

  if auth.uid() is null or auth.uid() <> old.id then
    raise exception 'Only the account owner or Management can update a staff profile.' using errcode = '42501';
  end if;

  if (to_jsonb(new) - array['address', 'avatar', 'social_handles',
                              'signature_data', 'last_seen_at', 'widget_token'])
     is distinct from
     (to_jsonb(old) - array['address', 'avatar', 'social_handles',
                              'signature_data', 'last_seen_at', 'widget_token']) then
    raise exception 'Only Management can change employment, identity and phone fields.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_profile_authorization_fields() from public, anon, authenticated;
