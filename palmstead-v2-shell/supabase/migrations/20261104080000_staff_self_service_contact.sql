create or replace function public.protect_profile_authorization_fields()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  v_manager boolean;
  v_phone text;
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
                              'signature_data', 'last_seen_at', 'widget_token',
                              'phone', 'whatsapp', 'desk_extension', 'birthday'])
     is distinct from
     (to_jsonb(old) - array['address', 'avatar', 'social_handles',
                              'signature_data', 'last_seen_at', 'widget_token',
                              'phone', 'whatsapp', 'desk_extension', 'birthday']) then
    raise exception 'Only Management can change employment and authorization fields.' using errcode = '42501';
  end if;

  if new.phone is distinct from old.phone and new.phone is not null then
    v_phone := regexp_replace(new.phone, '[[:space:]()-]', '', 'g');
    if v_phone ~ '^0[0-9]{9}$' then v_phone := '+233' || substring(v_phone from 2); end if;
    if v_phone !~ '^[+]233[0-9]{9}$' then
      raise exception 'Enter a valid Ghana contact phone.' using errcode = '22023';
    end if;
    new.phone := v_phone;
  end if;
  if new.whatsapp is distinct from old.whatsapp and new.whatsapp is not null then
    v_phone := regexp_replace(new.whatsapp, '[[:space:]()-]', '', 'g');
    if v_phone ~ '^0[0-9]{9}$' then v_phone := '+233' || substring(v_phone from 2); end if;
    if v_phone !~ '^[+]233[0-9]{9}$' then
      raise exception 'Enter a valid Ghana WhatsApp phone.' using errcode = '22023';
    end if;
    new.whatsapp := v_phone;
  end if;
  if new.birthday is not null and new.birthday > current_date then
    raise exception 'Birthday cannot be in the future.' using errcode = '22023';
  end if;
  if length(coalesce(new.address, '')) > 300 or length(coalesce(new.desk_extension, '')) > 12 then
    raise exception 'A profile field is too long.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_authorization_fields() from public, anon, authenticated;
