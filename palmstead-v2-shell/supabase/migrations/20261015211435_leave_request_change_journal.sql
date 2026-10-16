-- Prospective, application-immutable evidence. Existing state is observed as
-- baseline only; no historical submission, approval or schedule is invented.
create schema if not exists leave_reporting_private;
revoke all on schema leave_reporting_private from public, anon;
grant usage on schema leave_reporting_private to authenticated;

create table leave_reporting_private.request_journal_metadata (
  id integer primary key check(id=1), started_at timestamptz not null default clock_timestamp()
);
insert into leave_reporting_private.request_journal_metadata(id) values(1);
create table leave_reporting_private.request_journal (
  id bigint generated always as identity primary key,
  request_id uuid not null, request_reference text not null,
  owner_key text not null, previous_owner_key text, owner_name text not null,
  actor_name text not null, actor_kind text not null,
  event_kind text not null, captured_at timestamptz not null default clock_timestamp(),
  before_state jsonb, after_state jsonb, changed_fields text[] not null,
  submission_event_id bigint, cycle_submitted_at timestamptz, cycle_seconds numeric
);
create index request_journal_owner_idx on leave_reporting_private.request_journal(owner_key,id);
create index request_journal_request_idx on leave_reporting_private.request_journal(request_id,id desc);
create index request_journal_before_year_idx on leave_reporting_private.request_journal(((before_state->>'year')::integer));
create index request_journal_after_year_idx on leave_reporting_private.request_journal(((after_state->>'year')::integer));
alter table leave_reporting_private.request_journal enable row level security;
alter table leave_reporting_private.request_journal_metadata enable row level security;
revoke all on leave_reporting_private.request_journal, leave_reporting_private.request_journal_metadata from public, anon, authenticated, service_role;
grant select on leave_reporting_private.request_journal, leave_reporting_private.request_journal_metadata to authenticated;
create policy journal_active_reader on leave_reporting_private.request_journal for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and
    (p.role='manager' or (p.role='agent' and p.agent_key=owner_key and (previous_owner_key is null or previous_owner_key=owner_key))))
);
create policy journal_metadata_active_reader on leave_reporting_private.request_journal_metadata for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('agent','manager'))
);

create function leave_reporting_private.request_state(p_request public.leave_requests)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('year',p_request.year,'dates',p_request.dates,'days',p_request.days_count,
    'status',p_request.status,'isEmergency',p_request.is_emergency,'deductQuota',p_request.deduct_quota,
    'decidedAt',p_request.decided_at,'autoSubmittedAt',p_request.auto_submitted_at,'usedConfirmedAt',p_request.used_confirmed_at);
$$;
revoke all on function leave_reporting_private.request_state(public.leave_requests) from public,anon,authenticated;

create function leave_reporting_private.reject_journal_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Recorded Leave change evidence is append-only.' using errcode='42501'; end;
$$;
revoke all on function leave_reporting_private.reject_journal_mutation() from public,anon,authenticated;
create trigger request_journal_immutable before update or delete on leave_reporting_private.request_journal
for each row execute function leave_reporting_private.reject_journal_mutation();
create trigger request_journal_metadata_immutable before update or delete on leave_reporting_private.request_journal_metadata
for each row execute function leave_reporting_private.reject_journal_mutation();

create function leave_reporting_private.capture_request_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_before jsonb; v_after jsonb; v_row public.leave_requests; v_fields text[];
  v_kind text; v_actor text; v_actor_kind text; v_old_owner text;
  v_submission_id bigint; v_submitted_at timestamptz; v_seconds numeric;
  v_at timestamptz := clock_timestamp();
