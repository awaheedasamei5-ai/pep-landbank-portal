-- A valid Auth session is not, by itself, a Staff account. Staff profiles
-- come only from the invitation-backed Auth trigger or trusted provisioning.
-- Client portal users retain access only to profiles linked to their leads.
create or replace function public.my_role()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select role from public.profiles
  where id = auth.uid() and active is true
$$;

create or replace function public.my_key()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select agent_key from public.profiles
  where id = auth.uid() and active is true
$$;

drop policy if exists p_profiles_ins on public.profiles;

drop policy if exists p_profiles_sel on public.profiles;
create policy p_profiles_sel on public.profiles for select to public
using (
  auth.uid() is not null and (
    public.my_role() is not null
    or exists (
      select 1
      from public.client_portal_access cpa
      join public.leads l
        on right(regexp_replace(l.contact, '[^0-9]', '', 'g'), 9)
         = right(regexp_replace(cpa.client_contact, '[^0-9]', '', 'g'), 9)
      where cpa.auth_uid = auth.uid()
        and l.agent_key = profiles.agent_key
    )
  )
);

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

  if auth.uid() is null or auth.uid() <> old.id or old.active is not true then
    raise exception 'Only an active account owner or Management can update a staff profile.' using errcode = '42501';
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
