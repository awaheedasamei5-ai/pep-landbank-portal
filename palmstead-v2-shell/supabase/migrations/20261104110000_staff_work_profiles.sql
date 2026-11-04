create table public.staff_work_profiles (
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 professional_title text,
 sales_role text,
 department_name text,
 head_of_department_requested boolean not null default false,
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 submitted_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 review_note text,
 constraint staff_work_profile_title_length check (length(coalesce(professional_title,'')) <= 100),
 constraint staff_work_profile_sales_length check (length(coalesce(sales_role,'')) <= 100),
 constraint staff_work_profile_department_length check (length(coalesce(department_name,'')) <= 100)
);
create table public.staff_work_profile_events (
 id bigint generated always as identity primary key,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 action text not null check (action in ('submitted','approved','rejected')),
 professional_title text,
 sales_role text,
 department_name text,
 head_of_department_requested boolean not null,
 note text,
 occurred_at timestamptz not null default now()
);
alter table public.staff_work_profiles enable row level security;
alter table public.staff_work_profile_events enable row level security;
create policy staff_work_profiles_read on public.staff_work_profiles for select to authenticated
 using (profile_id = auth.uid() or public.my_role() = 'manager');
create policy staff_work_profile_events_read on public.staff_work_profile_events for select to authenticated
 using (profile_id = auth.uid() or public.my_role() = 'manager');
revoke all on public.staff_work_profiles, public.staff_work_profile_events from public, anon, authenticated;
grant select on public.staff_work_profiles, public.staff_work_profile_events to authenticated;

create function public.submit_staff_work_profile(
 p_professional_title text, p_sales_role text, p_department_name text, p_head_of_department_requested boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := auth.uid();
begin
 if v_id is null or not exists (select 1 from public.profiles where id=v_id and active=true ) then
   raise exception 'An active staff account is required.' using errcode='42501';
 end if;
 if length(coalesce(p_professional_title,'')) > 100 or length(coalesce(p_sales_role,'')) > 100
    or length(coalesce(p_department_name,'')) > 100 then
   raise exception 'A work role field is too long.' using errcode='22023';
 end if;
 if p_head_of_department_requested and nullif(btrim(coalesce(p_department_name,'')),'') is null then
   raise exception 'Choose a department for a head-of-department request.' using errcode='22023';
 end if;
 insert into public.staff_work_profiles(profile_id,professional_title,sales_role,department_name,head_of_department_requested,status,submitted_at,reviewed_by,reviewed_at,review_note)
 values(v_id,nullif(btrim(p_professional_title),''),nullif(btrim(p_sales_role),''),nullif(btrim(p_department_name),''),coalesce(p_head_of_department_requested,false),'pending',now(),null,null,null)
 on conflict(profile_id) do update set professional_title=excluded.professional_title,sales_role=excluded.sales_role,
 department_name=excluded.department_name,head_of_department_requested=excluded.head_of_department_requested,
 status='pending',submitted_at=now(),reviewed_by=null,reviewed_at=null,review_note=null;
 insert into public.staff_work_profile_events(profile_id,actor_id,action,professional_title,sales_role,department_name,head_of_department_requested)
 values(v_id,v_id,'submitted',nullif(btrim(p_professional_title),''),nullif(btrim(p_sales_role),''),nullif(btrim(p_department_name),''),coalesce(p_head_of_department_requested,false));
end;
$$;
create function public.review_staff_work_profile(
 p_profile_id uuid, p_approve boolean, p_note text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_row public.staff_work_profiles%rowtype;
begin
 if v_actor is null or not exists (select 1 from public.profiles where id=v_actor and role='manager' and active=true) then
   raise exception 'Only active Management can review work roles.' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_note,''))) < 3 or length(p_note) > 500 then
   raise exception 'Provide a review reason.' using errcode='22023';
 end if;
 select * into v_row from public.staff_work_profiles where profile_id=p_profile_id for update;
 if not found or v_row.status <> 'pending' then
   raise exception 'No pending work-role submission.' using errcode='22023';
 end if;
 update public.staff_work_profiles set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_by=v_actor,reviewed_at=now(),review_note=btrim(p_note) where profile_id=p_profile_id;
 if p_approve then
   update public.profiles set position=coalesce(v_row.professional_title, position),department=coalesce(v_row.department_name, department) where id=p_profile_id and active=true;
   if not found then raise exception 'Staff account is inactive.' using errcode='42501'; end if;
 end if;
 insert into public.staff_work_profile_events(profile_id,actor_id,action,professional_title,sales_role,department_name,head_of_department_requested,note)
 values(p_profile_id,v_actor,case when p_approve then 'approved' else 'rejected' end,
 v_row.professional_title,v_row.sales_role,v_row.department_name,v_row.head_of_department_requested,btrim(p_note));
end;
$$;
revoke all on function public.submit_staff_work_profile(text,text,text,boolean), public.review_staff_work_profile(uuid,boolean,text) from public, anon;
grant execute on function public.submit_staff_work_profile(text,text,text,boolean), public.review_staff_work_profile(uuid,boolean,text) to authenticated;
