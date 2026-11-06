-- Phase G (client-ID cross-app integration plan, docs/plans/43 §4.2):
-- a real per-client cost-attribution ledger, so "how much has the company
-- spent on this client" is a direct sum instead of a cross-table
-- reconstruction every time someone asks.
--
-- Populated incrementally (not retroactively-all-at-once) by a trigger on
-- site_visits.attended: whenever an attended, lead-linked visit's day has
-- a matching weekly_visit_forms row (Phase C's own join-by-visit_date),
-- that day's real actual spend is split evenly across every attended,
-- lead-linked visitor that day (the exact same "per attended client"
-- denominator Phase C's budget section and Phase D's conversion-cost
-- figure both already use) and upserted here, one row per
-- (lead_id, source_type, source_id). source_id is the weekly_visit_forms
-- row id -- "that day's cost" -- not the site_visits row id, since the
-- spec asks for one row per attended client per site-visit DAY, and a
-- client is only ever expected to have one attended visit on a given day.
--
-- Banner-sourced attribution is explicitly out of scope: banners has no
-- cost field today (confirmed in the plan), so source_type is seeded with
-- only 'site_visit' for now; the column stays a free-text type so a future
-- 'banner' source can be added later without a schema change.

create table if not exists public.client_cost_attributions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now(),
  constraint client_cost_attributions_unique unique (lead_id, source_type, source_id)
);

create index if not exists client_cost_attributions_lead_id_idx on public.client_cost_attributions (lead_id);

alter table public.client_cost_attributions enable row level security;

-- Read-only to any authenticated staff member (same "every real cross-app
-- read respects RLS, never a service_role bypass" discipline as every
-- other phase this session) -- this is cost data about a shared company
-- client, not one agent's private record, so no agent_key/manager gate is
-- needed, matching how leads themselves are readable company-wide.
drop policy if exists client_cost_attributions_sel on public.client_cost_attributions;
create policy client_cost_attributions_sel on public.client_cost_attributions
  for select to authenticated using (true);

-- Recomputes every client_cost_attributions row sourced from a given
-- site-visit day's weekly_visit_forms entry. Safe to call repeatedly
-- (upsert on the real conflict target) and handles attendance being
-- toggled back off (the no-longer-attended lead's row is removed).
create or replace function public.sync_site_visit_cost_attribution(p_visit_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_id uuid;
  v_total numeric;
  v_attended_count int;
  v_amount numeric;
begin
  select id, coalesce(vehicle_rental_act,0) + coalesce(drivers_tip_act,0) + coalesce(fuel_act,0) + coalesce(refreshment_act,0) + coalesce(tnt_act,0)
    into v_form_id, v_total
  from public.weekly_visit_forms
  where visit_date = p_visit_date
  limit 1;

  if v_form_id is null then
    -- No linked cost form for this date (yet) -- nothing to attribute.
    return;
  end if;

  select count(*) into v_attended_count
  from public.site_visits
  where visit_date = p_visit_date and attended = true and lead_id is not null and deleted_at is null;

  if v_attended_count = 0 or v_total is null or v_total <= 0 then
    -- No attended, lead-linked visitor (or no real spend) that day -- any
    -- previously-attributed rows for this day no longer apply.
    delete from public.client_cost_attributions where source_type = 'site_visit' and source_id = v_form_id;
    return;
  end if;

  v_amount := v_total / v_attended_count;

  insert into public.client_cost_attributions (lead_id, source_type, source_id, amount, note)
  select sv.lead_id, 'site_visit', v_form_id, v_amount,
         'Site visit on ' || to_char(p_visit_date, 'DD Mon YYYY') || ' -- shared cost split across ' || v_attended_count || ' attended client(s)'
  from public.site_visits sv
  where sv.visit_date = p_visit_date and sv.attended = true and sv.lead_id is not null and sv.deleted_at is null
  on conflict (lead_id, source_type, source_id)
  do update set amount = excluded.amount, note = excluded.note;

  -- Drop attribution for any lead no longer attended that day (attendance
  -- toggled from true back to false/null after an earlier sync).
  delete from public.client_cost_attributions cca
  where cca.source_type = 'site_visit' and cca.source_id = v_form_id
    and not exists (
      select 1 from public.site_visits sv2
      where sv2.visit_date = p_visit_date and sv2.attended = true and sv2.lead_id = cca.lead_id and sv2.deleted_at is null
    );
end;
$$;

create or replace function public.trg_site_visits_cost_attribution()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_site_visit_cost_attribution(coalesce(new.visit_date, old.visit_date));
  if tg_op = 'UPDATE' and old.visit_date is distinct from new.visit_date then
    perform public.sync_site_visit_cost_attribution(old.visit_date);
  end if;
  return new;
end;
$$;

drop trigger if exists site_visits_cost_attribution_trigger on public.site_visits;
create trigger site_visits_cost_attribution_trigger
  after update of attended, lead_id, visit_date on public.site_visits
  for each row execute function public.trg_site_visits_cost_attribution();
