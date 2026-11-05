-- Phase F (client-ID cross-app integration plan, docs/plans/43 §4.4):
--   When confirm_allocation() succeeds, automatically raise a real
--   contract_requests row for that lead, in the same transaction, so
--   Contract of Sale's own existing request queue picks it up without a
--   human having to separately remember to ask for one. Mirrors the
--   "fan out to every real consequence in one transaction" pattern
--   approve_payment() already demonstrates for allocation_requests.
--
-- Guard against duplicates: a lead can only ever have one *pending*
-- contract_requests row at a time (not a hard DB constraint -- a lead
-- can legitimately get a second request after the first is fulfilled,
-- e.g. a repeat buyer -- just skip the insert if one is already open).
--
-- 'allocation' is a new source value alongside the existing 'staff'/
-- 'client' -- ContractRequest's own TS type never exposes `source` in
-- the UI (confirmed: dormant column, same treatment as Complaints'
-- unused source/sentiment), so widening the check constraint is safe
-- and does not require any UI/type change.

alter table public.contract_requests drop constraint if exists contract_requests_source_check;
alter table public.contract_requests
  add constraint contract_requests_source_check
  check (source = any (array['staff', 'client', 'allocation']));

create or replace function public.confirm_allocation(p_allocation_id uuid, p_plot_number text, p_note text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_alloc record;
  v_caller_key text;
  v_caller_name text;
  v_now timestamptz := now();
  v_plot_numbers text[];
  v_pn text;
  v_plot record;
  v_plots jsonb := '[]'::jsonb;
  v_is_new boolean;
  v_audit_id bigint;
  v_has_open_request boolean;
begin
  v_caller_key := public.my_key();

  select * into v_alloc from public.allocation_requests where id = p_allocation_id for update;
  if not found then
    raise exception 'Allocation request not found';
  end if;

  if not (
    coalesce(public.my_role(),'') = 'manager'
    or coalesce(v_caller_key,'') = any(array['elias','emmanuel'])
    or (v_caller_key is not null and v_alloc.agent_key = v_caller_key)
  ) then
    raise exception 'Not authorized to confirm this allocation';
  end if;

  if v_alloc.status <> 'Awaiting Authorization' then
    raise exception 'Allocation is not awaiting authorization (current status: %)', v_alloc.status;
  end if;

  if p_plot_number is null or btrim(p_plot_number) = '' then
    raise exception 'Plot number is required';
  end if;

  select name into v_caller_name from public.profiles where id = auth.uid();

  select array_agg(btrim(x)) into v_plot_numbers from unnest(string_to_array(p_plot_number, ',')) as x where btrim(x) <> '';
  if v_plot_numbers is null or array_length(v_plot_numbers,1) = 0 then
    raise exception 'Plot number is required';
  end if;

  foreach v_pn in array v_plot_numbers loop
    select * into v_plot from public.plots where lower(plot_number) = lower(v_pn) for update;
    if found and v_plot.status = 'Allocated' then
      raise exception 'Plot % has already been allocated%', v_pn,
        case when v_plot.client_name is not null and v_plot.client_name <> '' then ' to '||v_plot.client_name else '' end;
    end if;
    if found and v_plot.status = 'Subdivided' then
      raise exception 'Plot % has been split into halves -- allocate % or % instead', v_pn, v_pn||'a', v_pn||'b';
    end if;
  end loop;

  update public.allocation_requests
    set status = 'Allocated', plot_number = array_to_string(v_plot_numbers, ','), note = p_note,
        allocated_by = v_caller_name, resolved_at = v_now,
        history = coalesce(history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'type','allocated','plotNumber',array_to_string(v_plot_numbers, ','),'note',p_note,
          'by',v_caller_name,'at',v_now
        ))
    where id = p_allocation_id;

  foreach v_pn in array v_plot_numbers loop
    select * into v_plot from public.plots where lower(plot_number) = lower(v_pn) for update;
    v_is_new := not found;
    if found then
      update public.plots
        set status = 'Allocated', client_name = v_alloc.client_name, agent_key = v_alloc.agent_key,
            lead_id = v_alloc.lead_id, updated_at = v_now
        where id = v_plot.id
        returning * into v_plot;
    else
      insert into public.plots(site, plot_number, plot_type, status, price, client_name, client_contact, agent_key, notes, lead_id)
      values ('Royal Palm Enclave, Tsopoli', v_pn, 'Full Plot', 'Allocated', null, v_alloc.client_name, '', v_alloc.agent_key, 'Allocated via signed authorization', v_alloc.lead_id)
      returning * into v_plot;
    end if;
    v_plots := v_plots || jsonb_build_object(
      'id', v_plot.id, 'site', v_plot.site, 'plotNumber', v_plot.plot_number, 'plotType', v_plot.plot_type,
      'status', v_plot.status, 'price', v_plot.price, 'clientName', v_plot.client_name, 'clientContact', v_plot.client_contact,
      'agentKey', v_plot.agent_key, 'notes', v_plot.notes, 'updatedAt', v_plot.updated_at, 'isNew', v_is_new, 'leadId', v_plot.lead_id
    );
  end loop;

  -- Phase F: auto-raise a contract-preparation request for this lead,
  -- once per allocation (not once per plot in a multi-plot allocation),
  -- and only if the lead doesn't already have an open one pending.
  if v_alloc.lead_id is not null then
    select exists(
      select 1 from public.contract_requests
      where lead_id = v_alloc.lead_id and status = 'pending'
    ) into v_has_open_request;

    if not v_has_open_request then
      insert into public.contract_requests(lead_id, client_name, requested_by, requested_by_name, note, source)
      values (
        v_alloc.lead_id, v_alloc.client_name, coalesce(v_caller_key, 'system'), coalesce(v_caller_name, 'System'),
        'Auto-requested: plot(s) ' || array_to_string(v_plot_numbers, ',') || ' allocated to ' || v_alloc.client_name,
        'allocation'
      );
    end if;
  end if;

  v_audit_id := public.record_audit_event(
    'audit', 'allocation.confirmed', 'info', 'allocation_request', p_allocation_id::text,
    v_caller_name || ' allocated plot(s) ' || array_to_string(v_plot_numbers, ',') || ' to ' || v_alloc.client_name,
    jsonb_build_object('leadId', v_alloc.lead_id, 'plotNumbers', v_plot_numbers, 'note', p_note)
  );

  return jsonb_build_object(
    'ok', true, 'allocation_id', p_allocation_id, 'lead_id', v_alloc.lead_id,
    'plot_number', array_to_string(v_plot_numbers, ','), 'note', p_note, 'allocated_by', v_caller_name, 'resolved_at', v_now,
    'audit_id', v_audit_id,
    'plots', v_plots,
    'plot', v_plots->0
  );
end;
$function$;
