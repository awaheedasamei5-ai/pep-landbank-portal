-- Immutable morning and evening snapshots. SMS contains only a protected link.
create table if not exists public.sales_daily_digest_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  morning_time time not null default '08:00',
  evening_time time not null default '18:00',
  updated_at timestamptz not null default now(),
  check (morning_time < evening_time)
);
insert into public.sales_daily_digest_settings(singleton) values (true) on conflict do nothing;

create table if not exists public.sales_daily_digest_runs (
  id uuid primary key default gen_random_uuid(),
  local_date date not null,
  kind text not null check (kind in ('morning','evening')),
  snapshot jsonb not null,
  generated_at timestamptz not null default now(),
  unique(local_date,kind)
);

create table if not exists public.sales_daily_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sales_daily_digest_runs(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id),
  status text not null default 'queued' check (status in ('queued','sending','accepted','failed','needs_review','blocked')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  provider_reference text,
  provider_accepted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,recipient_id)
);
create index if not exists sales_daily_digest_deliveries_claim_idx on public.sales_daily_digest_deliveries(next_attempt_at,created_at) where status = 'queued';
create index if not exists sales_digest_activity_actor_time_idx on public.activity_log(agent_key,created_at);
create index if not exists sales_digest_activity_follow_idx on public.activity_log(agent_key,follow) where follow is not null;
create index if not exists sales_digest_lead_owner_date_idx on public.leads(agent_key,date_added) where deleted_at is null;
create index if not exists sales_digest_lead_owner_next_idx on public.leads(agent_key,next_action_date) where deleted_at is null and next_action_date is not null;
create index if not exists sales_digest_lead_handler_next_idx on public.leads(assigned_agent_key,next_action_date) where deleted_at is null and next_action_date is not null;
create index if not exists sales_digest_visit_actor_created_idx on public.site_visits(agent_key,created_at) where deleted_at is null;
create index if not exists sales_digest_visit_actor_date_idx on public.site_visits(agent_key,visit_date) where deleted_at is null;
create index if not exists sales_digest_payment_actor_date_idx on public.payments(agent_key,payment_date) where status='approved';
create index if not exists sales_digest_todo_completed_idx on public.op_todos(assigned_to,completed_at) where completed_at is not null;

alter table public.sales_daily_digest_settings enable row level security;
alter table public.sales_daily_digest_runs enable row level security;
alter table public.sales_daily_digest_deliveries enable row level security;
revoke all on public.sales_daily_digest_settings, public.sales_daily_digest_runs, public.sales_daily_digest_deliveries from public, anon, authenticated;
grant select, update on public.sales_daily_digest_settings to authenticated;
grant select on public.sales_daily_digest_runs, public.sales_daily_digest_deliveries to authenticated;
grant all on public.sales_daily_digest_settings, public.sales_daily_digest_runs, public.sales_daily_digest_deliveries to service_role;
create policy sales_daily_digest_settings_manager_read on public.sales_daily_digest_settings for select to authenticated using (public.my_role() = 'manager');
create policy sales_daily_digest_settings_manager_update on public.sales_daily_digest_settings for update to authenticated using (public.my_role() = 'manager') with check (public.my_role() = 'manager');
create policy sales_daily_digest_runs_manager_read on public.sales_daily_digest_runs for select to authenticated using (public.my_role() = 'manager');
create policy sales_daily_digest_deliveries_manager_read on public.sales_daily_digest_deliveries for select to authenticated using (public.my_role() = 'manager');

