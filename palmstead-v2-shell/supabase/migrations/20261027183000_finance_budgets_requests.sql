-- New requests use profile UUIDs and explicit approval routes. Legacy fund_requests
-- and expenses are not imported or interpreted as disbursements.
create table public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.finance_departments(id),
  fiscal_year integer not null check (fiscal_year between 2020 and 2100),
  category text not null check (length(btrim(category)) between 2 and 80),
  revision integer not null check (revision > 0),
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft','active','superseded')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  activated_at timestamptz,
  activated_by uuid references public.profiles(id),
  unique (department_id,fiscal_year,category,revision)
);
create unique index finance_budget_one_active on public.finance_budgets
  (department_id,fiscal_year,lower(btrim(category))) where status='active';
create index finance_budget_period_idx on public.finance_budgets(fiscal_year,department_id,status);

create table public.finance_direct_routes (
  profile_id uuid primary key references public.profiles(id),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles(id)
);

create table public.finance_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  department_id uuid references public.finance_departments(id),
  route text not null check (route in ('department','direct_finance')),
  category text not null check (length(btrim(category)) between 2 and 80),
  purpose text not null check (length(btrim(purpose)) between 8 and 2000),
  amount numeric(18,2) not null check (amount > 0),
  needed_by date not null,
  status text not null default 'draft' check (status in
    ('draft','hod_review','finance_review','returned','approved','rejected','cancelled')),
  revision integer not null default 1 check (revision > 0),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((route='department') = (department_id is not null))
);
create index finance_requests_owner_idx on public.finance_requests(requester_id,created_at desc);
create index finance_requests_queue_idx on public.finance_requests(status,department_id,created_at desc);

create table public.finance_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.finance_requests(id),
  actor_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in
    ('created','edited','submitted','hod_forwarded','finance_approved','returned','rejected','cancelled')),
  from_status text,
  to_status text not null,
  request_revision integer not null,
  note text not null default '',
  occurred_at timestamptz not null default now()
);
create index finance_request_events_request_idx on public.finance_request_events(request_id,occurred_at,id);

alter table public.finance_budgets enable row level security;
alter table public.finance_direct_routes enable row level security;
alter table public.finance_requests enable row level security;
alter table public.finance_request_events enable row level security;
revoke all on public.finance_budgets, public.finance_direct_routes, public.finance_requests, public.finance_request_events from anon;
grant select on public.finance_budgets, public.finance_direct_routes, public.finance_requests,
  public.finance_request_events to authenticated;

create or replace function public.finance_can_review_request(p_department_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='manager')
    or exists (select 1 from public.finance_role_assignments a join public.profiles p on p.id=a.profile_id
      where a.profile_id=(select auth.uid()) and a.revoked_at is null and p.active
        and (a.finance_role='finance_head' or
          (a.finance_role='department_head' and a.department_id=p_department_id)));
$$;
revoke all on function public.finance_can_review_request(uuid) from public,anon;
grant execute on function public.finance_can_review_request(uuid) to authenticated;

create policy finance_budgets_read on public.finance_budgets for select to authenticated using (
  public.finance_can_review_request(department_id) or exists (
    select 1 from public.finance_staff_departments d join public.profiles p on p.id=d.profile_id
    where d.profile_id=(select auth.uid()) and d.department_id=finance_budgets.department_id
      and d.ended_at is null and p.active and finance_budgets.status='active'));
create policy finance_staff_departments_self_read on public.finance_staff_departments for select to authenticated
  using (profile_id=(select auth.uid()) and exists(select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active));
create policy finance_departments_staff_read on public.finance_departments for select to authenticated
  using (exists(select 1 from public.finance_staff_departments d join public.profiles p on p.id=d.profile_id
    where d.department_id=finance_departments.id and d.profile_id=(select auth.uid())
      and d.ended_at is null and p.active)
    or exists(select 1 from public.finance_role_assignments a join public.profiles p on p.id=a.profile_id
      where a.profile_id=(select auth.uid()) and a.revoked_at is null and p.active
        and a.finance_role in ('finance_head','department_head')));
create policy finance_direct_routes_read on public.finance_direct_routes for select to authenticated using (
  profile_id=(select auth.uid()) or exists(select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and p.role='manager'));
create policy finance_requests_read on public.finance_requests for select to authenticated using (
  requester_id=(select auth.uid()) or public.finance_can_review_request(department_id));
create policy finance_request_events_read on public.finance_request_events for select to authenticated using (
  exists(select 1 from public.finance_requests r where r.id=request_id and
    (r.requester_id=(select auth.uid()) or public.finance_can_review_request(r.department_id))));

