-- Atomic, role-checked Operations personal to-do actions.
-- All client writes go through this action boundary; direct table DML is revoked below.
create or replace function app_operations_private.todo_action(
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype := app_operations_private.current_actor();
  v_before public.op_todos%rowtype;
  v_original public.op_todos%rowtype;
  v_after public.op_todos%rowtype;
  v_expected jsonb;
  v_patch jsonb;
  v_title text;
  v_notes text;
  v_contact text;
  v_date date;
  v_start time;
  v_end time;
  v_status text;
  v_dates date[];
  v_ids uuid[] := '{}'::uuid[];
  v_parent_id uuid;
  v_new_id uuid;
  v_target public.profiles%rowtype;
  v_interval integer;
  v_freq text;
  v_until date;
  v_previous date;
  v_next_month date;
  v_next_date date;
  v_day integer;
  v_index integer;
  v_removed boolean;
  v_count integer;
begin
  if v_actor.id is null or not v_actor.active then raise exception 'An active profile is required.' using errcode='42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'To-do action payload must be an object.' using errcode = '22023';
  end if;

  if p_action = 'create' then
    v_title := btrim(coalesce(p_payload->>'title',''));
    v_notes := nullif(btrim(p_payload->>'notes'),'');
    v_contact := nullif(btrim(p_payload->>'contact'),'');
    v_date := (p_payload->>'date')::date;
    v_start := nullif(p_payload->>'startTime','')::time;
    v_end := nullif(p_payload->>'endTime','')::time;
    if length(v_title) not between 1 and 180 then raise exception 'Title must be between 1 and 180 characters.' using errcode='22023'; end if;
    if length(coalesce(v_notes,'')) > 5000 or length(coalesce(v_contact,'')) > 500 then raise exception 'To-do details are too long.' using errcode='22023'; end if;
    if v_start is not null and v_end is not null and v_end <= v_start then raise exception 'End time must be after start time.' using errcode='22023'; end if;
    insert into public.op_todos(owner_key,owner_name,assigned_to,assigned_to_name,assigned_by,assigned_by_name,title,notes,contact,item_date,start_time,end_time)
    values(v_actor.agent_key,v_actor.name,v_actor.agent_key,v_actor.name,v_actor.agent_key,v_actor.name,v_title,v_notes,v_contact,v_date,v_start,v_end)
    returning * into v_after;
    insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
    values('operations','todo_created',v_actor.agent_key,v_actor.name,'operations_todo',v_after.id::text,
      'Created to-do '||v_after.title,jsonb_build_object('after',to_jsonb(v_after)),'server');
    return to_jsonb(v_after);
  end if;

  if p_action = 'create_series' then
    v_title := btrim(coalesce(p_payload->>'title',''));
    v_notes := nullif(btrim(p_payload->>'notes'),'');
    v_contact := nullif(btrim(p_payload->>'contact'),'');
    if jsonb_typeof(p_payload->'dates') <> 'array' then raise exception 'Repeat dates are required.' using errcode='22023'; end if;
    v_freq := p_payload->>'freq';
    v_interval := coalesce(nullif(p_payload->>'interval','')::integer,1);
    v_until := nullif(p_payload->>'until','')::date;
    select array_agg(value::date order by ordinality) into v_dates
      from jsonb_array_elements_text(p_payload->'dates') with ordinality as d(value,ordinality);
    if length(v_title) not between 1 and 180 then raise exception 'Title must be between 1 and 180 characters.' using errcode='22023'; end if;
    if length(coalesce(v_notes,'')) > 5000 or length(coalesce(v_contact,'')) > 500 then raise exception 'To-do details are too long.' using errcode='22023'; end if;
    if v_freq not in ('daily','weekly','monthly') or v_interval not between 1 and 12 then raise exception 'Choose a valid repeat interval.' using errcode='22023'; end if;
    if coalesce(cardinality(v_dates),0) not between 1 and 12 then raise exception 'A repeating to-do can contain 1 to 12 dates.' using errcode='22023'; end if;
    if v_dates[1] <> (p_payload->>'date')::date then raise exception 'The first repeat date must match the selected date.' using errcode='22023'; end if;
    if v_until is not null and v_dates[cardinality(v_dates)] > v_until then raise exception 'A repeat date cannot be after the repeat end date.' using errcode='22023'; end if;
    v_start := nullif(p_payload->>'startTime','')::time;
    v_end := nullif(p_payload->>'endTime','')::time;
    if v_start is not null and v_end is not null and v_end <= v_start then raise exception 'End time must be after start time.' using errcode='22023'; end if;

    for v_index in 1..cardinality(v_dates) loop
      if v_index > 1 then
        v_previous := v_dates[v_index-1];
        if v_freq = 'daily' then
          v_next_date := v_previous + v_interval;
        elsif v_freq = 'weekly' then
          v_next_date := v_previous + (7 * v_interval);
        else
          v_next_month := (date_trunc('month',v_previous)::date + make_interval(months => v_interval))::date;
          v_day := least(extract(day from v_previous)::integer,
            extract(day from (v_next_month + interval '1 month - 1 day'))::integer);
          v_next_date := v_next_month + (v_day - 1);
        end if;
        if v_dates[v_index] <> v_next_date then raise exception 'Repeat dates do not match the selected frequency.' using errcode='22023'; end if;
      end if;
      insert into public.op_todos(owner_key,owner_name,assigned_to,assigned_to_name,assigned_by,assigned_by_name,title,notes,contact,item_date,start_time,end_time,recurs_freq,recurs_interval,recurs_until,recurs_parent_id)
      values(v_actor.agent_key,v_actor.name,v_actor.agent_key,v_actor.name,v_actor.agent_key,v_actor.name,v_title,v_notes,v_contact,v_dates[v_index],v_start,v_end,v_freq,v_interval,v_until,case when v_index=1 then null else v_parent_id end)
      returning * into v_after;
      if v_index = 1 then
        v_parent_id := v_after.id;
        v_ids := array_append(v_ids,v_after.id);
      else
        v_ids := array_append(v_ids,v_after.id);
      end if;
    end loop;
    insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
    values('operations','todo_series_created',v_actor.agent_key,v_actor.name,'operations_todo',v_parent_id::text,
      'Created repeating to-do series '||v_title,jsonb_build_object('todo_ids',to_jsonb(v_ids),'dates',to_jsonb(v_dates),'frequency',v_freq,'interval',v_interval),'server');
    return (select coalesce(jsonb_agg(to_jsonb(t) order by t.item_date),'[]'::jsonb) from public.op_todos t where t.id=any(v_ids));
  end if;

  if p_action not in ('update','status','reschedule','delete','cancel_future','escalate') then
    raise exception 'Unsupported to-do action.' using errcode = '22023';
  end if;

  if p_action = 'cancel_future' then
    v_parent_id := (p_payload->>'seriesId')::uuid;
    v_date := (p_payload->>'fromDate')::date;
    select t.* into v_before from public.op_todos t where t.id=v_parent_id or t.recurs_parent_id=v_parent_id order by (t.id=v_parent_id) desc limit 1;
    if not found then raise exception 'Repeating to-do series not found.' using errcode='P0002'; end if;
    if v_before.recurs_parent_id is not null then v_parent_id := v_before.recurs_parent_id; end if;
    select t.* into v_before from public.op_todos t where t.id=v_parent_id for update;
    if not found then raise exception 'Repeating to-do series not found.' using errcode='P0002'; end if;
    if v_actor.role <> 'manager' and v_before.owner_key <> v_actor.agent_key then
      raise exception 'Only the to-do owner or Management can cancel future repeats.' using errcode='42501';
    end if;
    update public.op_todos t set status='cancelled',cancelled_at=clock_timestamp()
      where (t.id=v_parent_id or t.recurs_parent_id=v_parent_id) and t.item_date>=v_date
        and t.status='open' and (t.owner_key=v_actor.agent_key or v_actor.role='manager');
    get diagnostics v_count = row_count;
    insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
    values('operations','todo_series_cancelled',v_actor.agent_key,v_actor.name,'operations_todo',v_parent_id::text,
      'Cancelled future repeating to-dos',jsonb_build_object('from_date',v_date,'rows_cancelled',v_count),'server');
    return jsonb_build_object('cancelled',v_count);
  end if;

  select t.* into v_before from public.op_todos t where t.id=(p_payload->>'id')::uuid for update;
  if not found then raise exception 'To-do not found.' using errcode='P0002'; end if;
  if v_before.status='rescheduled' then raise exception 'This to-do was rescheduled. Open its replacement to continue.' using errcode='22023'; end if;

  v_expected := jsonb_build_object(
    'title',v_before.title,'notes',v_before.notes,'contact',v_before.contact,'date',v_before.item_date,
    'startTime',case when v_before.start_time is null then null else to_char(v_before.start_time,'HH24:MI') end,
    'endTime',case when v_before.end_time is null then null else to_char(v_before.end_time,'HH24:MI') end,
    'status',v_before.status
  );

  if p_action = 'update' then
    if v_actor.role <> 'manager' and v_before.owner_key <> v_actor.agent_key then
      raise exception 'Only the to-do owner or Management can edit it.' using errcode='42501';
    end if;
    if v_before.status <> 'open' then raise exception 'Reopen this to-do before editing it.' using errcode='22023'; end if;
    if p_payload->'expected' is distinct from v_expected then raise exception 'This to-do changed after you opened it. Reload and try again.' using errcode='40001'; end if;
    v_patch := p_payload->'patch';
    if v_patch is null or jsonb_typeof(v_patch)<>'object' or v_patch='{}'::jsonb then raise exception 'Choose at least one to-do field to update.' using errcode='22023'; end if;
    if not (array(select jsonb_object_keys(v_patch)) <@ array['title','notes','contact','date','startTime','endTime']::text[]) then
      raise exception 'The update contains an unsupported field.' using errcode='22023';
    end if;
    v_title := case when v_patch?'title' then btrim(v_patch->>'title') else v_before.title end;
    v_notes := case when v_patch?'notes' then nullif(btrim(v_patch->>'notes'),'') else v_before.notes end;
    v_contact := case when v_patch?'contact' then nullif(btrim(v_patch->>'contact'),'') else v_before.contact end;
    v_date := case when v_patch?'date' then (v_patch->>'date')::date else v_before.item_date end;
    v_start := case when v_patch?'startTime' then nullif(v_patch->>'startTime','')::time else v_before.start_time end;
    v_end := case when v_patch?'endTime' then nullif(v_patch->>'endTime','')::time else v_before.end_time end;
    if length(v_title) not between 1 and 180 then raise exception 'Title must be between 1 and 180 characters.' using errcode='22023'; end if;
    if length(coalesce(v_notes,'')) > 5000 or length(coalesce(v_contact,'')) > 500 then raise exception 'To-do details are too long.' using errcode='22023'; end if;
    if v_start is not null and v_end is not null and v_end <= v_start then raise exception 'End time must be after start time.' using errcode='22023'; end if;
    update public.op_todos set title=v_title,notes=v_notes,contact=v_contact,item_date=v_date,start_time=v_start,end_time=v_end
      where id=v_before.id returning * into v_after;
    insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
    values('operations','todo_updated',v_actor.agent_key,v_actor.name,'operations_todo',v_after.id::text,
      'Updated to-do '||v_after.title,jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_after)),'server');
    return to_jsonb(v_after);
  end if;

  if p_action = 'status' then
    v_status := p_payload->>'status';
    if v_status not in ('open','done','cancelled') then raise exception 'Choose a valid to-do status.' using errcode='22023'; end if;
    if v_actor.role <> 'manager' and v_actor.agent_key <> v_before.owner_key and v_actor.agent_key <> v_before.assigned_to then
      raise exception 'Only the owner or assigned staff member can update this to-do.' using errcode='42501';
    end if;
    if v_status='cancelled' and v_actor.role <> 'manager' and v_actor.agent_key <> v_before.owner_key then
      raise exception 'Only the owner or Management can cancel this to-do.' using errcode='42501';
    end if;
    if p_payload->>'expectedStatus' is distinct from v_before.status then raise exception 'This to-do status changed. Reload and try again.' using errcode='40001'; end if;
    update public.op_todos set status=v_status,
      completed_at=case when v_status='done' then clock_timestamp() else null end,
      cancelled_at=case when v_status='cancelled' then clock_timestamp() else null end
      where id=v_before.id returning * into v_after;
    insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
    values('operations','todo_status_changed',v_actor.agent_key,v_actor.name,'operations_todo',v_after.id::text,
      'Changed to-do status',jsonb_build_object('before',v_before.status,'after',v_after.status),'server');
    return to_jsonb(v_after);
  end if;

  if p_action = 'reschedule' then
    if v_actor.role <> 'manager' and v_actor.agent_key <> v_before.owner_key and v_actor.agent_key <> v_before.assigned_to then
      raise exception 'Only the owner or assigned staff member can reschedule this to-do.' using errcode='42501';
    end if;
    if v_before.status <> 'open' then raise exception 'Only open to-dos can be rescheduled.' using errcode='22023'; end if;
    if p_payload->'expected' is distinct from v_expected then raise exception 'This to-do changed after you opened it. Reload and try again.' using errcode='40001'; end if;
    v_date := (p_payload->>'date')::date;
    v_start := nullif(p_payload->>'startTime','')::time;
    v_end := nullif(p_payload->>'endTime','')::time;
    if v_start is not null and v_end is not null and v_end <= v_start then raise exception 'End time must be after start time.' using errcode='22023'; end if;
    v_original := v_before;
    if v_before.recurs_parent_id is null and exists(select 1 from public.op_todos c where c.recurs_parent_id=v_before.id and c.status='open') then
      -- The series anchor moves with its future occurrences; their links are repointed atomically below.
      null;
    end if;
    insert into public.op_todos(owner_key,owner_name,assigned_to,assigned_to_name,assigned_by,assigned_by_name,title,notes,contact,item_date,start_time,end_time,
      status,escalated_to,escalated_to_name,escalated_by,escalated_by_name,escalated_at,escalation_note,recurs_freq,recurs_interval,recurs_until,recurs_parent_id)
    values(v_before.owner_key,v_before.owner_name,v_before.assigned_to,v_before.assigned_to_name,v_before.assigned_by,v_before.assigned_by_name,
      v_before.title,v_before.notes,v_before.contact,v_date,v_start,v_end,'open',v_before.escalated_to,v_before.escalated_to_name,
      v_before.escalated_by,v_before.escalated_by_name,v_before.escalated_at,v_before.escalation_note,v_before.recurs_freq,
      v_before.recurs_interval,v_before.recurs_until,v_before.recurs_parent_id)
    returning * into v_after;
    if v_before.recurs_parent_id is null then
      update public.op_todos set recurs_parent_id=v_after.id where recurs_parent_id=v_before.id;
    end if;
    update public.op_todos set status='rescheduled',rescheduled_to_id=v_after.id where id=v_before.id returning * into v_before;
    insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
    values('operations','todo_rescheduled',v_actor.agent_key,v_actor.name,'operations_todo',v_before.id::text,
      'Rescheduled to-do '||v_before.title,jsonb_build_object('before',to_jsonb(v_original),'replacement',to_jsonb(v_after)),'server');
    return to_jsonb(v_after);
  end if;

  if p_action = 'delete' then
    if v_actor.role <> 'manager' and v_before.owner_key <> v_actor.agent_key then
      raise exception 'Only the to-do owner or Management can delete it.' using errcode='42501';
    end if;
    if p_payload->>'expectedStatus' is distinct from v_before.status then raise exception 'This to-do changed. Reload and try again.' using errcode='40001'; end if;
    if v_before.status='rescheduled' then raise exception 'A rescheduled item is history; remove its active replacement instead.' using errcode='22023'; end if;
    if exists(select 1 from public.op_todos t where t.recurs_parent_id=v_before.id or t.rescheduled_to_id=v_before.id) then
      update public.op_todos set status='cancelled',cancelled_at=clock_timestamp() where id=v_before.id returning * into v_after;
      v_removed := false;
    else
      delete from public.op_todos where id=v_before.id;
      v_after := v_before;
      v_removed := true;
    end if;
    insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
    values('operations',case when v_removed then 'todo_deleted' else 'todo_cancelled_for_history' end,v_actor.agent_key,v_actor.name,
      'operations_todo',v_before.id::text,case when v_removed then 'Deleted to-do ' else 'Cancelled to-do to preserve recurrence history: ' end||v_before.title,
      jsonb_build_object('before',to_jsonb(v_before),'retained_as_cancelled',not v_removed),'server');
    return jsonb_build_object('removed',v_removed,'item',to_jsonb(v_after));
  end if;

  if p_action = 'escalate' then
    if v_actor.role <> 'manager' and v_before.owner_key <> v_actor.agent_key then
      raise exception 'Only the to-do owner or Management can reassign it.' using errcode='42501';
    end if;
    if v_before.status <> 'open' then raise exception 'Only open to-dos can be reassigned.' using errcode='22023'; end if;
    select p.* into v_target from public.profiles p where p.agent_key=p_payload->>'toKey' and p.active for share;
    if not found then raise exception 'Choose an active staff member.' using errcode='22023'; end if;
    if length(coalesce(p_payload->>'note','')) > 1000 then raise exception 'Escalation note is too long.' using errcode='22023'; end if;
    update public.op_todos set assigned_to=v_target.agent_key,assigned_to_name=v_target.name,
      escalated_to=v_target.agent_key,escalated_to_name=v_target.name,escalated_by=v_actor.agent_key,
      escalated_by_name=v_actor.name,escalated_at=clock_timestamp(),escalation_note=nullif(btrim(p_payload->>'note'),'')
      where id=v_before.id returning * into v_after;
    insert into public.audit_events(category,event_type,actor_key,actor_name,entity_type,entity_id,summary,detail,source)
    values('operations','todo_reassigned',v_actor.agent_key,v_actor.name,'operations_todo',v_after.id::text,
      'Reassigned to-do '||v_after.title,jsonb_build_object('from',v_before.assigned_to,'to',v_after.assigned_to,'note',v_after.escalation_note),'server');
    return to_jsonb(v_after);
  end if;

  raise exception 'Unsupported to-do action.' using errcode = '22023';
end;
$$;

create or replace function public.operations_todo_action(p_action text, p_payload jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select app_operations_private.todo_action(p_action,p_payload) $$;

revoke all on function app_operations_private.todo_action(text,jsonb) from public, anon;
grant execute on function app_operations_private.todo_action(text,jsonb) to authenticated;
revoke all on function public.operations_todo_action(text,jsonb) from public, anon;
grant execute on function public.operations_todo_action(text,jsonb) to authenticated;

-- The direct table policies remain for read scope; client mutations are routed to the atomic RPC.
revoke insert,update,delete on table public.op_todos from public,anon,authenticated;
grant select on table public.op_todos to authenticated;
