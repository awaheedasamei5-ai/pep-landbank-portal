-- Durable device reminders for invited Operations meetings.
-- Meetings remain separate from the op_todos task queue so their lifecycle and
-- invited staff recipients can be validated independently by the worker.

create table if not exists public.op_meeting_push_outbox (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.schedule_items(id) on delete cascade,
  event_kind text not null default 'meeting_reminder'
    check (event_kind = 'meeting_reminder'),
  meeting_signature text not null,
  recipient_key text not null,
  meeting_title text not null,
  meeting_date date not null,
  meeting_start_time time without time zone not null,
  meeting_end_time time without time zone,
  meeting_location text,
  scheduled_for timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'retry', 'failed', 'blocked', 'unsubscribed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  accepted_devices integer not null default 0 check (accepted_devices >= 0),
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (meeting_id, recipient_key, event_kind, meeting_signature)
);

create index if not exists op_meeting_push_outbox_due_idx
  on public.op_meeting_push_outbox (next_attempt_at, scheduled_for)
  where status in ('queued', 'retry');
create index if not exists op_meeting_push_outbox_meeting_idx
  on public.op_meeting_push_outbox (meeting_id, status);

alter table public.op_meeting_push_outbox enable row level security;
revoke all on public.op_meeting_push_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.op_meeting_push_outbox to service_role;

create or replace function public.sync_op_meeting_push_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_reminder timestamptz;
  v_signature text;
begin
  if tg_op = 'DELETE' then
    update public.op_meeting_push_outbox
    set status = 'cancelled', lease_until = null, updated_at = v_now,
        last_error_code = 'meeting_deleted'
    where meeting_id = old.id and status in ('queued', 'retry', 'sending');
    return old;
  end if;

  if new.kind <> 'meeting' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.status is not distinct from old.status
     and new.item_date is not distinct from old.item_date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.meeting_location is not distinct from old.meeting_location then
    return new;
  end if;

  update public.op_meeting_push_outbox
  set status = 'cancelled', lease_until = null, updated_at = v_now,
      last_error_code = 'meeting_changed'
  where meeting_id = new.id and status in ('queued', 'retry', 'sending');

  if new.status <> 'open' or new.item_date is null or new.start_time is null then
    return new;
  end if;

  v_start := ((new.item_date + new.start_time) at time zone 'Africa/Accra');
  if v_start <= v_now then
    return new;
  end if;
  -- Queue one reminder per active invitee; deliver only to opted-in devices.
  -- If the meeting is scheduled within 15 minutes, the reminder is sent now.
  v_reminder := greatest(v_start - interval '15 minutes', v_now);
  v_signature := md5(concat_ws(chr(31), new.title, new.status, new.item_date::text,
    new.start_time::text, coalesce(new.end_time::text, ''),
    coalesce(new.meeting_location, '')));

  insert into public.op_meeting_push_outbox (
    meeting_id, meeting_signature, recipient_key, meeting_title,
    meeting_date, meeting_start_time, meeting_end_time, meeting_location,
    scheduled_for, next_attempt_at
  )
  select new.id, v_signature, invitee.staff_key, left(new.title, 160),
         new.item_date, new.start_time, new.end_time, new.meeting_location,
         v_reminder, v_reminder
  from public.schedule_item_invitees invitee
  where invitee.schedule_item_id = new.id
    and invitee.status in ('invited', 'accepted')
  on conflict (meeting_id, recipient_key, event_kind, meeting_signature) do update
    set meeting_title = excluded.meeting_title,
        scheduled_for = excluded.scheduled_for,
        next_attempt_at = excluded.next_attempt_at,
        status = 'queued', attempt_count = 0, lease_until = null,
        accepted_devices = 0, last_error_code = null, updated_at = v_now
    where public.op_meeting_push_outbox.status in ('cancelled', 'failed', 'blocked', 'unsubscribed');

  return new;
end;
$$;

create or replace function public.sync_op_meeting_push_from_invitee()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_meeting public.schedule_items%rowtype;
  v_start timestamptz;
  v_reminder timestamptz;
  v_signature text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.staff_key is not distinct from old.staff_key then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    update public.op_meeting_push_outbox
    set status = 'cancelled', lease_until = null, updated_at = v_now,
        last_error_code = 'invitation_changed'
    where meeting_id = old.schedule_item_id and recipient_key = old.staff_key
      and status in ('queued', 'retry', 'sending');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.status not in ('invited', 'accepted') then
    return new;
  end if;

  select item.* into v_meeting
  from public.schedule_items item
  where item.id = new.schedule_item_id and item.kind = 'meeting' and item.status = 'open';
  if not found or v_meeting.item_date is null or v_meeting.start_time is null then
    return new;
  end if;

  v_start := ((v_meeting.item_date + v_meeting.start_time) at time zone 'Africa/Accra');
  if v_start <= v_now then
    return new;
  end if;
  v_reminder := greatest(v_start - interval '15 minutes', v_now);
  v_signature := md5(concat_ws(chr(31), v_meeting.title, v_meeting.status,
    v_meeting.item_date::text, v_meeting.start_time::text,
    coalesce(v_meeting.end_time::text, ''), coalesce(v_meeting.meeting_location, '')));

  insert into public.op_meeting_push_outbox (
    meeting_id, meeting_signature, recipient_key, meeting_title,
    meeting_date, meeting_start_time, meeting_end_time, meeting_location,
    scheduled_for, next_attempt_at
  ) values (
    v_meeting.id, v_signature, new.staff_key, left(v_meeting.title, 160),
    v_meeting.item_date, v_meeting.start_time, v_meeting.end_time, v_meeting.meeting_location,
    v_reminder, v_reminder
  )
  on conflict (meeting_id, recipient_key, event_kind, meeting_signature) do update
    set meeting_title = excluded.meeting_title,
        scheduled_for = excluded.scheduled_for,
        next_attempt_at = excluded.next_attempt_at,
        status = 'queued', attempt_count = 0, lease_until = null,
        accepted_devices = 0, last_error_code = null, updated_at = v_now
    where public.op_meeting_push_outbox.status in ('cancelled', 'failed', 'blocked', 'unsubscribed');

  return new;