create or replace function public.build_sales_daily_digest_snapshot(p_day date, p_kind text)
returns jsonb language sql security definer set search_path = public, pg_temp set row_security = off
as $$
  select jsonb_build_object(
    'date', p_day, 'kind', p_kind, 'timezone', 'Africa/Accra',
    'generatedAt', now(),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
      'key', profile.agent_key, 'name', profile.name,
      'tasks', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'start',t.start_time,'end',t.end_time,'status',t.status,'completedAt',t.completed_at,'rescheduledTo',t.rescheduled_to_id) order by t.start_time,t.title)
        from public.op_todos t where t.assigned_to = profile.agent_key and t.item_date = p_day), '[]'::jsonb),
      'followUps', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'client',a.client,'action',a.action,'outcome',a.outcome,'leadId',a.lead_id) order by a.client)
        from public.activity_log a where a.agent_key = profile.agent_key and a.follow = p_day), '[]'::jsonb),
      'leadNextActions', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'client',l.name,'action',l.next_action) order by l.name)
        from public.leads l where (l.agent_key = profile.agent_key or l.assigned_agent_key = profile.agent_key) and l.deleted_at is null and l.next_action_date = p_day), '[]'::jsonb),
      'visitsScheduled', coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'client',v.name,'time',v.visit_time,'status',v.status,'leadId',v.lead_id) order by v.visit_time)
        from public.site_visits v where v.agent_key = profile.agent_key and v.deleted_at is null and v.visit_date = p_day), '[]'::jsonb),
      'newLeads', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'client',l.name,'source',l.lead_source,'stage',l.stage) order by l.name)
        from public.leads l where l.agent_key = profile.agent_key and l.deleted_at is null and l.date_added = p_day), '[]'::jsonb),
      'calls', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'client',a.client,'action',a.action,'outcome',a.outcome,'leadId',a.lead_id,'at',a.created_at) order by a.created_at)
        from public.activity_log a where a.agent_key = profile.agent_key and (a.created_at at time zone 'Africa/Accra')::date = p_day and (lower(trim(a.action)) = 'call' or (lower(trim(a.action)) = 'pipeline update' and lower(trim(coalesce(a.method,''))) in ('phone call','phone')))), '[]'::jsonb),
      'otherActivity', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'client',a.client,'action',a.action,'at',a.created_at) order by a.created_at)
        from public.activity_log a where a.agent_key = profile.agent_key and (a.created_at at time zone 'Africa/Accra')::date = p_day and lower(trim(a.action)) not in ('payment logged','payment deleted','payment corrected','stage changed') and not (lower(trim(a.action)) = 'call' or (lower(trim(a.action)) = 'pipeline update' and lower(trim(coalesce(a.method,''))) in ('phone call','phone')))), '[]'::jsonb),
      'visitRequests', coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'client',v.name,'visitDate',v.visit_date,'status',v.status,'leadId',v.lead_id) order by v.created_at)
        from public.site_visits v where v.agent_key = profile.agent_key and v.deleted_at is null and (v.created_at at time zone 'Africa/Accra')::date = p_day), '[]'::jsonb),
      'approvedReceipts', coalesce((select jsonb_agg(jsonb_build_object('id',pay.id,'client',pay.client_name,'amount',pay.amount,'receipt',pay.receipt_number,'leadId',pay.lead_id) order by pay.client_name)
        from public.payments pay where pay.agent_key = profile.agent_key and pay.status = 'approved' and pay.payment_date = p_day), '[]'::jsonb),
      'tasksCompletedToday', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'completedAt',t.completed_at) order by t.completed_at)
        from public.op_todos t where t.assigned_to = profile.agent_key and t.completed_at is not null and (t.completed_at at time zone 'Africa/Accra')::date = p_day), '[]'::jsonb),
      'tasksMissed', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'dueDate',t.item_date) order by t.item_date,t.title)
        from public.op_todos t where t.assigned_to = profile.agent_key and t.status = 'open' and t.item_date < p_day), '[]'::jsonb)
    ) order by profile.name) from public.profiles profile where profile.active and profile.role <> 'manager'), '[]'::jsonb)
  );
$$;

