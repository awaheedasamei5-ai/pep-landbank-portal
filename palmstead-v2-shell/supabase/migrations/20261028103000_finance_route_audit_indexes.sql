-- Direct-route exemptions remain auditable after they are revoked.
create table public.finance_direct_route_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('enabled','changed','revoked')),
  reason text not null,
  occurred_at timestamptz not null default now()
);
create index finance_direct_route_events_profile_idx on public.finance_direct_route_events(profile_id,occurred_at desc);
alter table public.finance_direct_route_events enable row level security;
revoke all on public.finance_direct_route_events from anon;
grant select on public.finance_direct_route_events to authenticated;
create policy finance_direct_route_events_manager_read on public.finance_direct_route_events
  for select to authenticated using (exists(select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and p.role='manager'));

create or replace function app_finance_private.audit_direct_route()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.finance_direct_route_events(profile_id,actor_id,action,reason)
    values(coalesce(new.profile_id,old.profile_id),auth.uid(),
      case tg_op when 'INSERT' then 'enabled' when 'UPDATE' then 'changed' else 'revoked' end,
      case when tg_op='DELETE' then 'Management revoked direct route' else new.reason end);
  return coalesce(new,old);
end;
$$;
revoke all on function app_finance_private.audit_direct_route() from public,anon,authenticated;
create trigger finance_direct_route_audit after insert or update or delete on public.finance_direct_routes
  for each row execute function app_finance_private.audit_direct_route();

create index finance_budgets_creator_idx on public.finance_budgets(created_by);
create index finance_budgets_activator_idx on public.finance_budgets(activated_by) where activated_by is not null;
create index finance_direct_routes_assigner_idx on public.finance_direct_routes(assigned_by);
create index finance_request_events_actor_idx on public.finance_request_events(actor_id);
create index finance_requests_department_idx on public.finance_requests(department_id) where department_id is not null;