end;
$$;

revoke all on function public.sync_op_meeting_push_from_item() from public, anon, authenticated;
revoke all on function public.sync_op_meeting_push_from_invitee() from public, anon, authenticated;

drop trigger if exists sync_op_meeting_push_from_item on public.schedule_items;
create trigger sync_op_meeting_push_from_item
  after insert or update of title, status, item_date, start_time, end_time, meeting_location or delete
  on public.schedule_items
  for each row execute function public.sync_op_meeting_push_from_item();

drop trigger if exists sync_op_meeting_push_from_invitee on public.schedule_item_invitees;
create trigger sync_op_meeting_push_from_invitee
  after insert or update of status, staff_key or delete
  on public.schedule_item_invitees
  for each row execute function public.sync_op_meeting_push_from_invitee();

-- Backfill future invites only; no past meeting reminder is replayed.
with future_meetings as (
  select item.*,
         ((item.item_date + item.start_time) at time zone 'Africa/Accra') as starts_at,
         md5(concat_ws(chr(31), item.title, item.status, item.item_date::text,
           item.start_time::text, coalesce(item.end_time::text, ''),
           coalesce(item.meeting_location, ''))) as meeting_signature
  from public.schedule_items item
  where item.kind = 'meeting' and item.status = 'open'
    and item.item_date is not null and item.start_time is not null
)
insert into public.op_meeting_push_outbox (
  meeting_id, meeting_signature, recipient_key, meeting_title,
  meeting_date, meeting_start_time, meeting_end_time, meeting_location,
  scheduled_for, next_attempt_at
)
select meeting.id, meeting.meeting_signature, invitee.staff_key,
       left(meeting.title, 160), meeting.item_date, meeting.start_time,
       meeting.end_time, meeting.meeting_location,
       greatest(meeting.starts_at - interval '15 minutes', clock_timestamp()),
       greatest(meeting.starts_at - interval '15 minutes', clock_timestamp())
from future_meetings meeting
join public.schedule_item_invitees invitee on invitee.schedule_item_id = meeting.id
where meeting.starts_at > clock_timestamp()

  and invitee.status in ('invited', 'accepted')
on conflict (meeting_id, recipient_key, event_kind, meeting_signature) do nothing;

create or replace function public.claim_op_meeting_push_outbox(p_limit integer default 30)
returns setof public.op_meeting_push_outbox
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update public.op_meeting_push_outbox event
  set status = case when event.attempt_count < 5 then 'retry' else 'failed' end,
      next_attempt_at = clock_timestamp(), lease_until = null,
      last_error_code = 'worker_lease_expired', updated_at = clock_timestamp()
  where event.status = 'sending' and event.lease_until < clock_timestamp();

  return query
  with candidates as (
    select event.id
    from public.op_meeting_push_outbox event
    where event.status in ('queued', 'retry')
      and event.scheduled_for <= clock_timestamp()
      and event.next_attempt_at <= clock_timestamp()
    order by event.scheduled_for, event.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  )
  update public.op_meeting_push_outbox event
  set status = 'sending', attempt_count = event.attempt_count + 1,
      lease_until = clock_timestamp() + interval '2 minutes', updated_at = clock_timestamp()
  from candidates
  where event.id = candidates.id
  returning event.*;
end;
$$;

create or replace function public.finish_op_meeting_push_delivery(
  p_id uuid,
  p_attempt_count integer,
  p_outcome text,
  p_accepted_devices integer default 0,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_status text;
  v_next_attempt timestamptz := clock_timestamp() + make_interval(secs => least(21600, 60 * power(2, greatest(p_attempt_count, 0))::integer));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_outcome = 'sent' then v_status := 'sent';
  elsif p_outcome = 'cancelled' then v_status := 'cancelled';
  elsif p_outcome = 'unsubscribed' then v_status := 'unsubscribed';
  elsif p_outcome = 'blocked' then v_status := 'blocked';
  elsif p_outcome = 'retry' and p_attempt_count < 5 then v_status := 'retry';
  else v_status := 'failed';
  end if;

  update public.op_meeting_push_outbox
  set status = v_status,
      accepted_devices = greatest(0, coalesce(p_accepted_devices, 0)),
      last_error_code = left(nullif(p_error_code, ''), 80),
      next_attempt_at = case when v_status = 'retry' then v_next_attempt else next_attempt_at end,
      lease_until = null,
      updated_at = clock_timestamp()
  where id = p_id and status = 'sending' and attempt_count = p_attempt_count;

  return found;
end;
$$;

revoke all on function public.claim_op_meeting_push_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_op_meeting_push_delivery(uuid, integer, text, integer, text) from public, anon, authenticated;
grant execute on function public.claim_op_meeting_push_outbox(integer) to service_role;
grant execute on function public.finish_op_meeting_push_delivery(uuid, integer, text, integer, text) to service_role;

comment on table public.op_meeting_push_outbox is
  'Private durable queue for one Operations meeting reminder per invited staff member, scheduled 15 minutes before start and delivered only to opted-in devices.';

