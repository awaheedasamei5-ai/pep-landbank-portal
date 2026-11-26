-- Reconcile approved daily actuals to each attended visit. Unlinked clients
-- share the day cost too, although their share cannot enter a lead ledger.
create or replace function public.sync_site_visit_cost_attribution(p_visit_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_form_id uuid;
  v_total numeric;
  v_attended_count integer;
  v_amount numeric;
begin
  select f.id,
    coalesce(f.vehicle_rental_act,0) + coalesce(f.drivers_tip_act,0)
    + coalesce(f.fuel_act,0) + coalesce(f.refreshment_act,0)
    + coalesce(f.tnt_act,0)
  into v_form_id, v_total
  from public.weekly_visit_forms f
  where f.visit_date = p_visit_date
    and f.status = 'Finalized'
    and f.approved_by is not null
  order by f.finalized_at desc nulls last, f.id
  limit 1;

  -- A previous approval may have been reopened or removed.
  if v_form_id is null then
    delete from public.client_cost_attributions c
    using public.weekly_visit_forms f
    where c.source_type = 'site_visit' and c.source_id = f.id
      and f.visit_date = p_visit_date;
    return;
  end if;

  select count(*) into v_attended_count
  from public.site_visits v
  where v.visit_date = p_visit_date and v.attended is true
    and v.deleted_at is null;

  if v_attended_count = 0 or v_total <= 0 then
    delete from public.client_cost_attributions
    where source_type = 'site_visit' and source_id = v_form_id;
    return;
  end if;

  v_amount := v_total / v_attended_count;
  insert into public.client_cost_attributions
    (lead_id, source_type, source_id, amount, note)
  select v.lead_id, 'site_visit', v_form_id,
    count(*) * v_amount,
    'Approved site visit actual cost on ' || to_char(p_visit_date, 'DD Mon YYYY')
      || '; shared across ' || v_attended_count || ' attended visit(s)'
  from public.site_visits v
  where v.visit_date = p_visit_date and v.attended is true
    and v.lead_id is not null and v.deleted_at is null
  group by v.lead_id
  on conflict (lead_id, source_type, source_id)
  do update set amount = excluded.amount, note = excluded.note;

  delete from public.client_cost_attributions c
  where c.source_type = 'site_visit' and c.source_id = v_form_id
    and not exists (
      select 1 from public.site_visits v
      where v.visit_date = p_visit_date and v.attended is true
        and v.lead_id = c.lead_id and v.deleted_at is null
    );
end;
$$;

create or replace function public.trg_weekly_visit_actual_cost_attribution()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.visit_date is not null then
    perform public.sync_site_visit_cost_attribution(new.visit_date);
  end if;
  if tg_op = 'UPDATE' and old.visit_date is distinct from new.visit_date
    and old.visit_date is not null then
    perform public.sync_site_visit_cost_attribution(old.visit_date);
  end if;
  return new;
end;
$$;

drop trigger if exists weekly_visit_actual_cost_attribution on public.weekly_visit_forms;
create trigger weekly_visit_actual_cost_attribution
after insert or update of visit_date, status, approved_by,
  vehicle_rental_act, drivers_tip_act, fuel_act, refreshment_act, tnt_act
on public.weekly_visit_forms
for each row execute function public.trg_weekly_visit_actual_cost_attribution();
