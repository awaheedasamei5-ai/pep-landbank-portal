-- Preserve the exact approved plan and request contents at each decision.
alter table public.finance_requests
  add column approved_budget_id uuid references public.finance_budgets(id),
  add column approved_budget_revision integer,
  add column approved_by uuid references public.profiles(id),
  add column approved_at timestamptz,
  add constraint finance_request_approval_snapshot_check check (
    (approved_at is null and approved_by is null and approved_budget_id is null and approved_budget_revision is null)
    or (approved_at is not null and approved_by is not null and
      ((route='direct_finance' and approved_budget_id is null and approved_budget_revision is null)
        or (route='department' and approved_budget_id is not null and approved_budget_revision is not null)))
  );
alter table public.finance_request_events add column request_snapshot jsonb;

create or replace function app_finance_private.capture_request_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_budget public.finance_budgets%rowtype;
begin
  if old.approved_at is not null and
    (new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
      or new.approved_budget_id is distinct from old.approved_budget_id
      or new.approved_budget_revision is distinct from old.approved_budget_revision) then
    raise exception 'Approval evidence cannot be changed.' using errcode='23514';
  end if;
  if new.status='approved' and old.status is distinct from 'approved' then
    new.approved_by:=auth.uid();
    new.approved_at:=now();
    if new.department_id is not null then
      select * into v_budget from public.finance_budgets where department_id=new.department_id
        and fiscal_year=extract(year from new.needed_by)::integer
        and lower(btrim(category))=lower(btrim(new.category)) and status='active';
      if not found then raise exception 'Active budget missing at approval.' using errcode='23514'; end if;
      new.approved_budget_id:=v_budget.id;
      new.approved_budget_revision:=v_budget.revision;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_finance_private.capture_request_approval() from public,anon,authenticated;
create trigger finance_request_approval_snapshot before update on public.finance_requests
  for each row execute function app_finance_private.capture_request_approval();

create or replace function app_finance_private.capture_request_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select jsonb_build_object('category',r.category,'purpose',r.purpose,'amount',r.amount,
    'needed_by',r.needed_by,'route',r.route,'department_id',r.department_id,
    'status',r.status,'revision',r.revision,'approved_budget_id',r.approved_budget_id,
    'approved_budget_revision',r.approved_budget_revision)
    into new.request_snapshot from public.finance_requests r where r.id=new.request_id;
  if new.request_snapshot is null then raise exception 'Request missing for event.' using errcode='23503'; end if;
  return new;
end;
$$;
revoke all on function app_finance_private.capture_request_event() from public,anon,authenticated;
create trigger finance_request_event_snapshot before insert on public.finance_request_events
  for each row execute function app_finance_private.capture_request_event();

create index finance_requests_approved_budget_idx on public.finance_requests(approved_budget_id)
  where approved_budget_id is not null;
create index finance_requests_approver_idx on public.finance_requests(approved_by)
  where approved_by is not null;
