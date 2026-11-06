-- SMS engine rebuild Phase B, item 1 continued: refactor the real
-- plpgsql-only senders (site-visit reminders, leave transitions) to read
-- from sms_templates via render_sms_template(), keeping each function's
-- own hardcoded text as the fallback so a missing/deleted template row
-- never breaks a real send.

create or replace function public.send_site_visit_reminders()
returns void
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_rec record;
  v_msg text;
  v_advance_template text;
  v_today_template text;
  v_time_line text;
  v_pickup_line text;
begin
  select body_template into v_advance_template from public.sms_templates where kind = 'site_visit_reminder_advance';
  select body_template into v_today_template from public.sms_templates where kind = 'site_visit_reminder_today';

  for v_rec in
    select id, name, contact, visit_date, visit_time, pickup, site
    from site_visits
    where deleted_at is null
      and advance_reminder_sent_at is null
      and visit_date = (current_date + 1)
      and contact is not null and contact <> ''
  loop
    v_time_line := case when v_rec.visit_time is not null and v_rec.visit_time <> '' then ' at ' || v_rec.visit_time else '' end;
    v_pickup_line := case when v_rec.pickup is not null and v_rec.pickup <> '' then '. We''ll pick you up at ' || v_rec.pickup else '' end;
    v_msg := public.render_sms_template(
      coalesce(v_advance_template, 'Hi {name}, a reminder that your site visit to {site} is tomorrow ({dateLabel}){timeLine}{pickupLine}. See you then! - Trulander JSF'),
      jsonb_build_object(
        'name', coalesce(v_rec.name, ''),
        'site', coalesce(v_rec.site, 'Royal Palm Enclave'),
        'dateLabel', to_char(v_rec.visit_date, 'FMDay DD Month YYYY'),
        'timeLine', v_time_line,
        'pickupLine', v_pickup_line
      )
    );
    perform net.http_post(
      url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/send-sms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNieWR6cmx6cXhjZGJ1ZGphdWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTkzNTUsImV4cCI6MjEwMjgzNTM1NX0.U7GhSbd6wwByi3_cDC_6Sb0GeqPH927VFxBVtE-ojoE'
      ),
      body := jsonb_build_object('to', v_rec.contact, 'message', v_msg, 'sender', 'Palmstead')
    );
    update site_visits set advance_reminder_sent_at = now() where id = v_rec.id;
  end loop;

  for v_rec in
    select id, name, contact, visit_date, visit_time, pickup, site
    from site_visits
    where deleted_at is null
      and final_reminder_sent_at is null
      and visit_date = current_date
      and contact is not null and contact <> ''
  loop
    v_time_line := case when v_rec.visit_time is not null and v_rec.visit_time <> '' then ' at ' || v_rec.visit_time else '' end;
    v_pickup_line := case when v_rec.pickup is not null and v_rec.pickup <> '' then '. We''ll pick you up at ' || v_rec.pickup else '' end;
    v_msg := public.render_sms_template(
      coalesce(v_today_template, 'Hi {name}, this is a reminder that your site visit to {site} is TODAY{timeLine}{pickupLine}. We look forward to seeing you! - Trulander JSF'),
      jsonb_build_object(
        'name', coalesce(v_rec.name, ''),
        'site', coalesce(v_rec.site, 'Royal Palm Enclave'),
        'timeLine', v_time_line,
        'pickupLine', v_pickup_line
      )
    );
    perform net.http_post(
      url := 'https://sbydzrlzqxcdbudjaube.supabase.co/functions/v1/send-sms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNieWR6cmx6cXhjZGJ1ZGphdWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTkzNTUsImV4cCI6MjEwMjgzNTM1NX0.U7GhSbd6wwByi3_cDC_6Sb0GeqPH927VFxBVtE-ojoE'
      ),
      body := jsonb_build_object('to', v_rec.contact, 'message', v_msg, 'sender', 'Palmstead')
    );
    update site_visits set final_reminder_sent_at = now() where id = v_rec.id;
  end loop;
end;
$function$;

-- Leave transitions: pending/approved/rescheduled/declined now read their
-- base wording from sms_templates. promote_due_planned_leave()'s 2
-- auto-submit messages are NOT touched here -- a documented, deliberate
-- scope cut for this pass (docs/plans/48).
create or replace function public.queue_leave_transition_notifications()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
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
  v_template text;
begin
  if new.status = 'planned' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status and new.dates is not distinct from old.dates then return new; end if;
    if new.auto_submitted_at is not null and old.auto_submitted_at is null then return new; end if;
  end if;
  select min(value::date), max(value::date) into v_first, v_last from jsonb_array_elements_text(new.dates);
  select name into v_actor_name from public.profiles where agent_key = v_actor limit 1;
  v_actor_name := coalesce(v_actor_name, 'Palmstead Leave');
  v_kind := 'leave_' || new.status;
  if new.status = 'pending' then
    select body_template into v_template from public.sms_templates where kind = 'leave_request_submitted';
    v_sms_body := public.render_sms_template(
      coalesce(v_template, '{agentName} submitted {emergencyWord} leave request for {days} working day(s), starting {startDate}. Open Palmstead > Leave to review the letter.'),
      jsonb_build_object(
        'agentName', new.agent_name,
        'emergencyWord', case when new.is_emergency then 'an emergency' else 'a' end,
        'days', new.days_count,
        'startDate', to_char(v_first, 'DD Mon YYYY')
      )
    );
  elsif new.status = 'approved' then
    select body_template into v_template from public.sms_templates where kind = 'leave_request_approved';
    v_sms_body := public.render_sms_template(
      coalesce(v_template, 'Your leave has been approved for {days} working day(s). First date: {startDate}; last date: {endDate}. Open Palmstead > Leave for the approved schedule and letter.'),
      jsonb_build_object('days', new.days_count, 'startDate', to_char(v_first, 'DD Mon YYYY'), 'endDate', to_char(v_last, 'DD Mon YYYY'))
    );
  elsif new.status = 'rescheduled' then
    select body_template into v_template from public.sms_templates where kind = 'leave_request_rescheduled';
    v_sms_body := public.render_sms_template(
      coalesce(v_template, 'Management has asked you to choose replacement dates for your leave. Your {days} reserved day(s) are retained. Open Palmstead > Leave to read the message and respond.'),
      jsonb_build_object('days', new.days_count)
    );
  elsif new.status = 'declined' then
    select body_template into v_template from public.sms_templates where kind = 'leave_request_declined';
    v_sms_body := coalesce(v_template, 'Management has declined your leave request. Open Palmstead > Leave to read the decision.');
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
$function$;
