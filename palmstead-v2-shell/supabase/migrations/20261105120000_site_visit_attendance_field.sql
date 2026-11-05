-- Real user ask (Phase B, docs/plans/43 section 2.1): "who showed up vs.
-- who booked" has no field anywhere today. site_visits.status is a
-- free-text scheduling status (Pending/Completed/etc.), not a real
-- attendance flag, and the Day Report currently assumes every logged
-- site_visits row for that date = someone who actually came.
--
-- attended lives on site_visits itself (not buried in sve_day_reports'
-- own entries jsonb) because attendance is a fact about the visit, and
-- Site Visit Authorization / other consumers should see it too, not just
-- the Day Report. Nullable: null = "not yet marked" until the site
-- manager reviews that day's visits.
alter table public.site_visits
  add column if not exists attended boolean;

comment on column public.site_visits.attended is
  'null = not yet marked by the site manager; true = client actually showed up; false = booked but did not attend.';

-- Narrow, scoped RPC rather than broadening site_visits_upd's RLS: the
-- Day Report is reviewed by the real site-manager staff (elias/emmanuel/
-- elizabeth, the same hardcoded set sve_day_reports_staff_ins/upd already
-- use) or a manager, who may need to mark attendance for a visit whose
-- agent_key belongs to a different sales agent -- site_visits_upd today
-- only allows the owning agent or a manager to update a row at all. This
-- function only ever touches the single `attended` column, so it cannot
-- be used to rewrite any other part of someone else's site visit.
create or replace function public.set_site_visit_attendance(p_site_visit_id uuid, p_attended boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_key text := my_key();
  v_role text := my_role();
begin
  if v_key is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not (
    v_role = 'manager'
    or v_key = any(array['elias', 'emmanuel', 'elizabeth'])
    or exists (select 1 from public.site_visits where id = p_site_visit_id and agent_key = v_key)
  ) then
    raise exception 'Only the owning agent, a manager, or a site manager can mark attendance.' using errcode = '42501';
  end if;

  update public.site_visits set attended = p_attended where id = p_site_visit_id;
  if not found then
    raise exception 'Site visit not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_site_visit_attendance(uuid, boolean) from public, anon;
grant execute on function public.set_site_visit_attendance(uuid, boolean) to authenticated;