begin
  -- Internal trigger only: authorized request DML and trusted scheduled work
  -- are the entrypoints. Direct EXECUTE is revoked, including authenticated.
  if tg_table_schema <> 'public' or tg_table_name <> 'leave_requests' then raise exception 'Invalid journal trigger target'; end if;
  if tg_op <> 'INSERT' then v_before:=leave_reporting_private.request_state(old); v_old_owner:=old.agent_key; end if;
  if tg_op='DELETE' then v_row:=old; else v_row:=new; v_after:=leave_reporting_private.request_state(new); end if;
  select coalesce(array_agg(key order by key),'{}'::text[]) into v_fields from (
    select key from jsonb_object_keys(coalesce(v_before,'{}') || coalesce(v_after,'{}')) key
    where v_before->key is distinct from v_after->key
  ) changed;
  if tg_op='UPDATE' then
    if new.letter_text is distinct from old.letter_text then v_fields:=array_append(v_fields,'letterContent'); end if;
    if new.reschedule_note is distinct from old.reschedule_note then v_fields:=array_append(v_fields,'privateNote'); end if;
    if new.decided_signature is distinct from old.decided_signature then v_fields:=array_append(v_fields,'decisionSignature'); end if;
    if new.request_no is distinct from old.request_no or new.agent_name is distinct from old.agent_name then v_fields:=array_append(v_fields,'referenceOrOwnerLabel'); end if;
    if new.agent_key is distinct from old.agent_key then v_fields:=array_append(v_fields,'owner'); end if;
    if cardinality(v_fields)=0 then return null; end if;
  end if;
  select p.name into v_actor from public.profiles p where p.id=(select auth.uid());
  v_actor_kind:=case when auth.uid() is null then 'system' else 'authenticated' end;
  v_actor:=coalesce(v_actor,case when auth.uid() is null then 'Trusted server' else 'Unresolved authenticated actor' end);
  if tg_op='DELETE' then v_kind:='deleted';
  elsif tg_op='UPDATE' and new.agent_key is distinct from old.agent_key then v_kind:='ownership_changed';
  elsif v_row.status='pending' and (tg_op='INSERT' or old.status is distinct from 'pending') then v_kind:='submitted';
  elsif tg_op='UPDATE' and new.status='pending' and old.status='pending' and v_fields && array['year','dates','days','isEmergency','deductQuota'] then v_kind:='amended_submission';
  elsif tg_op='INSERT' then v_kind:='created';
  elsif old.status='pending' and new.status in ('approved','declined','rescheduled') then v_kind:='decision';
  elsif old.status is distinct from new.status then v_kind:='status_changed';
  elsif new.used_confirmed_at is distinct from old.used_confirmed_at then v_kind:='usage_confirmation_changed';
  elsif v_fields && array['year','dates','days'] then v_kind:='schedule_changed';
  elsif new.deduct_quota is distinct from old.deduct_quota then v_kind:='quota_changed';
  else v_kind:='details_changed'; end if;
  if v_kind='decision' then
    select j.id,j.captured_at into v_submission_id,v_submitted_at from leave_reporting_private.request_journal j
      where j.request_id=v_row.id and j.owner_key=v_row.agent_key and j.event_kind in ('submitted','amended_submission')
      and j.id > coalesce((select max(closed.id) from leave_reporting_private.request_journal closed
        where closed.request_id=v_row.id and (closed.event_kind in ('decision','deleted','ownership_changed')
          or (closed.event_kind='status_changed' and closed.after_state->>'status' <> 'pending'))),0)
      order by j.id desc limit 1;
    if v_submitted_at is not null and v_at>=v_submitted_at then v_seconds:=round(extract(epoch from v_at-v_submitted_at)::numeric,3); end if;
  end if;
  insert into leave_reporting_private.request_journal(request_id,request_reference,owner_key,previous_owner_key,owner_name,
    actor_name,actor_kind,event_kind,captured_at,before_state,after_state,changed_fields,submission_event_id,cycle_submitted_at,cycle_seconds)
  values(v_row.id,coalesce(v_row.request_no,v_row.id::text),v_row.agent_key,v_old_owner,v_row.agent_name,
    v_actor,v_actor_kind,v_kind,v_at,v_before,v_after,v_fields,v_submission_id,v_submitted_at,v_seconds);
  return null;
end;
$$;
revoke all on function leave_reporting_private.capture_request_change() from public,anon,authenticated;
create trigger leave_requests_capture_change after insert or update or delete on public.leave_requests
for each row execute function leave_reporting_private.capture_request_change();

insert into leave_reporting_private.request_journal(request_id,request_reference,owner_key,owner_name,actor_name,actor_kind,event_kind,captured_at,after_state,changed_fields)
select r.id,coalesce(r.request_no,r.id::text),r.agent_key,r.agent_name,'Installation baseline','system','baseline',
  (select started_at from leave_reporting_private.request_journal_metadata where id=1),
  leave_reporting_private.request_state(r),array['baseline'] from public.leave_requests r;

-- Retain the original invoker projection/RLS exactly, adding a bounded journal.
alter function public.get_leave_report_snapshot(integer) set schema leave_reporting_private;
alter function leave_reporting_private.get_leave_report_snapshot(integer) rename to leave_report_base_snapshot;
create function public.get_leave_report_snapshot(p_year integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_base jsonb; v_events jsonb; v_total bigint; v_started timestamptz; v_years jsonb;
begin
  v_base:=leave_reporting_private.leave_report_base_snapshot(p_year);
  select started_at into v_started from leave_reporting_private.request_journal_metadata where id=1;
  select count(*) into v_total from leave_reporting_private.request_journal j
    where (j.before_state->>'year')::integer=p_year or (j.after_state->>'year')::integer=p_year;
  select coalesce(jsonb_agg(to_jsonb(item) order by item."eventId"::bigint),'[]'::jsonb) into v_events from (
    select j.id::text as "eventId",j.request_id as "requestId",j.request_reference as reference,
      j.owner_key as "ownerKey",j.owner_name as "ownerName",j.actor_name as "actorName",j.actor_kind as "actorKind",
      j.event_kind as kind,j.captured_at as "capturedAt",j.before_state as "beforeState",j.after_state as "afterState",
      j.changed_fields as "changedFields",j.submission_event_id::text as "submissionEventId",
      j.cycle_submitted_at as "cycleSubmittedAt",j.cycle_seconds as "cycleSeconds", r.id is not null as "requestExists"
    from leave_reporting_private.request_journal j left join public.leave_requests r on r.id=j.request_id
    where (j.before_state->>'year')::integer=p_year or (j.after_state->>'year')::integer=p_year
    order by j.id limit 20000
  ) item;
  -- New status logs duplicate the journal's events, so keep only pre-capture
  -- legacy logs in their separately labelled section. Completeness stays strict.
  v_base:=jsonb_set(v_base,'{events}',coalesce((select jsonb_agg(event) from jsonb_array_elements(v_base->'events') event
    where (event->>'createdAt')::timestamptz<v_started),'[]'::jsonb));
  select coalesce(jsonb_agg(year order by year desc),'[]'::jsonb) into v_years from (
    select value::integer as year from jsonb_array_elements_text(v_base->'availableYears') value
    union select (before_state->>'year')::integer from leave_reporting_private.request_journal where before_state->>'year' is not null
    union select (after_state->>'year')::integer from leave_reporting_private.request_journal where after_state->>'year' is not null
  ) years;
  return v_base || jsonb_build_object('journalStartedAt',v_started,'journalEvents',v_events,
    'journalTotal',v_total,'journalComplete',v_total=jsonb_array_length(v_events),'availableYears',v_years);
end;
$$;
revoke all on function public.get_leave_report_snapshot(integer) from public,anon;
grant execute on function public.get_leave_report_snapshot(integer) to authenticated;
