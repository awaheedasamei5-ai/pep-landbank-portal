-- Approved actuals are first split across every attended booking. This
-- preserves staff ownership even when a visitor has no pipeline lead.
create table if not exists public.site_visit_cost_allocations (
  visit_id uuid primary key references public.site_visits(id) on delete cascade,
  form_id uuid not null references public.weekly_visit_forms(id) on delete cascade,
  agent_key text not null,
  lead_id uuid,
  amount numeric(14,2) not null check (amount >= 0),
  calculated_at timestamptz not null default now()
);

create index if not exists site_visit_cost_allocations_form_idx
  on public.site_visit_cost_allocations(form_id);
create index if not exists site_visit_cost_allocations_staff_idx
  on public.site_visit_cost_allocations(agent_key);
create index if not exists site_visit_cost_allocations_lead_idx
  on public.site_visit_cost_allocations(lead_id) where lead_id is not null;

revoke execute on function public.sync_site_visit_cost_attribution(date) from public, anon;

alter table public.site_visit_cost_allocations enable row level security;
revoke all on public.site_visit_cost_allocations from anon, authenticated;
grant select on public.site_visit_cost_allocations to authenticated;
drop policy if exists site_visit_cost_allocations_select on public.site_visit_cost_allocations;
create policy site_visit_cost_allocations_select
on public.site_visit_cost_allocations for select to authenticated
using (
  coalesce(public.my_key(), '') <> ''
  and (agent_key = public.my_key() or public.has_permission('site_visits.view_all'))
);

create or replace function public.sync_site_visit_cost_attribution(p_visit_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_form_id uuid;
  v_total numeric(14,2);
  v_attended_count integer;
  v_base numeric(14,2);
begin
  select f.id, round(
    coalesce(f.vehicle_rental_act,0) + coalesce(f.drivers_tip_act,0)
    + coalesce(f.fuel_act,0) + coalesce(f.refreshment_act,0)
    + coalesce(f.tnt_act,0), 2)
  into v_form_id, v_total
  from public.weekly_visit_forms f
  where f.visit_date = p_visit_date
    and f.status = 'Finalized' and f.approved_by is not null
  order by f.finalized_at desc nulls last, f.id
  limit 1;

  -- Reopening approval removes derived costs without changing the booking.
  delete from public.client_cost_attributions c
  using public.weekly_visit_forms f
  where c.source_type = 'site_visit' and c.source_id = f.id
    and f.visit_date = p_visit_date
    and (v_form_id is null or f.id <> v_form_id);
  delete from public.site_visit_cost_allocations a
  using public.weekly_visit_forms f
  where a.form_id = f.id and f.visit_date = p_visit_date
    and (v_form_id is null or f.id <> v_form_id);
  if v_form_id is null then return; end if;

  select count(*) into v_attended_count
  from public.site_visits v
  where v.visit_date = p_visit_date and v.attended is true
    and v.deleted_at is null;

  if v_attended_count = 0 or coalesce(v_total,0) <= 0 then
    delete from public.client_cost_attributions
    where source_type = 'site_visit' and source_id = v_form_id;
    delete from public.site_visit_cost_allocations
    where form_id = v_form_id;
    return;
  end if;

  -- Put any rounding remainder on the last UUID so shares sum exactly to
  -- the approved cedi amount, even when the headcount does not divide it.
  v_base := trunc(v_total / v_attended_count, 2);
  insert into public.site_visit_cost_allocations
    (visit_id, form_id, agent_key, lead_id, amount, calculated_at)
  select ranked.id, v_form_id, ranked.agent_key, ranked.lead_id,
    case when ranked.rn = v_attended_count
      then v_total - v_base * (v_attended_count - 1)
      else v_base end,
    now()
  from (
    select v.id, v.agent_key, v.lead_id,
      row_number() over (order by v.id) rn
    from public.site_visits v
    where v.visit_date = p_visit_date and v.attended is true
      and v.deleted_at is null
  ) ranked
  on conflict (visit_id) do update
    set form_id = excluded.form_id, agent_key = excluded.agent_key,
        lead_id = excluded.lead_id, amount = excluded.amount,
        calculated_at = excluded.calculated_at;

  delete from public.site_visit_cost_allocations a
  where a.form_id = v_form_id
    and not exists (
      select 1 from public.site_visits v
      where v.id = a.visit_id and v.visit_date = p_visit_date
        and v.attended is true and v.deleted_at is null
    );

  insert into public.client_cost_attributions
    (lead_id, source_type, source_id, amount, note)
  select a.lead_id, 'site_visit', v_form_id, sum(a.amount),
    'Approved site visit actual cost on ' || to_char(p_visit_date,'DD Mon YYYY')
      || '; split across ' || v_attended_count || ' attended visit(s)'
  from public.site_visit_cost_allocations a
  where a.form_id = v_form_id and a.lead_id is not null
  group by a.lead_id
  on conflict (lead_id, source_type, source_id)
  do update set amount = excluded.amount, note = excluded.note;

  delete from public.client_cost_attributions c
  where c.source_type = 'site_visit' and c.source_id = v_form_id
    and not exists (
      select 1 from public.site_visit_cost_allocations a
      where a.form_id = v_form_id and a.lead_id = c.lead_id
    );
end;
$$;

create or replace function public.trg_site_visits_cost_attribution()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_site_visit_cost_attribution(old.visit_date);
    return old;
  end if;
  perform public.sync_site_visit_cost_attribution(new.visit_date);
  if tg_op = 'UPDATE' and old.visit_date is distinct from new.visit_date then
    perform public.sync_site_visit_cost_attribution(old.visit_date);
  end if;
  return new;
end;
$$;

drop trigger if exists site_visits_cost_attribution_trigger on public.site_visits;
create trigger site_visits_cost_attribution_trigger
after insert or delete or update of attended, lead_id, visit_date, agent_key, deleted_at
on public.site_visits
for each row execute function public.trg_site_visits_cost_attribution();

-- Existing approved days, if any, receive the same deterministic split.
do $$
declare v_date date;
begin
  for v_date in
    select distinct visit_date from public.weekly_visit_forms
    where visit_date is not null and status = 'Finalized'
      and approved_by is not null
  loop
    perform public.sync_site_visit_cost_attribution(v_date);
  end loop;
end;
$$;
