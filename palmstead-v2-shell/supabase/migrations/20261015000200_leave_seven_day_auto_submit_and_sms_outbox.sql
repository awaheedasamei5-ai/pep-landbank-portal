-- Automatically move planned annual leave into Management's queue seven
-- calendar days before its first date, and deliver SMS through a durable
-- retryable outbox. Deploy process-leave-sms-outbox before applying this
-- migration so the scheduled dispatcher always has a receiver.

alter table public.leave_requests
  add column if not exists auto_submitted_at timestamptz;

create or replace function public.log_leave_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.leave_request_logs (request_id, actor_key, from_status, to_status, note)
    values (new.id, public.my_key(), null, new.status, null);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.leave_request_logs (request_id, actor_key, from_status, to_status, note)
    values (
      new.id,
      case
        when new.auto_submitted_at is not null and old.auto_submitted_at is null then null
        else public.my_key()
      end,
      old.status,
      new.status,
      case when old.status = 'rescheduled' and new.status = 'pending'
        then 'Staff submitted replacement dates for a new decision.' else new.reschedule_note end
    );
  end if;
  return new;
end;
$$;

create table if not exists public.leave_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  event_key text not null,
  recipient_key text,
  recipient_phone text,
  message_body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'accepted', 'failed', 'needs_review')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  provider_reference text,
  provider_status jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  provider_accepted_at timestamptz,
  constraint leave_sms_outbox_event_phone_unique unique (event_key, recipient_phone)
);

alter table public.leave_sms_outbox enable row level security;
revoke all on public.leave_sms_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.leave_sms_outbox to service_role;

create index if not exists leave_sms_outbox_due_idx
  on public.leave_sms_outbox (next_attempt_at, created_at)
  where status in ('queued', 'sending');

create or replace function public.leave_sms_canonical_ghana_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(digits) = 10 and left(digits, 1) = '0' then
    return '+233' || substr(digits, 2);
  elsif length(digits) = 12 and left(digits, 3) = '233' then
    return '+' || digits;
  elsif length(digits) = 9 then
    return '+233' || digits;
  end if;
  return null;
end;
$$;

