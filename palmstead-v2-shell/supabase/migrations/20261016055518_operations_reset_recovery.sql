-- Fixed Operations adapter. Installing this migration does not clear any data.
-- Only guarded Management RPCs can preview, reset or restore. No Storage deletes.
create schema if not exists app_reset_private;
revoke all on schema app_reset_private from public, anon, authenticated;
grant usage on schema app_reset_private to authenticated;

create table app_reset_private.batches (
  id uuid primary key default gen_random_uuid(),
  app_key text not null check (app_key = 'operations'),
  adapter_version integer not null default 1 check (adapter_version = 1),
  scopes text[] not null,
  actor_id uuid not null,
  actor_name text not null,
  reason text not null check (length(reason) between 3 and 500),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes',
  status text not null default 'preview' check (status in ('preview','executed','restored')),
  counts jsonb not null,
  fingerprint text not null,
  schema_fingerprint text not null,
  executed_at timestamptz,
  restored_at timestamptz
);
create table app_reset_private.snapshots (
  batch_id uuid primary key references app_reset_private.batches(id),
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create table app_reset_private.events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references app_reset_private.batches(id),
  action text not null check (action in ('preview','executed','restored')),
  actor_id uuid not null,
  actor_name text not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table app_reset_private.batches enable row level security;
alter table app_reset_private.snapshots enable row level security;
alter table app_reset_private.events enable row level security;
revoke all on all tables in schema app_reset_private from public, anon, authenticated;
create index on app_reset_private.batches (created_at desc, id desc);
create index on app_reset_private.events (batch_id, created_at);

create table public.app_data_versions (
  app_key text primary key check (app_key = 'operations'),
  generation uuid not null default gen_random_uuid(),
  changed_at timestamptz not null default clock_timestamp()
);
alter table public.app_data_versions enable row level security;
revoke all on public.app_data_versions from public, anon, authenticated;
grant select on public.app_data_versions to authenticated;
create policy app_data_versions_active_read on public.app_data_versions for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active is true));
insert into public.app_data_versions (app_key) values ('operations');
alter publication supabase_realtime add table public.app_data_versions;

create function app_reset_private.manager_name() returns text
language plpgsql security invoker set search_path = '' as $$
declare v_name text;
begin
  if auth.uid() is null then raise exception 'Management sign-in required.' using errcode='42501'; end if;
  select coalesce(nullif(p.name,''),p.agent_key) into v_name from public.profiles p
    where p.id=auth.uid() and p.role='manager' and p.active is true for share;
  if not found then raise exception 'Only active Management can reset or recover app data.' using errcode='42501'; end if;
  return v_name;
end;
$$;

-- Parent-first restore order. Only these literal table names enter dynamic SQL.
create function app_reset_private.operations_tables(p_scopes text[]) returns text[]
language plpgsql immutable security invoker set search_path = '' as $$
declare v_tables text[] := '{}';
begin
  if p_scopes is null or cardinality(p_scopes)=0 or cardinality(p_scopes)>3
    or array_position(p_scopes,null) is not null
    or not (p_scopes <@ array['projects','todos','meetings']::text[]) then
    raise exception 'Choose projects, todos or meetings.' using errcode='22023';
  end if;
  if 'projects'=any(p_scopes) then
    v_tables := array['op_projects','op_states','op_labels','op_cycles','op_modules','op_project_members',
      'op_module_members','op_issues','op_issue_assignees','op_issue_labels','op_issue_modules',
      'op_issue_relations','op_issue_links','op_issue_attachments','op_issue_comments','op_issue_activity','op_views'];
  end if;
  if 'todos'=any(p_scopes) then v_tables := v_tables || 'op_todos'::text; end if;
  if 'meetings'=any(p_scopes) then
    v_tables := v_tables || array['schedule_items','schedule_item_invitees','schedule_item_attachments','task_events'];
  end if;
  return v_tables;
end;
$$;

