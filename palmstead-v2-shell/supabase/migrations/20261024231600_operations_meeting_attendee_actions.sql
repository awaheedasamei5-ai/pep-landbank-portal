create schema if not exists app_schedule_private;
revoke all on schema app_schedule_private from public, anon;
grant usage on schema app_schedule_private to authenticated;

create or replace function app_schedule_private.create_meeting(
  p_title text,
  p_description text,
  p_item_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_location text,
  p_invitee_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_meeting public.schedule_items%rowtype;
  v_keys text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in to schedule a meeting.' using errcode = '28000';
  end if;

  select p.* into v_actor
  from public.profiles p
  where p.id = auth.uid() and p.active is true;
  if not found or v_actor.agent_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.array_agg(distinct requested.staff_key order by requested.staff_key), array[]::text[])
  into v_keys
  from pg_catalog.unnest(coalesce(p_invitee_keys, array[]::text[])) as requested(staff_key);

  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) not between 1 and 160 then
    raise exception 'Meeting title must be between 1 and 160 characters.' using errcode = '22023';
  end if;
  if p_description is not null and pg_catalog.length(p_description) > 8000 then
    raise exception 'Meeting notes must be 8,000 characters or fewer.' using errcode = '22023';
  end if;
  if p_location is not null and pg_catalog.length(p_location) > 500 then
    raise exception 'Meeting location must be 500 characters or fewer.' using errcode = '22023';
  end if;
  if p_item_date is null or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Choose a date and an end time after the start time.' using errcode = '22023';
  end if;
  if (p_item_date + p_start_time) at time zone 'Africa/Accra' <= pg_catalog.now() then
    raise exception 'A meeting must start in the future.' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(v_keys) > 100 then
    raise exception 'A meeting can have up to 100 staff invitees.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_keys) as requested(staff_key)
    where requested.staff_key is null or requested.staff_key = ''
  ) then
    raise exception 'The invitee list contains an invalid staff key.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_keys) as requested(staff_key)
    where requested.staff_key <> v_actor.agent_key
      and not exists (
        select 1 from public.profiles p
        where p.agent_key = requested.staff_key and p.active is true
      )
  ) then
    raise exception 'Every invitee must be an active Palmstead staff member.' using errcode = '22023';
  end if;

  insert into public.schedule_items (
    kind, owner_key, owner_name, assigned_to, assigned_to_name, assigned_by, assigned_by_name,
    title, description, item_date, start_time, end_time, meeting_location, status
  ) values (
    'meeting', v_actor.agent_key, v_actor.name, v_actor.agent_key, v_actor.name,
    v_actor.agent_key, v_actor.name, pg_catalog.btrim(p_title),
    nullif(pg_catalog.btrim(coalesce(p_description, '')), ''), p_item_date,
    p_start_time, p_end_time, nullif(pg_catalog.btrim(coalesce(p_location, '')), ''), 'open'
  ) returning * into v_meeting;

  insert into public.schedule_item_invitees(schedule_item_id, staff_key, staff_name)
  select v_meeting.id, p.agent_key, p.name
  from public.profiles p
  where p.active is true
    and p.agent_key <> v_actor.agent_key
    and p.agent_key = any(v_keys)
  on conflict (schedule_item_id, staff_key) do nothing;

  insert into public.task_events(task_id, type, actor_key, actor_name, note)
  values (v_meeting.id, 'created', v_actor.agent_key, v_actor.name, 'Scheduled meeting and sent in-app invitations.');

  return pg_catalog.jsonb_build_object('meeting_id', v_meeting.id, 'invitee_count', (
    select count(*) from public.schedule_item_invitees i where i.schedule_item_id = v_meeting.id
  ));
end;
$$;