create or replace function public.enqueue_leave_sms(
  p_request_id uuid, p_event_key text, p_recipient_key text, p_phone text, p_message text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_phone text := public.leave_sms_canonical_ghana_phone(p_phone);
begin
  insert into public.leave_sms_outbox (request_id, event_key, recipient_key, recipient_phone, message_body, status, last_error)
  values (p_request_id, p_event_key, p_recipient_key, v_phone, p_message,
    case when v_phone is null then 'failed' else 'queued' end,
    case when v_phone is null then 'The staff bio data has no valid Ghana phone number.' else null end)
  on conflict (event_key, recipient_phone) do nothing;
end;
$$;
revoke all on function public.enqueue_leave_sms(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.queue_leave_transition_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_recipient record;
  v_event_key text := 'transition:' || gen_random_uuid()::text;
  v_sms_body text;
  v_inapp_body text;
  v_kind text;
  v_first date;
  v_last date;
  v_actor text := coalesce(public.my_key(), 'system');
  v_actor_name text;
begin
  if new.status = 'planned' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status and new.dates is not distinct from old.dates then return new; end if;
    -- Seven-day promotion supplies its own Staff + Management reminder.
    if new.auto_submitted_at is not null and old.auto_submitted_at is null then return new; end if;
  end if;
  select min(value::date), max(value::date) into v_first, v_last from jsonb_array_elements_text(new.dates);
  select name into v_actor_name from public.profiles where agent_key = v_actor limit 1;
  v_actor_name := coalesce(v_actor_name, 'Palmstead Leave');
  v_kind := 'leave_' || new.status;
  if new.status = 'pending' then
    v_sms_body := new.agent_name || ' submitted ' || case when new.is_emergency then 'an emergency' else 'a' end
      || ' leave request for ' || new.days_count || ' working day(s), starting '
      || to_char(v_first, 'DD Mon YYYY') || '. Open Palmstead > Leave to review the letter.';
  elsif new.status = 'approved' then
    v_sms_body := 'Your leave has been approved for ' || new.days_count || ' working day(s). First date: '
      || to_char(v_first, 'DD Mon YYYY') || '; last date: ' || to_char(v_last, 'DD Mon YYYY')
      || '. Open Palmstead > Leave for the approved schedule and letter.';
  elsif new.status = 'rescheduled' then
    v_sms_body := 'Management has asked you to choose replacement dates for your leave. Your '
      || new.days_count || ' reserved day(s) are retained. Open Palmstead > Leave to read the message and respond.';
  elsif new.status = 'declined' then
    v_sms_body := 'Management has declined your leave request. Open Palmstead > Leave to read the decision.';
  else return new;
  end if;
  v_inapp_body := v_sms_body;
  if new.status <> 'pending' and nullif(btrim(new.reschedule_note), '') is not null then
    v_inapp_body := v_inapp_body || E'\n\nManagement note: ' || new.reschedule_note;
  end if;
  for v_recipient in
    select profile.agent_key, profile.phone
    from public.profiles profile
    where profile.active = true and profile.agent_key is not null
      and ((new.status = 'pending' and profile.role = 'manager' and profile.agent_key <> new.agent_key)
        or (new.status <> 'pending' and profile.agent_key = new.agent_key))
  loop
    insert into public.messages (sender_key, sender_name, recipient_key, body, kind, ref_type, ref_id)
    values (v_actor, v_actor_name, v_recipient.agent_key, v_inapp_body, v_kind, 'leave_request', new.id);
    perform public.enqueue_leave_sms(new.id, v_event_key, v_recipient.agent_key, v_recipient.phone, v_sms_body);
  end loop;
  return new;
end;
$$;
revoke all on function public.queue_leave_transition_notifications() from public, anon, authenticated;
drop trigger if exists leave_requests_queue_notification on public.leave_requests;
create trigger leave_requests_queue_notification
  after insert or update on public.leave_requests
  for each row execute function public.queue_leave_transition_notifications();

create or replace function public.promote_due_planned_leave()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_rec record;
  v_manager record;
  v_start date;
  v_staff_message text;
  v_management_message text;
  v_count integer := 0;
begin
  for v_rec in
    select request.*,
      (select min((date_text.value)::date)
       from jsonb_array_elements_text(
         case when jsonb_typeof(request.dates) = 'array' then request.dates else '[]'::jsonb end
       ) as date_text(value)
       where date_text.value ~ '^\d{4}-\d{2}-\d{2}$') as first_leave_date
    from public.leave_requests as request
    where request.status = 'planned'
      and request.auto_submitted_at is null
    for update of request skip locked
  loop
    v_start := v_rec.first_leave_date;
    if v_start is null or v_start < v_today or v_start > v_today + 7 then
      continue;
    end if;

    update public.leave_requests
    set status = 'pending', auto_submitted_at = now()
    where id = v_rec.id and status = 'planned';
    if not found then
      continue;
    end if;

    v_staff_message := 'Reminder: your planned leave (' || v_rec.days_count || ' working day(s)) starts on '
      || to_char(v_start, 'FMDay DD Month YYYY')
      || ' and has been sent to Management for review. Open Palmstead > Leave for updates.';
    v_management_message := 'Leave plan due: ' || v_rec.agent_name || '''s leave (' || v_rec.days_count
      || ' working day(s)) starts on ' || to_char(v_start, 'FMDay DD Month YYYY')
      || ' and is waiting in the Management queue. Open Palmstead > Leave to review.';

    insert into public.messages (sender_key, sender_name, recipient_key, body, kind, ref_type, ref_id)
    values ('system', 'Palmstead Leave', v_rec.agent_key, v_staff_message, 'leave_auto_submitted', 'leave_request', v_rec.id);

    for v_manager in
      select profile.agent_key
      from public.profiles as profile
      where profile.role = 'manager' and profile.active = true and profile.agent_key is not null
        and profile.agent_key <> v_rec.agent_key
    loop
      insert into public.messages (sender_key, sender_name, recipient_key, body, kind, ref_type, ref_id)
      values ('system', 'Palmstead Leave', v_manager.agent_key, v_management_message, 'leave_auto_submitted', 'leave_request', v_rec.id);
    end loop;

    perform public.enqueue_leave_sms(v_rec.id, 'auto-submit:' || v_rec.id::text, v_rec.agent_key,
      (select profile.phone from public.profiles as profile where profile.agent_key = v_rec.agent_key limit 1),
      v_staff_message
    );

    for v_manager in
      select profile.agent_key, profile.phone from public.profiles as profile
      where profile.role = 'manager' and profile.active = true and profile.agent_key is not null
        and profile.agent_key <> v_rec.agent_key
    loop
      perform public.enqueue_leave_sms(v_rec.id, 'auto-submit:' || v_rec.id::text, v_manager.agent_key, v_manager.phone, v_management_message);
    end loop;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.claim_leave_sms_outbox(p_limit integer default 10)
returns setof public.leave_sms_outbox
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  update public.leave_sms_outbox
  set status = 'needs_review', last_error = 'Worker stopped before recording the provider outcome. Check the provider history before retrying.', lease_until = null
  where status = 'sending' and lease_until < now();

  return query
  with candidates as (
    select id
    from public.leave_sms_outbox
    where attempt_count < 5
      and next_attempt_at <= now()
      and status = 'queued'
    order by next_attempt_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  )
  update public.leave_sms_outbox as outbox
  set status = 'sending', attempt_count = outbox.attempt_count + 1, lease_until = now() + interval '5 minutes'
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.verify_leave_sms_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select p_token is not null
    and p_token = (select decrypted_secret from vault.decrypted_secrets where name = 'leave_sms_worker_token' limit 1)
$$;

revoke all on function public.promote_due_planned_leave() from public, anon, authenticated;
revoke all on function public.claim_leave_sms_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_leave_sms_outbox(integer) to service_role;
revoke all on function public.verify_leave_sms_worker_token(text) from public, anon, authenticated;
grant execute on function public.verify_leave_sms_worker_token(text) to service_role;
revoke all on function public.leave_sms_canonical_ghana_phone(text) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'leave_sms_worker_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'leave_sms_worker_token', 'Internal token used only by the scheduled Leave SMS outbox worker');
  end if;
end;
$$;

create or replace function public.dispatch_leave_reminders()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
set row_security = off
as $$
declare
  v_token text;
begin
  perform public.promote_due_planned_leave();
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'leave_sms_worker_token' limit 1;
  if v_token is null then
    raise exception 'Leave SMS worker token is not configured.';
  end if;

  perform net.http_post(
    url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/process-leave-sms-outbox',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_token),
    body := jsonb_build_object('source', 'scheduled_leave_reminders')
  );
end;
$$;

revoke all on function public.dispatch_leave_reminders() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'leave_auto_submit_and_sms_outbox' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule('leave_auto_submit_and_sms_outbox', '*/15 * * * *', 'select public.dispatch_leave_reminders();');
end;
$$;