create function app_reset_private.operations_predicate(p_table text) returns text
language sql immutable security invoker set search_path = '' as $$
  select case p_table
    when 'schedule_items' then 't.kind = ''meeting'''
    when 'schedule_item_invitees' then 't.schedule_item_id in (select id from public.schedule_items where kind = ''meeting'')'
    when 'schedule_item_attachments' then 't.schedule_item_id in (select id from public.schedule_items where kind = ''meeting'')'
    when 'task_events' then 't.task_id in (select id from public.schedule_items where kind = ''meeting'')'
    else 'true' end
$$;

create function app_reset_private.operations_schema() returns text
language sql stable security invoker set search_path = '' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'columns',(select jsonb_agg(to_jsonb(c) order by c.table_name,c.ordinal_position)
      from information_schema.columns c where c.table_schema='public'
      and c.table_name=any(app_reset_private.operations_tables(array['projects','todos','meetings']))),
    'constraints',(select jsonb_agg(jsonb_build_array(con.conrelid::regclass::text,con.conname,pg_get_constraintdef(con.oid))
      order by con.conrelid::regclass::text,con.conname) from pg_catalog.pg_constraint con
      where con.conrelid=any(select ('public.'||t)::regclass from unnest(app_reset_private.operations_tables(array['projects','todos','meetings'])) t)
      or con.confrelid=any(select ('public.'||t)::regclass from unnest(app_reset_private.operations_tables(array['projects','todos','meetings'])) t)),
    'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.oid) from pg_catalog.pg_trigger t
      where not t.tgisinternal and t.tgrelid=any(select ('public.'||n)::regclass
      from unnest(app_reset_private.operations_tables(array['projects','todos','meetings'])) n))
    )::text,'UTF8')),'hex')
$$;

create function app_reset_private.operations_blockers(p_scopes text[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_tables text[] := app_reset_private.operations_tables(p_scopes); v_reasons jsonb := '[]'; v_count bigint;
begin
  if (select count(*) from public.op_workspaces) <> 1 then
    v_reasons := v_reasons || jsonb_build_array('The Operations adapter requires exactly one company workspace.');
  end if;
  select count(*) into v_count from pg_catalog.pg_constraint con
    where con.contype='f' and con.confrelid=any(select ('public.'||t)::regclass from unnest(v_tables) t)
    and not (con.conrelid=any(select ('public.'||t)::regclass from unnest(v_tables) t));
  if v_count>0 then
    v_reasons := v_reasons || jsonb_build_array('New linked tables need review before resetting this scope.');
  end if;
  select count(*) into v_count from pg_catalog.pg_trigger t where not t.tgisinternal
    and t.tgrelid=any(select ('public.'||n)::regclass from unnest(v_tables) n);
  if v_count>0 then
    v_reasons := v_reasons || jsonb_build_array('New Operations automation needs review before reset or recovery.');
  end if;
  if 'meetings'=any(p_scopes) and exists (
    select 1 from public.schedule_items child join public.schedule_items parent
      on parent.id in (child.recurs_parent_id,child.rescheduled_to_id,child.blocked_by_id)
      where child.kind<>'meeting' and parent.kind='meeting'
  ) then
    v_reasons := v_reasons || jsonb_build_array('A non-meeting schedule item depends on a meeting. Remove that dependency before resetting meetings.');
  end if;
  return v_reasons;
end;
$$;

-- Stable single-statement snapshot; canonical ordering includes composite-key tables.
create function app_reset_private.operations_payload(p_scopes text[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_table text; v_count bigint; v_rows jsonb; v_payload jsonb := '{}'; v_total bigint := 0;
begin
  foreach v_table in array app_reset_private.operations_tables(p_scopes) loop
    execute format('select count(*) from public.%I t where %s',v_table,app_reset_private.operations_predicate(v_table)) into v_count;
    v_total := v_total + v_count;
    if v_total>20000 then raise exception 'This reset exceeds 20,000 related records. Arrange a reviewed database backup/reset instead.' using errcode='54000'; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where %s',
      v_table,app_reset_private.operations_predicate(v_table)) into v_rows;
    v_payload := v_payload || jsonb_build_object(v_table,v_rows);
    if octet_length(v_payload::text)>20000000 then
      raise exception 'This reset exceeds the 20 MB recovery limit. Arrange a reviewed database backup/reset instead.' using errcode='54000';
    end if;
  end loop;
  return v_payload;
end;
$$;

create function app_reset_private.payload_counts(p_payload jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(key,jsonb_array_length(value)),'{}') from jsonb_each(p_payload)
$$;

create function app_reset_private.batch_summary(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',b.id,'app_key',b.app_key,'scopes',b.scopes,'actor_name',b.actor_name,
    'reason',b.reason,'created_at',b.created_at,'expires_at',b.expires_at,'status',b.status,'counts',b.counts,
    'executed_at',b.executed_at,'restored_at',b.restored_at,
    'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'actor_name',e.actor_name,'created_at',e.created_at)
      order by e.created_at,e.id),'[]') from app_reset_private.events e where e.batch_id=b.id))
    from app_reset_private.batches b where b.id=p_id
