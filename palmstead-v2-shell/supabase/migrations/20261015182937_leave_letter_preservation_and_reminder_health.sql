-- Keep submitted applicant wording separate from later schedule decisions.
create or replace function public.preserve_submitted_leave_letter()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if current_user not in ('postgres', 'service_role')
     and old.status <> 'planned' and new.letter_text is distinct from old.letter_text then
    raise exception 'The submitted letter is retained as written. Update the schedule separately.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_submitted_leave_letter() from public, anon, authenticated;
create trigger preserve_submitted_leave_letter before update on public.leave_requests
for each row execute function public.preserve_submitted_leave_letter();

alter table public.leave_sms_outbox add column last_retry_by text, add column last_retry_at timestamptz;
create index leave_sms_outbox_created_idx on public.leave_sms_outbox (created_at desc);

create or replace function public.get_leave_reminder_health()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp set row_security = off as $$
declare v_counts jsonb; v_messages jsonb; v_scheduler jsonb;
begin
  if auth.uid() is null or public.my_role() is distinct from 'manager' then
    raise exception 'Management access required.' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) into v_counts
  from (select status, count(*) as total from public.leave_sms_outbox group by status) counts;

  select coalesce(jsonb_agg(to_jsonb(item) order by attention_order, created_at desc), '[]'::jsonb)
  into v_messages from (
    select outbox.id, outbox.request_id, coalesce(request.request_no, 'Reference unavailable') as request_no,
      coalesce(profile.name, outbox.recipient_key, 'Former staff member') as recipient_name,
      case when outbox.recipient_phone is null then 'Missing or invalid phone'
        else 'Ending ' || right(outbox.recipient_phone, 4) end as masked_phone,
      outbox.status, outbox.attempt_count, outbox.created_at, outbox.provider_accepted_at,
      outbox.last_error, outbox.last_retry_at,
      case when outbox.status in ('failed', 'needs_review') then 0 when outbox.status in ('queued', 'sending') then 1 else 2 end as attention_order
    from public.leave_sms_outbox outbox
    left join public.leave_requests request on request.id = outbox.request_id
    left join public.profiles profile on profile.agent_key = outbox.recipient_key
    order by attention_order, outbox.created_at desc limit 50
  ) item;

  select jsonb_build_object('active', job.active, 'schedule', job.schedule,
    'last_run_at', run.start_time, 'last_run_status', run.status) into v_scheduler
  from cron.job job left join lateral (
    select start_time, status from cron.job_run_details where jobid = job.jobid order by start_time desc limit 1
  ) run on true where job.jobname = 'leave_auto_submit_and_sms_outbox' limit 1;
  return jsonb_build_object('counts', v_counts, 'messages', v_messages, 'scheduler', v_scheduler);
end;
$$;
revoke all on function public.get_leave_reminder_health() from public, anon;
grant execute on function public.get_leave_reminder_health() to authenticated;

create or replace function public.retry_failed_leave_sms(p_message_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp set row_security = off as $$
declare v_message public.leave_sms_outbox; v_phone text;
begin
  if auth.uid() is null or public.my_role() is distinct from 'manager' then
    raise exception 'Management access required.' using errcode = '42501';
  end if;
  select * into v_message from public.leave_sms_outbox where id = p_message_id for update;
  if not found or v_message.status <> 'failed' then
    raise exception 'Only a definitively failed text can be queued again. Accepted or uncertain sends cannot be retried here.' using errcode = '23514';
  end if;
  select public.leave_sms_canonical_ghana_phone(profile.phone) into v_phone from public.profiles profile
    where profile.agent_key = v_message.recipient_key and profile.active = true limit 1;
  if v_phone is null then
    raise exception 'Update the recipient phone number in their bio data before retrying.' using errcode = '23514';
  end if;
  update public.leave_sms_outbox set status = 'queued', recipient_phone = v_phone,
    attempt_count = 0, next_attempt_at = now(), lease_until = null,
    last_error = null, provider_reference = null, provider_status = null,
    last_retry_by = public.my_key(), last_retry_at = now()
  where id = p_message_id;
end;
$$;
revoke all on function public.retry_failed_leave_sms(uuid) from public, anon;
grant execute on function public.retry_failed_leave_sms(uuid) to authenticated;

-- Trigger functions are internal entrypoints, not public REST RPCs.
revoke all on function public.log_leave_request_status_change() from public, anon, authenticated;
