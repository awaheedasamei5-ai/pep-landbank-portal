-- The active profile is the source of roster identity. Salary and bank data
-- remain unset until an authorized payroll operator supplies them.
create unique index if not exists payroll_staff_profile_key_unique
  on public.payroll_staff (profile_key)
  where profile_key is not null;

create schema if not exists app_finance_private;
revoke all on schema app_finance_private from public, anon, authenticated;

create or replace function app_finance_private.sync_profile_payroll_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.agent_key is null or btrim(new.agent_key) = '' or new.name is null or btrim(new.name) = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.active then
      insert into public.payroll_staff (profile_key, name, active)
      values (new.agent_key, new.name, true)
      on conflict (profile_key) where profile_key is not null do nothing;
    end if;
    return new;
  end if;

  -- A profile can be created before its name is filled. Enrol it when ready.
  if new.active then
    insert into public.payroll_staff (profile_key, name, active)
    values (new.agent_key, new.name, true)
    on conflict (profile_key) where profile_key is not null do nothing;
  end if;

  -- Follow a profile rename only while the payee still has the old profile
  -- name. An intentionally edited legal/bank payee name is left alone.
  if new.name is distinct from old.name then
    update public.payroll_staff
       set name = new.name
     where profile_key = new.agent_key
       and name = old.name;
  end if;

  -- Inactive profiles are removed from future payroll generation. Reactivation
  -- does not override a deliberate payroll exclusion made by Management.
  if new.active is false and old.active is distinct from false then
    update public.payroll_staff
       set active = false
     where profile_key = new.agent_key;
  end if;
  return new;
end;
$$;

revoke all on function app_finance_private.sync_profile_payroll_staff() from public, anon, authenticated;

drop trigger if exists finance_sync_profile_payroll_staff on public.profiles;
create trigger finance_sync_profile_payroll_staff
after insert or update of name, active on public.profiles
for each row execute function app_finance_private.sync_profile_payroll_staff();

insert into public.payroll_staff (profile_key, name, active)
select p.agent_key, p.name, true
  from public.profiles p
 where p.active
   and p.agent_key is not null and btrim(p.agent_key) <> ''
   and p.name is not null and btrim(p.name) <> ''
on conflict (profile_key) where profile_key is not null do nothing;