$$;

create function app_reset_private.lock_operations() returns void
language plpgsql security invoker set search_path = '' as $$
declare v_table text;
begin
  perform set_config('lock_timeout','3s',true);
  perform pg_advisory_xact_lock(607216,1);
  -- Lock all scopes in one deterministic order, including meeting dependency rows.
  for v_table in select unnest(app_reset_private.operations_tables(array['projects','todos','meetings'])) order by 1 loop
    execute format('lock table public.%I in share row exclusive mode',v_table);
  end loop;
end;
$$;

create function app_reset_private.preview_operations(p_scopes text[],p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_name text := app_reset_private.manager_name(); v_scopes text[]; v_payload jsonb; v_id uuid; v_blockers jsonb;
begin
  perform app_reset_private.operations_tables(p_scopes);
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'Enter a reset reason between 3 and 500 characters.' using errcode='22023';
  end if;
  select array_agg(distinct s order by s) into v_scopes from unnest(p_scopes) s;
  v_blockers := app_reset_private.operations_blockers(v_scopes);
  if jsonb_array_length(v_blockers)>0 then return jsonb_build_object('blockers',v_blockers,'batch',null); end if;
  v_payload := app_reset_private.operations_payload(v_scopes);
  insert into app_reset_private.batches(app_key,scopes,actor_id,actor_name,reason,counts,fingerprint,schema_fingerprint)
    values('operations',v_scopes,auth.uid(),v_name,btrim(p_reason),app_reset_private.payload_counts(v_payload),
      encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),app_reset_private.operations_schema()) returning id into v_id;
  insert into app_reset_private.events(batch_id,action,actor_id,actor_name) values(v_id,'preview',auth.uid(),v_name);
  return jsonb_build_object('blockers','[]'::jsonb,'batch',app_reset_private.batch_summary(v_id));
end;
$$;

