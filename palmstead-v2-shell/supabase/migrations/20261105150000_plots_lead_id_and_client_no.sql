-- Phase E (client-ID cross-app integration plan, docs/plans/43):
--   1. plots.lead_id -- closes the Pipeline -> Allocation -> Plot identity
--      chain. Set by confirm_allocation() alongside the pre-existing
--      free-text client_name/client_contact (kept as-is for plots
--      allocated outside the normal flow).
--   2. leads.client_no -- a short, sequential, human-readable client
--      number (e.g. CL-000123), assigned once per lead and stable
--      forever. The format the user explicitly confirmed for the receipt
--      redesign (short client number, not the raw UUID).

alter table public.plots add column if not exists lead_id uuid references public.leads(id);

create sequence if not exists public.leads_client_no_seq;

alter table public.leads add column if not exists client_no text;

-- Backfill existing real leads in a stable order (created_at, falling back
-- to id for any legacy row with a null/duplicate created_at) so every
-- existing client gets a real, permanent number.
with ordered as (
  select id, row_number() over (order by created_at nulls last, id) as rn
  from public.leads
  where client_no is null
)
update public.leads l
set client_no = 'CL-' || lpad(ordered.rn::text, 6, '0')
from ordered
where l.id = ordered.id;

-- Advance the sequence past every number just assigned so the trigger
-- below never collides with the backfill.
select setval('public.leads_client_no_seq', greatest((select count(*) from public.leads), 1));

create or replace function public.leads_assign_client_no()
returns trigger
language plpgsql
as $$
begin
  if new.client_no is null then
    new.client_no := 'CL-' || lpad(nextval('public.leads_client_no_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists leads_assign_client_no_trigger on public.leads;
create trigger leads_assign_client_no_trigger
  before insert on public.leads
  for each row execute function public.leads_assign_client_no();

alter table public.leads add constraint leads_client_no_unique unique (client_no);
alter table public.leads alter column client_no set not null;

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