create or replace function public.finance_set_direct_route(p_profile_id uuid,p_enabled boolean,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_manager();
begin
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason.' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_profile_id and active) then
    raise exception 'Choose an active staff member.' using errcode='22023'; end if;
  if p_enabled then
    insert into public.finance_direct_routes(profile_id,reason,assigned_by)
    values(p_profile_id,btrim(p_reason),v_actor)
    on conflict(profile_id) do update set reason=excluded.reason,assigned_by=excluded.assigned_by,assigned_at=now();
  else
    delete from public.finance_direct_routes where profile_id=p_profile_id;
  end if;
end;
$$;
revoke all on function public.finance_set_direct_route(uuid,boolean,text) from public,anon;
grant execute on function public.finance_set_direct_route(uuid,boolean,text) to authenticated;

create or replace function public.finance_create_budget(p_department_id uuid,p_fiscal_year integer,
  p_category text,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_manager(); v_id uuid; v_revision integer;
begin
  if p_fiscal_year not between 2020 and 2100 or p_amount is null or p_amount <= 0
    or length(btrim(coalesce(p_category,''))) not between 2 and 80
    or length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Enter a valid period, category, amount and reason.' using errcode='22023'; end if;
  if not exists(select 1 from public.finance_departments where id=p_department_id and active) then
    raise exception 'Choose an active department.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_department_id::text || p_fiscal_year::text || lower(btrim(p_category)),0));
  if exists(select 1 from public.finance_budgets where department_id=p_department_id
    and fiscal_year=p_fiscal_year and lower(btrim(category))=lower(btrim(p_category)) and status='draft') then
    raise exception 'Activate the existing draft before starting another revision.' using errcode='23505'; end if;
  select coalesce(max(revision),0)+1 into v_revision from public.finance_budgets
    where department_id=p_department_id and fiscal_year=p_fiscal_year
      and lower(btrim(category))=lower(btrim(p_category));
  insert into public.finance_budgets(department_id,fiscal_year,category,revision,amount,reason,created_by)
    values(p_department_id,p_fiscal_year,btrim(p_category),v_revision,p_amount,btrim(p_reason),v_actor)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.finance_create_budget(uuid,integer,text,numeric,text) from public,anon;
grant execute on function public.finance_create_budget(uuid,integer,text,numeric,text) to authenticated;

create or replace function public.finance_activate_budget(p_budget_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_finance_private.require_finance_head(); v_budget public.finance_budgets%rowtype;
begin
  select * into v_budget from public.finance_budgets where id=p_budget_id for update;
  if not found or v_budget.status <> 'draft' then raise exception 'Budget draft not found.' using errcode='22023'; end if;
  if v_budget.created_by=v_actor then raise exception 'Another Finance Head must activate this draft.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_budget.department_id::text || v_budget.fiscal_year::text || lower(btrim(v_budget.category)),0));
  update public.finance_budgets set status='superseded' where department_id=v_budget.department_id
    and fiscal_year=v_budget.fiscal_year and lower(btrim(category))=lower(btrim(v_budget.category)) and status='active';
  update public.finance_budgets set status='active',activated_at=now(),activated_by=v_actor where id=p_budget_id;
end;
$$;
revoke all on function public.finance_activate_budget(uuid) from public,anon;
grant execute on function public.finance_activate_budget(uuid) to authenticated;

create or replace function public.finance_save_request(p_request_id uuid,p_category text,p_purpose text,
  p_amount numeric,p_needed_by date,p_expected_revision integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid; v_request public.finance_requests%rowtype;
  v_department uuid; v_direct boolean;
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor and active) then
    raise exception 'Active staff access required.' using errcode='42501'; end if;
  if p_amount is null or p_amount<=0 or length(btrim(coalesce(p_category,''))) not between 2 and 80
    or length(btrim(coalesce(p_purpose,''))) not between 8 and 2000 or p_needed_by is null then
    raise exception 'Enter a valid category, purpose, amount and needed date.' using errcode='22023'; end if;
  if p_request_id is null then
    select exists(select 1 from public.finance_direct_routes where profile_id=v_actor) into v_direct;
    if not v_direct then
      select d.department_id into v_department from public.finance_staff_departments d
        join public.finance_departments f on f.id=d.department_id and f.active
        where d.profile_id=v_actor and d.ended_at is null;
      if v_department is null then raise exception 'Ask Management to assign your department or direct Finance route.' using errcode='42501'; end if;
    end if;
    insert into public.finance_requests(requester_id,department_id,route,category,purpose,amount,needed_by)
      values(v_actor,v_department,case when v_direct then 'direct_finance' else 'department' end,
        btrim(p_category),btrim(p_purpose),p_amount,p_needed_by) returning id into v_id;
    insert into public.finance_request_events(request_id,actor_id,event_type,to_status,request_revision)
      values(v_id,v_actor,'created','draft',1);
  else
    select * into v_request from public.finance_requests where id=p_request_id for update;
    if not found or v_request.requester_id<>v_actor or v_request.status not in ('draft','returned')
      or p_expected_revision is distinct from v_request.revision then
      raise exception 'Request changed or cannot be edited.' using errcode='40001'; end if;
    update public.finance_requests set category=btrim(p_category),purpose=btrim(p_purpose),amount=p_amount,
      needed_by=p_needed_by,revision=revision+1,updated_at=now() where id=p_request_id;
    insert into public.finance_request_events(request_id,actor_id,event_type,from_status,to_status,request_revision)
      values(p_request_id,v_actor,'edited',v_request.status,v_request.status,v_request.revision+1);
    v_id:=p_request_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.finance_save_request(uuid,text,text,numeric,date,integer) from public,anon;
grant execute on function public.finance_save_request(uuid,text,text,numeric,date,integer) to authenticated;

create or replace function public.finance_transition_request(p_request_id uuid,p_action text,
  p_expected_revision integer,p_note text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_request public.finance_requests%rowtype; v_status text; v_event text;
  v_budget numeric; v_committed numeric;
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor and active) then
    raise exception 'Active staff access required.' using errcode='42501'; end if;
  select * into v_request from public.finance_requests where id=p_request_id for update;
  if not found or p_expected_revision is distinct from v_request.revision then
    raise exception 'Request changed. Reload it before acting.' using errcode='40001'; end if;
  if p_action='submit' and v_request.status in ('draft','returned') and v_actor=v_request.requester_id then
    v_status:=case when v_request.route='direct_finance' then 'finance_review' else 'hod_review' end;
    v_event:='submitted';
    if v_request.route='department' and not exists(select 1 from public.finance_role_assignments a
      join public.profiles p on p.id=a.profile_id where a.department_id=v_request.department_id
        and a.finance_role='department_head' and a.revoked_at is null and p.active and a.profile_id<>v_actor) then
      raise exception 'A separate active Head of Department is required.' using errcode='42501'; end if;
  elsif p_action='cancel' and v_request.status in ('draft','returned','hod_review','finance_review')
    and v_actor=v_request.requester_id then v_status:='cancelled'; v_event:='cancelled';
  elsif p_action in ('forward','return','reject') and v_request.status='hod_review'
    and v_actor<>v_request.requester_id and exists(select 1 from public.finance_role_assignments a
      where a.profile_id=v_actor and a.finance_role='department_head'
        and a.department_id=v_request.department_id and a.revoked_at is null) then
    v_status:=case p_action when 'forward' then 'finance_review' when 'return' then 'returned' else 'rejected' end;
    v_event:=case p_action when 'forward' then 'hod_forwarded' when 'return' then 'returned' else 'rejected' end;
  elsif p_action in ('approve','return','reject') and v_request.status='finance_review'
    and v_actor<>v_request.requester_id and exists(select 1 from public.finance_role_assignments a
      where a.profile_id=v_actor and a.finance_role='finance_head' and a.revoked_at is null) then
    v_status:=case p_action when 'approve' then 'approved' when 'return' then 'returned' else 'rejected' end;
    v_event:=case p_action when 'approve' then 'finance_approved' when 'return' then 'returned' else 'rejected' end;
    if p_action='approve' and v_request.department_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_request.department_id::text ||
        extract(year from v_request.needed_by)::integer::text || lower(btrim(v_request.category)),0));
      select amount into v_budget from public.finance_budgets where department_id=v_request.department_id
        and fiscal_year=extract(year from v_request.needed_by)::integer
        and lower(btrim(category))=lower(btrim(v_request.category)) and status='active';
      if v_budget is null then raise exception 'An active budget for this department, category and year is required.' using errcode='23514'; end if;
      select coalesce(sum(amount),0) into v_committed from public.finance_requests where department_id=v_request.department_id
        and extract(year from needed_by)=extract(year from v_request.needed_by)
        and lower(btrim(category))=lower(btrim(v_request.category)) and status='approved';
      if v_committed+v_request.amount>v_budget then
        raise exception 'Budget exceeded. Revise the budget or return the request.' using errcode='23514'; end if;
    end if;
  else raise exception 'Action is not allowed for your role or this request state.' using errcode='42501'; end if;
  if p_action in ('return','reject') and length(btrim(coalesce(p_note,'')))<3 then
    raise exception 'Give a reason for this decision.' using errcode='22023'; end if;
  update public.finance_requests set status=v_status,revision=revision+1,updated_at=now(),
    submitted_at=case when p_action='submit' then now() else submitted_at end where id=p_request_id;
  insert into public.finance_request_events(request_id,actor_id,event_type,from_status,to_status,request_revision,note)
    values(p_request_id,v_actor,v_event,v_request.status,v_status,v_request.revision+1,btrim(coalesce(p_note,'')));
  return v_status;
end;
$$;
revoke all on function public.finance_transition_request(uuid,text,integer,text) from public,anon;
grant execute on function public.finance_transition_request(uuid,text,integer,text) to authenticated;
