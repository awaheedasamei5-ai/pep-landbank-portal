-- A new site visit and its chosen pipeline lead must commit together.
-- Company creation is a separate grant so Management can restrict it later.
insert into public.permissions (key, label, description)
values ('company_leads.create', 'Create Company Leads', 'Add new prospects to the shared Company Leads pool from Site Visits or the sales desk')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission_key)
values ('agent', 'company_leads.create')
on conflict do nothing;

drop policy if exists leads_ins on public.leads;
create policy leads_ins on public.leads for insert to authenticated
with check (
  (
    agent_key = public.my_key()
    or public.my_key() = any (array['elias', 'emmanuel', 'elizabeth'])
    or public.my_role() = 'manager'
    or (agent_key = 'company' and public.has_permission('company_leads.create'))
  )
  and (
    amt_paid is null or amt_paid = 0
    or public.my_key() = any (array['elias', 'emmanuel', 'elizabeth'])
    or public.my_role() = 'manager'
  )
);

create or replace function public.create_site_visit_with_lead(p_visit jsonb, p_lead jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_agent_key text;
  v_agent_name text;
  v_role text;
  v_name text := nullif(btrim(p_visit->>'name'), '');
  v_contact text := nullif(btrim(p_visit->>'contact'), '');
  v_pool text := p_lead->>'pool';
  v_visit_date date;
  v_no_plots numeric;
  v_unit_price numeric;
  v_discount numeric;
  v_net_total numeric;
  v_grand_total numeric;
  v_lead_id uuid;
  v_visit public.site_visits%rowtype;
begin
  select agent_key, name, role into v_agent_key, v_agent_name, v_role
  from public.profiles where id = auth.uid() and active is true;
  if v_agent_key is null then raise exception 'Active staff sign-in required'; end if;
  if v_name is null or v_contact is null then raise exception 'Client name and contact are required'; end if;
  if v_pool not in ('personal', 'company') then raise exception 'Choose a pipeline for this client'; end if;
  if v_pool = 'company' and not public.has_permission('company_leads.create') then
    raise exception 'Company Leads creation access is required';
  end if;
  if nullif(p_visit->>'site', '') is null then raise exception 'Site is required'; end if;
  v_visit_date := (p_visit->>'visitDate')::date;
  if v_visit_date is null then raise exception 'Visit date is required'; end if;
  if v_visit_date < current_date then raise exception 'Visit date cannot be in the past'; end if;
  v_no_plots := (p_lead->>'noPlots')::numeric;
  v_unit_price := (p_lead->>'unitPrice')::numeric;
  v_discount := (p_lead->>'discount')::numeric;
  v_net_total := (p_lead->>'netTotal')::numeric;
  v_grand_total := (p_lead->>'grandTotal')::numeric;
  if nullif(p_lead->>'plotType', '') is null or p_lead->>'plotType' not in ('Full Plot', 'Half Plot')
    or v_no_plots is null or v_unit_price is null or v_discount is null or v_net_total is null or v_grand_total is null
    or v_no_plots <= 0 or v_unit_price < 0 or v_discount < 0 or v_net_total < 0 or v_grand_total < 0
    or abs(v_net_total - v_grand_total) > 0.01 then
    raise exception 'Invalid plot pricing';
  end if;
  -- Serialize same-staff bookings for the same client/day before checking.
  perform pg_advisory_xact_lock(hashtextextended(v_agent_key || '|' || lower(v_name) || '|' || regexp_replace(v_contact, '[^0-9]', '', 'g') || '|' || v_visit_date::text, 0));
  if not (v_role = 'manager' and coalesce((p_visit->>'allowDuplicate')::boolean, false)) and exists (
    select 1 from public.site_visits s
    where s.agent_key = v_agent_key and s.deleted_at is null and s.visit_date = v_visit_date
      and lower(btrim(s.name)) = lower(v_name)
      and right(regexp_replace(s.contact, '[^0-9]', '', 'g'), 9) = right(regexp_replace(v_contact, '[^0-9]', '', 'g'), 9)
  ) then raise exception 'This client already has a visit on that day'; end if;

  insert into public.leads (agent_key, name, contact, plot_type, no_plots, unit_price, payment_plan,
    amt_paid, grand_total, net_total, discount, balance, stage, lead_source)
  values (case when v_pool = 'company' then 'company' else v_agent_key end,
    v_name, v_contact, p_lead->>'plotType', v_no_plots, v_unit_price, 'Full Payment',
    0, v_grand_total, v_net_total, v_discount, v_grand_total, '1', 'Site visit')
  returning id into v_lead_id;

  insert into public.site_visits (agent_key, agent_name, name, contact, site, plot, visit_date, visit_time,
    people, transport, pickup, place_of_work, position, nationality, purpose, discussion_so_far,
    key_understanding, feedback_after, key_next_steps, source, accompanied, notes, lead_id)
  values (v_agent_key, v_agent_name, v_name, v_contact, p_visit->>'site', p_visit->>'plot', v_visit_date,
    nullif(p_visit->>'visitTime', ''), nullif(p_visit->>'people', '')::numeric,
    nullif(p_visit->>'transport', ''), nullif(p_visit->>'pickup', ''), nullif(p_visit->>'placeOfWork', ''),
    nullif(p_visit->>'position', ''), nullif(p_visit->>'nationality', ''), nullif(p_visit->>'purpose', ''),
    nullif(p_visit->>'discussionSoFar', ''), nullif(p_visit->>'keyUnderstanding', ''),
    nullif(p_visit->>'feedbackAfter', ''), nullif(p_visit->>'keyNextSteps', ''),
    nullif(p_visit->>'source', ''), nullif(p_visit->>'accompanied', ''), nullif(p_visit->>'notes', ''), v_lead_id)
  returning * into v_visit;
  return to_jsonb(v_visit);
end;
$$;

revoke all on function public.create_site_visit_with_lead(jsonb, jsonb) from public, anon;
grant execute on function public.create_site_visit_with_lead(jsonb, jsonb) to authenticated;