create or replace function app_schedule_private.replace_meeting_invitees(
  p_schedule_item_id uuid,
  p_invitee_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_meeting public.schedule_items%rowtype;
  v_keys text[];
  v_added integer := 0;
  v_removed integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update meeting invitees.' using errcode = '28000';
  end if;

  select p.* into v_actor
  from public.profiles p
  where p.id = auth.uid() and p.active is true;
  if not found or v_actor.agent_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.array_agg(distinct requested.staff_key order by requested.staff_key), array[]::text[])
  into v_keys
  from pg_catalog.unnest(coalesce(p_invitee_keys, array[]::text[])) as requested(staff_key);

  select si.* into v_meeting
  from public.schedule_items si
  where si.id = p_schedule_item_id and si.kind = 'meeting'
  for update;
  if not found then
    raise exception 'Meeting not found.' using errcode = 'P0002';
  end if;
  if v_actor.role <> 'manager' and v_actor.agent_key <> v_meeting.owner_key then
    raise exception 'Only the meeting organizer or management can change invitees.' using errcode = '42501';
  end if;
  if v_meeting.status = 'cancelled' then
    raise exception 'Cancelled meetings cannot change invitees.' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(v_keys) > 100 then
    raise exception 'A meeting can have up to 100 staff invitees.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_keys) as requested(staff_key)
    where requested.staff_key is null or requested.staff_key = ''
  ) then
    raise exception 'The invitee list contains an invalid staff key.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_keys) as requested(staff_key)
    where requested.staff_key <> v_meeting.owner_key
      and not exists (
        select 1 from public.profiles p
        where p.agent_key = requested.staff_key and p.active is true
      )
      and not exists (
        select 1 from public.schedule_item_invitees existing
        where existing.schedule_item_id = v_meeting.id and existing.staff_key = requested.staff_key
      )
  ) then
    raise exception 'Every invitee must be an active Palmstead staff member.' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer into v_removed
  from public.schedule_item_invitees i
  where i.schedule_item_id = v_meeting.id
    and not (i.staff_key = any(v_keys));

  select pg_catalog.count(*)::integer into v_added
  from pg_catalog.unnest(v_keys) as requested(staff_key)
  where requested.staff_key <> v_meeting.owner_key
    and not exists (
      select 1 from public.schedule_item_invitees i
      where i.schedule_item_id = v_meeting.id and i.staff_key = requested.staff_key
    );

  delete from public.schedule_item_invitees i
  where i.schedule_item_id = v_meeting.id
    and not (i.staff_key = any(v_keys));

  insert into public.schedule_item_invitees(schedule_item_id, staff_key, staff_name)
  select v_meeting.id, p.agent_key, p.name
  from public.profiles p
  where p.active is true
    and p.agent_key <> v_meeting.owner_key
    and p.agent_key = any(v_keys)
  on conflict (schedule_item_id, staff_key) do nothing;

  if v_added > 0 or v_removed > 0 then
    insert into public.task_events(task_id, type, actor_key, actor_name, note)
    values (
      v_meeting.id, 'invitees_updated', v_actor.agent_key, v_actor.name,
      'Updated in-app invitations: ' || v_added::text || ' added, ' || v_removed::text || ' removed.'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'added', v_added,
    'removed', v_removed,
    'invitee_count', (select count(*) from public.schedule_item_invitees i where i.schedule_item_id = v_meeting.id)
  );
end;
$$;

create or replace function public.create_schedule_meeting(
  p_title text,
  p_description text,
  p_item_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_location text,
  p_invitee_keys text[]
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_schedule_private.create_meeting(
    p_title, p_description, p_item_date, p_start_time, p_end_time, p_location, p_invitee_keys
  )
$$;

create or replace function public.replace_schedule_meeting_invitees(
  p_schedule_item_id uuid,
  p_invitee_keys text[]
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_schedule_private.replace_meeting_invitees(p_schedule_item_id, p_invitee_keys)
$$;

revoke all on function app_schedule_private.create_meeting(text,text,date,time without time zone,time without time zone,text,text[]) from public, anon;
revoke all on function app_schedule_private.replace_meeting_invitees(uuid,text[]) from public, anon;
grant execute on function app_schedule_private.create_meeting(text,text,date,time without time zone,time without time zone,text,text[]) to authenticated;
grant execute on function app_schedule_private.replace_meeting_invitees(uuid,text[]) to authenticated;

revoke all on function public.create_schedule_meeting(text,text,date,time without time zone,time without time zone,text,text[]) from public, anon;
revoke all on function public.replace_schedule_meeting_invitees(uuid,text[]) from public, anon;
grant execute on function public.create_schedule_meeting(text,text,date,time without time zone,time without time zone,text,text[]) to authenticated;
grant execute on function public.replace_schedule_meeting_invitees(uuid,text[]) to authenticated;

drop policy if exists schedule_item_invitees_ins on public.schedule_item_invitees;
drop policy if exists schedule_item_invitees_upd on public.schedule_item_invitees;
drop policy if exists schedule_item_invitees_del on public.schedule_item_invitees;
revoke all privileges on table public.schedule_item_invitees from public, anon, authenticated;
grant select on table public.schedule_item_invitees to authenticated;

