-- Pending staff invitations have a bounded lifetime. Existing pending rows
-- receive the same two-week window when this migration is applied.
alter table public.allowed_emails
  add column if not exists expires_at timestamptz not null default (now() + interval '14 days');

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_name text;
  v_base_key text;
  v_key text;
  v_n integer := 1;
  v_invite record;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;
  if new.email is null then
    raise exception 'Staff invitation required.' using errcode = '28000';
  end if;
  select * into v_invite from public.allowed_emails
    where lower(email) = lower(new.email) and expires_at > now() limit 1;
  if v_invite is null then
    raise exception 'Staff invitation required.' using errcode = '28000';
  end if;

  v_name := coalesce(nullif(trim(v_invite.name), ''), split_part(new.email, '@', 1));
  v_base_key := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '', 'g'));
  if v_base_key is null or v_base_key = '' then v_base_key := 'agent'; end if;
  v_key := v_base_key;
  while exists (select 1 from public.profiles where agent_key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base_key || v_n::text;
  end loop;

  insert into public.profiles (id, email, name, role, agent_key, active)
  values (new.id, new.email, v_name, 'agent', v_key, true)
  on conflict (id) do nothing;
  delete from public.allowed_emails where lower(email) = lower(new.email);
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