create function app_reset_private.execute_operations(p_batch_id uuid,p_confirmation text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_name text := app_reset_private.manager_name(); v_batch app_reset_private.batches%rowtype; v_payload jsonb;
begin
  if p_confirmation is distinct from 'RESET OPERATIONS' then raise exception 'Type RESET OPERATIONS to confirm.' using errcode='22023'; end if;
  perform app_reset_private.lock_operations();
  select * into v_batch from app_reset_private.batches where id=p_batch_id for update;
  if not found or v_batch.actor_id<>auth.uid() then raise exception 'This reset preview is unavailable to this account.' using errcode='42501'; end if;
  if v_batch.status<>'preview' then return app_reset_private.batch_summary(v_batch.id); end if;
  if v_batch.expires_at<=clock_timestamp() then raise exception 'This preview expired. Preview the data again.' using errcode='22023'; end if;
  if v_batch.schema_fingerprint<>app_reset_private.operations_schema() then raise exception 'The database structure changed. Preview again after review.' using errcode='22023'; end if;
  if jsonb_array_length(app_reset_private.operations_blockers(v_batch.scopes))>0 then
    raise exception 'Dependencies changed. Preview again and resolve the listed blockers.' using errcode='22023';
  end if;
  v_payload := app_reset_private.operations_payload(v_batch.scopes);
  if v_batch.fingerprint<>encode(sha256(convert_to(v_payload::text,'UTF8')),'hex') then
    raise exception 'Operations data changed after this preview. Preview again.' using errcode='40001';
  end if;
  if not exists(select 1 from jsonb_each(v_batch.counts) where value::text::bigint>0) then
    raise exception 'The selected scopes are already empty.' using errcode='22023';
  end if;
  insert into app_reset_private.snapshots(batch_id,payload) values(v_batch.id,v_payload);
  if 'meetings'=any(v_batch.scopes) then
    delete from public.task_events where task_id in (select id from public.schedule_items where kind='meeting');
    delete from public.schedule_items where kind='meeting';
  end if;
  if 'todos'=any(v_batch.scopes) then delete from public.op_todos; end if;
  if 'projects'=any(v_batch.scopes) then
    update public.op_projects set default_state_id=null;
    delete from public.op_projects;
  end if;
  if exists(select 1 from jsonb_each(app_reset_private.payload_counts(app_reset_private.operations_payload(v_batch.scopes)))
    where value::text::bigint>0) then
    raise exception 'Some linked records could not be cleared. The reset was rolled back.' using errcode='22023';
  end if;
  update app_reset_private.batches set status='executed',executed_at=clock_timestamp() where id=v_batch.id;
  insert into app_reset_private.events(batch_id,action,actor_id,actor_name) values(v_batch.id,'executed',auth.uid(),v_name);
  update public.app_data_versions set generation=gen_random_uuid(),changed_at=clock_timestamp() where app_key='operations';
  return app_reset_private.batch_summary(v_batch.id);
end;
$$;

create function app_reset_private.restore_operations(p_batch_id uuid,p_confirmation text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_name text := app_reset_private.manager_name(); v_batch app_reset_private.batches%rowtype;
  v_payload jsonb; v_table text; v_rows jsonb;
begin
  if p_confirmation is distinct from 'RESTORE OPERATIONS' then raise exception 'Type RESTORE OPERATIONS to confirm.' using errcode='22023'; end if;
  perform app_reset_private.lock_operations();
  select * into v_batch from app_reset_private.batches where id=p_batch_id for update;
  if not found then raise exception 'This recovery batch is unavailable.' using errcode='22023'; end if;
  if v_batch.status='restored' then return app_reset_private.batch_summary(v_batch.id); end if;
  if v_batch.status<>'executed' then raise exception 'Only a completed reset can be restored.' using errcode='22023'; end if;
  if v_batch.schema_fingerprint<>app_reset_private.operations_schema() then
    raise exception 'The database structure changed. Recovery needs a reviewed migration; the snapshot is retained.' using errcode='22023';
  end if;
  if jsonb_array_length(app_reset_private.operations_blockers(v_batch.scopes))>0 then
    raise exception 'New dependencies or automation need review before recovery.' using errcode='22023';
  end if;
  select payload into v_payload from app_reset_private.snapshots where batch_id=v_batch.id;
  if v_payload is null or v_batch.fingerprint<>encode(sha256(convert_to(v_payload::text,'UTF8')),'hex') then
    raise exception 'Recovery snapshot validation failed. No records were restored.' using errcode='22023';
  end if;
  foreach v_table in array app_reset_private.operations_tables(v_batch.scopes) loop
    v_rows := v_payload->v_table;
    if v_table='op_projects' then
      select coalesce(jsonb_agg(jsonb_set(value,'{default_state_id}','null'::jsonb)),'[]') into v_rows from jsonb_array_elements(v_rows);
    elsif v_table='op_todos' then
      select coalesce(jsonb_agg(case when value->>'sms_notified_at' is null
        and ((value->>'item_date')::date+(value->>'start_time')::time) at time zone 'Africa/Accra'<=clock_timestamp()
        then jsonb_set(value,'{sms_notified_at}',to_jsonb(clock_timestamp())) else value end),'[]')
        into v_rows from jsonb_array_elements(v_rows);
    elsif v_table='schedule_items' then
      select coalesce(jsonb_agg(case when value->>'push_notified_at' is null
        and ((value->>'item_date')::date+(value->>'start_time')::time) at time zone 'Africa/Accra'<=clock_timestamp()
        then jsonb_set(value,'{push_notified_at}',to_jsonb(clock_timestamp())) else value end),'[]')
        into v_rows from jsonb_array_elements(v_rows);
    end if;
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',v_table,v_table) using v_rows;
  end loop;
  if 'projects'=any(v_batch.scopes) then
    update public.op_projects p set default_state_id=(s.value->>'default_state_id')::uuid
      from jsonb_array_elements(v_payload->'op_projects') s where p.id=(s.value->>'id')::uuid;
  end if;
  update app_reset_private.batches set status='restored',restored_at=clock_timestamp() where id=v_batch.id;
  insert into app_reset_private.events(batch_id,action,actor_id,actor_name) values(v_batch.id,'restored',auth.uid(),v_name);
  update public.app_data_versions set generation=gen_random_uuid(),changed_at=clock_timestamp() where app_key='operations';
  return app_reset_private.batch_summary(v_batch.id);
exception
  when unique_violation or foreign_key_violation then
    raise exception 'Recovery conflicts with existing identifiers or missing linked records. Nothing was restored; the snapshot is retained.' using errcode='23505';
end;
$$;

create function app_reset_private.list_operations(p_before timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_name text := app_reset_private.manager_name(); v_result jsonb;
begin
  -- Previews do not crowd completed recovery batches out of history.
  select jsonb_build_object('batches',coalesce(jsonb_agg(app_reset_private.batch_summary(b.id) order by b.created_at desc,b.id desc),'[]'),
    'has_more',(select count(*)>100 from app_reset_private.batches h where h.status<>'preview'
      and (p_before is null or h.created_at<p_before))) into v_result
    from (select id,created_at from app_reset_private.batches where status<>'preview'
      and (p_before is null or created_at<p_before) order by created_at desc,id desc limit 100) b;
  return v_result;
end;
$$;

-- Exposed invoker wrappers; private definer entry points repeat authorization.
create function public.preview_operations_reset(p_scopes text[],p_reason text) returns jsonb
language sql security invoker set search_path = '' as $$ select app_reset_private.preview_operations(p_scopes,p_reason) $$;
create function public.execute_operations_reset(p_batch_id uuid,p_confirmation text) returns jsonb
language sql security invoker set search_path = '' as $$ select app_reset_private.execute_operations(p_batch_id,p_confirmation) $$;
create function public.restore_operations_reset(p_batch_id uuid,p_confirmation text) returns jsonb
language sql security invoker set search_path = '' as $$ select app_reset_private.restore_operations(p_batch_id,p_confirmation) $$;
create function public.list_operations_resets(p_before timestamptz default null) returns jsonb
language sql security invoker set search_path = '' as $$ select app_reset_private.list_operations(p_before) $$;

revoke all on all functions in schema app_reset_private from public, anon, authenticated;
grant execute on function app_reset_private.preview_operations(text[],text),
  app_reset_private.execute_operations(uuid,text),app_reset_private.restore_operations(uuid,text),
  app_reset_private.list_operations(timestamptz) to authenticated;
revoke all on function public.preview_operations_reset(text[],text),public.execute_operations_reset(uuid,text),
  public.restore_operations_reset(uuid,text),public.list_operations_resets(timestamptz) from public, anon, authenticated;
grant execute on function public.preview_operations_reset(text[],text),public.execute_operations_reset(uuid,text),
  public.restore_operations_reset(uuid,text),public.list_operations_resets(timestamptz) to authenticated;
notify pgrst, 'reload schema';
