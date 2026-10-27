-- Finance authorization starts with explicit, audited assignments. Existing
-- profile.department text is not silently converted into authority.
create table if not exists public.finance_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);
create unique index if not exists finance_departments_name_key on public.finance_departments (lower(btrim(name)));

create table if not exists public.finance_staff_departments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  department_id uuid not null references public.finance_departments(id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles(id),
  ended_at timestamptz,
  ended_by uuid references public.profiles(id),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  check (ended_at is null or ended_at >= assigned_at)
);
create unique index if not exists finance_staff_one_current_department
  on public.finance_staff_departments(profile_id) where ended_at is null;

create table if not exists public.finance_role_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  finance_role text not null check (finance_role in ('finance_head','finance_operator','department_head','budget_owner','payroll_admin','auditor')),
  department_id uuid references public.finance_departments(id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles(id),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  revocation_reason text,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  check ((finance_role in ('department_head','budget_owner')) = (department_id is not null)),
  check (revoked_at is null or revoked_at >= assigned_at)
);
create unique index if not exists finance_role_one_current_assignment
  on public.finance_role_assignments(profile_id,finance_role,coalesce(department_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create unique index if not exists finance_role_one_current_head_per_department
  on public.finance_role_assignments(department_id)
  where revoked_at is null and finance_role = 'department_head';

alter table public.finance_departments enable row level security;
alter table public.finance_staff_departments enable row level security;
alter table public.finance_role_assignments enable row level security;
revoke all on public.finance_departments, public.finance_staff_departments, public.finance_role_assignments from anon;
grant select on public.finance_departments, public.finance_staff_departments, public.finance_role_assignments to authenticated;

create policy finance_departments_manager_read on public.finance_departments for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.role = 'manager'));
create policy finance_staff_departments_manager_read on public.finance_staff_departments for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.role = 'manager'));
create policy finance_roles_manager_read on public.finance_role_assignments for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.role = 'manager'));

create or replace function app_finance_private.require_manager()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id = v_actor and p.active and p.role = 'manager'
  ) then
    raise exception 'Management access required.' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;
revoke all on function app_finance_private.require_manager() from public, anon, authenticated;

create or replace function public.finance_create_department(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_manager(); v_id uuid;
begin
  insert into public.finance_departments(name,created_by)
  values (btrim(p_name),v_actor) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.finance_create_department(text) from public, anon;
grant execute on function public.finance_create_department(text) to authenticated;

create or replace function public.finance_assign_staff_department(p_profile_id uuid,p_department_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_manager(); v_id uuid;
begin
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason.' using errcode='22023'; end if;
  if not exists (select 1 from public.profiles p where p.id=p_profile_id and p.active)
    or not exists (select 1 from public.finance_departments d where d.id=p_department_id and d.active) then
    raise exception 'Choose an active staff member and department.' using errcode='22023';
  end if;
  update public.finance_staff_departments set ended_at=now(),ended_by=v_actor
   where profile_id=p_profile_id and ended_at is null and department_id is distinct from p_department_id;
  select id into v_id from public.finance_staff_departments
   where profile_id=p_profile_id and department_id=p_department_id and ended_at is null;
  if v_id is not null then return v_id; end if;
  insert into public.finance_staff_departments(profile_id,department_id,assigned_by,reason)
  values(p_profile_id,p_department_id,v_actor,btrim(p_reason)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.finance_assign_staff_department(uuid,uuid,text) from public, anon;
grant execute on function public.finance_assign_staff_department(uuid,uuid,text) to authenticated;

create or replace function public.finance_assign_role(p_profile_id uuid,p_role text,p_department_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_manager(); v_id uuid;
begin
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason.' using errcode='22023'; end if;
  if p_role not in ('finance_head','finance_operator','department_head','budget_owner','payroll_admin','auditor')
    or ((p_role in ('department_head','budget_owner')) is distinct from (p_department_id is not null)) then
    raise exception 'Choose a valid role and scope.' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_profile_id and p.active) then
    raise exception 'Choose an active staff member.' using errcode='22023';
  end if;
  if p_department_id is not null and not exists(select 1 from public.finance_departments d where d.id=p_department_id and d.active) then
    raise exception 'Choose an active department.' using errcode='22023';
  end if;
  select id into v_id from public.finance_role_assignments
   where profile_id=p_profile_id and finance_role=p_role and department_id is not distinct from p_department_id and revoked_at is null;
  if v_id is not null then return v_id; end if;
  insert into public.finance_role_assignments(profile_id,finance_role,department_id,assigned_by,reason)
  values(p_profile_id,p_role,p_department_id,v_actor,btrim(p_reason)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.finance_assign_role(uuid,text,uuid,text) from public, anon;
grant execute on function public.finance_assign_role(uuid,text,uuid,text) to authenticated;

create or replace function public.finance_revoke_role(p_assignment_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_manager();
begin
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason.' using errcode='22023'; end if;
  update public.finance_role_assignments set revoked_at=now(),revoked_by=v_actor,
    revocation_reason=btrim(p_reason)
   where id=p_assignment_id and revoked_at is null;
  if not found then raise exception 'Active assignment not found.' using errcode='22023'; end if;
end;
$$;
revoke all on function public.finance_revoke_role(uuid,text) from public, anon;
grant execute on function public.finance_revoke_role(uuid,text) to authenticated;