create or replace function public.queue_sales_daily_digest(p_day date, p_kind text, p_force boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp set row_security = off
as $$
declare v_run uuid; v_settings public.sales_daily_digest_settings%rowtype; v_now time;
begin
  if p_kind not in ('morning','evening') then raise exception 'Invalid digest kind'; end if;
  if p_day <> (now() at time zone 'Africa/Accra')::date then raise exception 'Only the current Ghana day can be queued'; end if;
  select * into v_settings from public.sales_daily_digest_settings where singleton;
  if not v_settings.enabled and not p_force then return null; end if;
  v_now := (now() at time zone 'Africa/Accra')::time;
  if not p_force and (
    v_now < case when p_kind = 'morning' then v_settings.morning_time else v_settings.evening_time end
    or v_now >= (case when p_kind = 'morning' then v_settings.morning_time else v_settings.evening_time end + interval '15 minutes')::time
  ) then return null; end if;
  select id into v_run from public.sales_daily_digest_runs where local_date = p_day and kind = p_kind;
  if v_run is null then
    insert into public.sales_daily_digest_runs(local_date,kind,snapshot)
    values (p_day,p_kind,public.build_sales_daily_digest_snapshot(p_day,p_kind))
    on conflict (local_date,kind) do nothing returning id into v_run;
    if v_run is null then select id into v_run from public.sales_daily_digest_runs where local_date = p_day and kind = p_kind; end if;
  end if;
  insert into public.sales_daily_digest_deliveries(run_id,recipient_id)
  select v_run,id from public.profiles where role = 'manager' and active
  on conflict (run_id,recipient_id) do nothing;
  return v_run;
end;
$$;

create or replace function public.claim_sales_daily_digest_deliveries(p_limit integer default 10)
returns setof public.sales_daily_digest_deliveries language plpgsql security definer set search_path = public, pg_temp set row_security = off
as $$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  update public.sales_daily_digest_deliveries set status='needs_review',last_error='Delivery interrupted after claim; check provider before retry.',lease_until=null,updated_at=now() where status='sending' and lease_until < now();
  update public.sales_daily_digest_deliveries d set status='blocked',last_error='This report is from an earlier day; a late SMS was not sent.',updated_at=now()
  from public.sales_daily_digest_runs r where r.id=d.run_id and d.status='queued' and r.local_date < (now() at time zone 'Africa/Accra')::date;
  return query with candidates as (
    select id from public.sales_daily_digest_deliveries where status='queued' and next_attempt_at <= now() order by next_attempt_at,created_at for update skip locked limit greatest(1,least(coalesce(p_limit,10),25))
  ) update public.sales_daily_digest_deliveries d set status='sending',attempt_count=d.attempt_count+1,lease_until=now()+interval '5 minutes',updated_at=now() from candidates c where d.id=c.id returning d.*;
end;
$$;

create or replace function public.verify_sales_daily_digest_worker_token(p_token text)
returns boolean language sql security definer set search_path = public, vault, pg_temp
as $$ select p_token is not null and p_token = (select decrypted_secret from vault.decrypted_secrets where name='sales_daily_digest_worker_token' limit 1) $$;

create or replace function public.dispatch_sales_daily_digest_sms()
returns void language plpgsql security definer set search_path = public, vault, pg_temp set row_security = off
as $$
declare v_token text;
begin
  if not exists (select 1 from public.sales_daily_digest_settings where singleton and enabled) then return; end if;
  if not exists (select 1 from public.sales_daily_digest_deliveries where status='queued' and next_attempt_at <= now()) then return; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='sales_daily_digest_worker_token' limit 1;
  if v_token is null then raise exception 'Sales digest worker token unavailable'; end if;
  perform net.http_post(url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/process-sales-daily-digest', headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',v_token), body := '{}'::jsonb);
end;
$$;

create or replace function public.requeue_sales_daily_digest_delivery(p_delivery uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.my_role() <> 'manager' then raise exception 'Management required' using errcode='42501'; end if;
  update public.sales_daily_digest_deliveries set status='queued',next_attempt_at=now(),last_error=null,updated_at=now() where id=p_delivery and status in ('blocked','failed');
end;
$$;

revoke all on function public.build_sales_daily_digest_snapshot(date,text), public.queue_sales_daily_digest(date,text,boolean), public.claim_sales_daily_digest_deliveries(integer), public.verify_sales_daily_digest_worker_token(text), public.dispatch_sales_daily_digest_sms(), public.requeue_sales_daily_digest_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_sales_daily_digest_deliveries(integer), public.verify_sales_daily_digest_worker_token(text) to service_role;
grant execute on function public.requeue_sales_daily_digest_delivery(uuid) to authenticated;

do $$
declare v_job_id bigint;
begin
  if not exists (select 1 from vault.secrets where name='sales_daily_digest_worker_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'sales_daily_digest_worker_token','Internal sales daily digest worker token');
  end if;
  select jobid into v_job_id from cron.job where jobname='sales-daily-digest-morning' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  select jobid into v_job_id from cron.job where jobname='sales-daily-digest-evening' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  select jobid into v_job_id from cron.job where jobname='sales-daily-digest-sms' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('sales-daily-digest-morning','*/5 * * * *','select public.queue_sales_daily_digest((now() at time zone ''Africa/Accra'')::date,''morning'');');
  perform cron.schedule('sales-daily-digest-evening','*/5 * * * *','select public.queue_sales_daily_digest((now() at time zone ''Africa/Accra'')::date,''evening'');');
  perform cron.schedule('sales-daily-digest-sms','* * * * *','select public.dispatch_sales_daily_digest_sms();');
end;
$$;
