-- Leaf-first order: SQL-language functions are validated at CREATE time,
-- so any function they call must already exist. plpgsql function bodies
-- aren't validated until first execution, so their relative order doesn't
-- matter, but they're kept after the SQL functions here for clarity.

CREATE OR REPLACE FUNCTION public.my_client_contact_digits()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select right(regexp_replace(client_contact,'[^0-9]','','g'),9) from public.client_portal_access where auth_uid = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.my_client_name()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select lower(trim(client_name)) from public.client_portal_access where auth_uid = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.my_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select agent_key from public.profiles where id = auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select role from public.profiles where id = auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public.email_is_allowed(check_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists (select 1 from public.allowed_emails a where lower(a.email) = lower(check_email)) $function$
;

CREATE OR REPLACE FUNCTION public.task_event_participant(t_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.task_events e
    where e.task_id = t_id
      and (e.actor_key = my_key() or e.from_key = my_key() or e.to_key = my_key())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_memo_cc_recipient(p_memo_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.memo_recipients where memo_id = p_memo_id and staff_key = public.my_key())
$function$
;

CREATE OR REPLACE FUNCTION public.is_memo_sender(p_memo_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.memos where id = p_memo_id and from_key = public.my_key())
$function$
;

CREATE OR REPLACE FUNCTION public.client_portal_search_names(p_query text)
 RETURNS TABLE(name text, contact_masked text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct l.name, 'xxx-xxx-'||right(regexp_replace(l.contact,'[^0-9]','','g'),2)
  from public.leads l
  where l.name ilike '%'||p_query||'%' and length(trim(p_query)) >= 2
  limit 10
$function$
;

CREATE OR REPLACE FUNCTION public.leaderboard_rows(p_from date, p_to date)
 RETURNS TABLE(staff_key text, staff_name text, total_collected numeric, deals_closed_year integer, site_visits integer, tasks_completed integer, avg_task_days numeric, todos_completed integer, days_attended integer, on_time_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with agents as (
    select agent_key as key, name from public.profiles where role = 'agent'
  ),
  collected as (
    select agent_key as key, coalesce(sum(amt_paid),0) as total_collected
    from public.leads group by agent_key
  ),
  deals_year as (
    select agent_key as key, count(*) as deals_closed_year
    from public.leads
    where coalesce(grand_total,0) > 0 and amt_paid >= grand_total
      and date_added between p_from and p_to
    group by agent_key
  ),
  visits_table as (
    select agent_key as key, count(*) as cnt from public.site_visits group by agent_key
  ),
  visits_fallback as (
    select agent_key as key, count(*) as cnt from public.leads where site_visit = 'Yes' group by agent_key
  ),
  tasks90 as (
    select assigned_to as key, count(*) as tasks_completed,
      avg(extract(epoch from (completed_at - created_at))/86400.0) as avg_task_days
    from public.schedule_items
    where kind='task' and status='done' and completed_at >= (now() - interval '90 days')
      and completed_at >= created_at
    group by assigned_to
  ),
  todos90 as (
    select owner_key as key, count(*) as todos_completed
    from public.schedule_items
    where kind='todo' and status='done' and item_date >= (current_date - interval '90 days')
    group by owner_key
  ),
  att90 as (
    select staff_key as key,
      count(*) filter (where sign_in_at is not null) as days_attended,
      count(*) filter (where sign_in_at is not null and to_char(sign_in_at,'HH24:MI') <= coalesce((select attendance_cutoff_time from public.app_config where id=1),'09:00')) as on_time_days
    from public.attendance_log
    where work_date >= (current_date - interval '90 days')
    group by staff_key
  )
  select
    a.key,
    a.name,
    coalesce(c.total_collected,0),
    coalesce(d.deals_closed_year,0)::int,
    (case when coalesce(vt.cnt,0) > 0 then vt.cnt else coalesce(vf.cnt,0) end)::int,
    coalesce(t.tasks_completed,0)::int,
    t.avg_task_days,
    coalesce(td.todos_completed,0)::int,
    coalesce(att.days_attended,0)::int,
    coalesce(att.on_time_days,0)::int
  from agents a
  left join collected c on c.key = a.key
  left join deals_year d on d.key = a.key
  left join visits_table vt on vt.key = a.key
  left join visits_fallback vf on vf.key = a.key
  left join tasks90 t on t.key = a.key
  left join todos90 td on td.key = a.key
  left join att90 att on att.key = a.key;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_referral_conversions(p_from date, p_to date)
 RETURNS TABLE(staff_key text, referral_conversions integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select l.agent_key as staff_key, count(*)::int as referral_conversions
  from public.referrals r
  join public.leads l on l.id = r.referrer_lead_id
  where r.status = 'Cleared'
    and r.cleared_at::date between p_from and p_to
  group by l.agent_key;
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_task(t_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.schedule_items s
    where s.id = t_id
      and (s.owner_key = my_key() or s.assigned_to = my_key() or s.assigned_by = my_key() or my_role() = 'manager')
  ) or public.task_event_participant(t_id);
$function$
;

CREATE OR REPLACE FUNCTION public.check_schedule_conflicts_multi(p_staff_keys text[], p_date date, p_start time without time zone, p_end time without time zone, p_exclude_id uuid)
 RETURNS TABLE(staff_key text, staff_name text, id uuid, title text, start_time time without time zone, end_time time without time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select si.assigned_to, si.assigned_to_name, si.id, si.title, si.start_time, si.end_time
  from schedule_items si
  where si.assigned_to = any(p_staff_keys)
    and si.item_date = p_date
    and si.status not in ('done','cancelled','rescheduled')
    and si.start_time is not null
    and (p_exclude_id is null or si.id <> p_exclude_id)
    and p_start < si.end_time and si.start_time < p_end
$function$
;

-- ============ plpgsql functions (bodies validated on first execution, not CREATE) ============

CREATE OR REPLACE FUNCTION public.clear_referral(p_referral_id uuid, p_points numeric)
 RETURNS referrals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead_id uuid;
  v_amt_paid numeric;
  v_grand_total numeric;
  v_deposit_pct numeric;
  v_row public.referrals;
begin
  if my_role() <> 'manager' and my_key() not in ('elias','emmanuel','elizabeth') then
    raise exception 'Not authorized to clear referrals';
  end if;

  select referred_lead_id into v_lead_id from public.referrals where id = p_referral_id;
  if v_lead_id is null then
    raise exception 'Link this referral to a lead before clearing it';
  end if;

  select amt_paid, grand_total into v_amt_paid, v_grand_total from public.leads where id = v_lead_id;
  if not found then
    raise exception 'Linked lead not found';
  end if;

  v_deposit_pct := case when coalesce(v_grand_total,0) > 0 then coalesce(v_amt_paid,0) / v_grand_total else 0 end;
  if v_deposit_pct < 0.30 then
    raise exception 'Linked lead has only paid % percent of the plot price -- needs at least 30 percent before this referral can be cleared', round(v_deposit_pct*100);
  end if;

  update public.referrals
    set status = 'Cleared', cleared_at = now(), points_awarded = p_points
    where id = p_referral_id
    returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_portal_change_pin(p_new_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_id uuid;
begin
  select id into v_id from public.client_portal_access where auth_uid = auth.uid();
  if v_id is null then raise exception 'not_linked'; end if;
  if p_new_pin !~ '^[0-9]{4,6}$' then raise exception 'invalid_pin'; end if;
  update public.client_portal_access set pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_is_default = false where id = v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_portal_link_auth(p_access_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_current uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select auth_uid into v_current from public.client_portal_access where id = p_access_id;
  if v_current is null then
    update public.client_portal_access set auth_uid = auth.uid() where id = p_access_id;
  elsif v_current <> auth.uid() then
    raise exception 'already_linked';
  end if;
  -- v_current = auth.uid() already: no-op, this is just a repeat login.
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_portal_login(p_name text, p_contact text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_access record;
  v_digits text := right(regexp_replace(p_contact,'[^0-9]','','g'),9);
begin
  if length(v_digits) < 6 then return jsonb_build_object('ok',false,'reason','no_match'); end if;
  select * into v_access from public.client_portal_access
    where lower(trim(client_name)) = lower(trim(p_name))
      and right(regexp_replace(client_contact,'[^0-9]','','g'),9) = v_digits
    limit 1;

  if v_access is null then
    if not exists (
      select 1 from public.leads
      where lower(trim(name)) = lower(trim(p_name))
        and right(regexp_replace(contact,'[^0-9]','','g'),9) = v_digits
    ) then
      return jsonb_build_object('ok',false,'reason','no_match');
    end if;
    insert into public.client_portal_access (client_name, client_contact, pin_hash, pin_is_default)
    values (p_name, p_contact, crypt('1122', gen_salt('bf')), true)
    returning * into v_access;
  end if;

  if v_access.locked_until is not null and v_access.locked_until > now() then
    return jsonb_build_object('ok',false,'reason','locked','locked_until',v_access.locked_until);
  end if;

  if v_access.pin_hash <> crypt(p_pin, v_access.pin_hash) then
    update public.client_portal_access set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where id = v_access.id;
    return jsonb_build_object('ok',false,'reason','wrong_pin');
  end if;

  update public.client_portal_access set failed_attempts = 0, locked_until = null, last_login_at = now()
    where id = v_access.id;

  return jsonb_build_object('ok',true,'access_id', v_access.id, 'is_default_pin', v_access.pin_is_default, 'name', v_access.client_name, 'avatar', v_access.avatar);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_portal_update_avatar(p_avatar text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.client_portal_access set avatar = p_avatar where auth_uid = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_portal_update_channels(p_email text, p_whatsapp text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_client_contact_digits() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_client_session');
  end if;
  update public.client_portal_access
    set client_email = nullif(trim(p_email),''), client_whatsapp = nullif(trim(p_whatsapp),'')
    where auth_uid = auth.uid();
  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_portal_update_contact(p_new_name text, p_new_contact text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_digits text;
  v_old_name text;
  v_new_digits text;
  v_conflict_count int;
  v_updated_count int;
  v_agent_keys text[];
  v_key text;
begin
  v_old_digits := my_client_contact_digits();
  v_old_name := my_client_name();
  if v_old_digits is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_client_session');
  end if;
  if p_new_name is null or trim(p_new_name) = '' or p_new_contact is null or trim(p_new_contact) = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;

  v_new_digits := right(regexp_replace(p_new_contact, '[^0-9]', '', 'g'), 9);
  if v_new_digits is null or length(v_new_digits) < 9 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_contact');
  end if;

  if v_new_digits <> v_old_digits then
    select count(*) into v_conflict_count from public.leads
      where right(regexp_replace(contact,'[^0-9]','','g'),9) = v_new_digits;
    if v_conflict_count > 0 then
      return jsonb_build_object('ok', false, 'reason', 'contact_in_use');
    end if;
  end if;

  select array_agg(distinct agent_key) into v_agent_keys from public.leads
    where right(regexp_replace(contact,'[^0-9]','','g'),9) = v_old_digits
      and lower(trim(name)) = v_old_name and agent_key is not null;

  update public.leads
    set name = p_new_name, contact = p_new_contact
    where right(regexp_replace(contact,'[^0-9]','','g'),9) = v_old_digits
      and lower(trim(name)) = v_old_name;
  get diagnostics v_updated_count = row_count;

  update public.client_portal_access
    set client_name = p_new_name, client_contact = p_new_contact
    where auth_uid = auth.uid();

  if v_agent_keys is not null then
    foreach v_key in array v_agent_keys loop
      insert into public.messages(sender_key, sender_name, recipient_key, body)
      values ('system','Palmstead', v_key, p_new_name || ' updated their name/contact details in the client portal — please verify against your own records.');
    end loop;
  end if;
  if v_agent_keys is null or not ('manager' = any(v_agent_keys)) then
    insert into public.messages(sender_key, sender_name, recipient_key, body)
    values ('system','Palmstead','manager', p_new_name || ' updated their name/contact details in the client portal.');
  end if;

  return jsonb_build_object('ok', true, 'updated_leads', v_updated_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_leads_amt_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.amt_paid is distinct from old.amt_paid and not (my_key() = 'elias' or my_role() = 'manager') then
    raise exception 'amt_paid_locked' using message = 'Only Elias or Management can record payments. Ask them to log this payment.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text;
  v_base_key text;
  v_key text;
  v_n int := 1;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;
  v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''), split_part(new.email,'@',1));
  v_base_key := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '', 'g'));
  if v_base_key is null or v_base_key = '' then v_base_key := 'agent'; end if;
  v_key := v_base_key;
  while exists (select 1 from public.profiles where agent_key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base_key || v_n::text;
  end loop;
  insert into public.profiles (id, email, name, role, agent_key, active)
  values (new.id, new.email, v_name, 'agent', v_key, true)
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.link_referral_to_lead(p_referral_id uuid, p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.referrals
  set referred_lead_id = p_lead_id
  where id = p_referral_id
    and referred_lead_id is null
    and status = 'Pending'
    and (
      my_role() = 'manager'
      or my_key() = any(array['elias','emmanuel','elizabeth'])
      or referrer_lead_id in (select id from public.leads where agent_key = my_key())
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_staff_on_client_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text := TG_ARGV[0];
  v_badge_kind text;
  v_summary text;
  v_detail text;
begin
  if new.source is distinct from 'Client portal' then
    return new;
  end if;

  v_badge_kind := case v_kind
    when 'enquiry' then 'enquiry'
    when 'complaint' then 'complaint'
    when 'site visit request' then 'sitevisit'
    else v_kind
  end;

  v_detail := coalesce(to_jsonb(new)->>'details', to_jsonb(new)->>'notes', '');
  v_summary := coalesce(new.name,'A client') || ' submitted a ' || v_kind || ' via the client portal: '
    || left(v_detail, 160);

  if new.agent_key is not null then
    insert into public.messages(sender_key, sender_name, recipient_key, body, kind)
    values ('system','Palmstead', new.agent_key, v_summary, v_badge_kind);
  end if;

  if new.agent_key is distinct from 'manager' then
    insert into public.messages(sender_key, sender_name, recipient_key, body, kind)
    values ('system','Palmstead','manager', v_summary, v_badge_kind);
  end if;

  if new.agent_key is distinct from 'elias' then
    insert into public.messages(sender_key, sender_name, recipient_key, body, kind)
    values ('system','Palmstead','elias', v_summary, v_badge_kind);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_staff_on_plot_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_summary text;
begin
  v_summary := coalesce(new.client_name,'A client') || ' requested an additional ' || new.plot_type
    || ' (' || new.no_plots || ') via the client portal.';
  if new.agent_key is not null then
    insert into public.messages(sender_key, sender_name, recipient_key, body, kind)
    values ('system','Palmstead', new.agent_key, v_summary, 'plotrequest');
  end if;
  if new.agent_key is distinct from 'manager' then
    insert into public.messages(sender_key, sender_name, recipient_key, body, kind)
    values ('system','Palmstead','manager', v_summary, 'plotrequest');
  end if;
  if new.agent_key is distinct from 'elias' then
    insert into public.messages(sender_key, sender_name, recipient_key, body, kind)
    values ('system','Palmstead','elias', v_summary, 'plotrequest');
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_non_manager_expense_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if OLD.status is distinct from NEW.status and coalesce(public.my_role(),'') <> 'manager' then
    raise exception 'Only Management can approve or reject this';
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_non_manager_payment_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if OLD.status is distinct from NEW.status and public.my_role() <> 'manager' then
    raise exception 'Only Management can approve or decline a payment';
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_lead_doc_stage(p_lead_id uuid, p_stage text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (my_key() in ('elias','emmanuel','elizabeth') or my_role() = 'manager') then
    raise exception 'not_authorized';
  end if;
  if p_stage is not null and p_stage not in ('allocation','picking','site_plan','indentures','court_stamping','ready_pickup') then
    raise exception 'invalid_stage';
  end if;
  update public.leads set doc_stage = p_stage, doc_stage_updated_at = now() where id = p_lead_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_get_client_channels(p_contact text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_digits text;
  v_row record;
begin
  if auth.uid() is null or exists (select 1 from public.client_portal_access where auth_uid = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'staff_only');
  end if;
  v_digits := right(regexp_replace(coalesce(p_contact,''), '[^0-9]', '', 'g'), 9);
  if v_digits is null or length(v_digits) < 9 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_contact');
  end if;
  select client_email, client_whatsapp into v_row
    from public.client_portal_access
    where right(regexp_replace(client_contact,'[^0-9]','','g'),9) = v_digits
    limit 1;
  return jsonb_build_object('ok', true, 'email', v_row.client_email, 'whatsapp', v_row.client_whatsapp);
end;
$function$
;

-- Note: create_backup/ensure_receipt_number/restore_backup reference
-- public.receipt_number_seq, created in 06_sequences_and_triggers.sql --
-- fine since plpgsql bodies aren't validated until first execution.

CREATE OR REPLACE FUNCTION public.create_backup(p_trigger text, p_by text DEFAULT NULL::text, p_by_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_snapshot jsonb;
  v_counts jsonb;
  v_id uuid;
  v_checksum text;
begin
  select jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.leads t),
    'plots', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.plots t),
    'payments', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.payments t),
    'enquiries', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.enquiries t),
    'complaints', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.complaints t),
    'site_visits', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.site_visits t),
    'activity_log', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.activity_log t),
    'allocation_requests', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.allocation_requests t),
    'target_selections', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.target_selections t),
    'tasks', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.tasks t),
    'task_events', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.task_events t),
    'feedback', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.feedback t),
    'feedback_comments', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.feedback_comments t),
    'quotation_requests', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.quotation_requests t),
    'sms_log', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.sms_log t),
    'client_portal_access', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.client_portal_access t),
    'payment_reminders_log', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.payment_reminders_log t),
    'client_notifications', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.client_notifications t),
    'plot_requests', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.plot_requests t),
    'weekly_visit_forms', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.weekly_visit_forms t),
    'leave_requests', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.leave_requests t),
    'memos', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.memos t),
    'pricing_history', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.pricing_history t),
    'contracts', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.contracts t),
    'contract_requests', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.contract_requests t),
    'allowed_emails', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.allowed_emails t),
    'app_config', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.app_config t),
    'profiles', (select coalesce(jsonb_agg(t),'[]'::jsonb) from public.profiles t)
  ) into v_snapshot;

  select jsonb_object_agg(key, jsonb_array_length(value)) into v_counts from jsonb_each(v_snapshot);
  v_checksum := encode(digest(v_snapshot::text, 'sha256'), 'hex');

  insert into public.backups(trigger_type, triggered_by, triggered_by_name, snapshot, table_counts, size_bytes, checksum)
  values (p_trigger, p_by, p_by_name, v_snapshot, v_counts, octet_length(v_snapshot::text), v_checksum)
  returning id into v_id;

  delete from public.backups where id in (
    select id from public.backups order by created_at desc offset 30
  );

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_receipt_number(p_payment_id uuid, p_channel text DEFAULT 'download'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_number text;
  v_seq bigint;
  v_actor_kind text;
  v_actor_key text;
  v_actor_name text;
  v_authorized boolean;
begin
  select
    (p.agent_key = my_key() or my_role() = 'manager' or my_key() = any(array['elias','emmanuel','elizabeth']))
    or (
      p.status = 'approved'
      and my_client_contact_digits() is not null
      and exists (
        select 1 from public.leads l
        where l.id = p.lead_id
          and right(regexp_replace(l.contact,'[^0-9]','','g'),9) = my_client_contact_digits()
          and lower(trim(l.name)) = my_client_name()
      )
    )
  into v_authorized
  from public.payments p
  where p.id = p_payment_id;

  if v_authorized is not true then
    raise exception 'Not authorized to generate a receipt for this payment';
  end if;

  select receipt_number into v_number from public.payments where id = p_payment_id;
  if v_number is null then
    v_seq := nextval('public.receipt_number_seq');
    v_number := 'RCT-' || lpad(v_seq::text, 6, '0');
    update public.payments set receipt_number = v_number where id = p_payment_id;
  end if;

  if my_key() is not null then
    v_actor_kind := 'staff'; v_actor_key := my_key(); v_actor_name := (select name from public.profiles where agent_key = my_key());
  else
    v_actor_kind := 'client';
    select id::text, client_name into v_actor_key, v_actor_name from public.client_portal_access where auth_uid = auth.uid();
  end if;

  insert into public.receipt_log(payment_id, receipt_number, actor_kind, actor_key, actor_name, channel)
  values (p_payment_id, v_number, v_actor_kind, v_actor_key, v_actor_name, coalesce(p_channel,'download'));

  return v_number;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_backup(p_backup_id uuid, p_by text, p_by_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_snapshot jsonb;
  v_safety_id uuid;
  v_table text;
  v_tables text[] := array['leads','plots','payments','enquiries','complaints','site_visits','activity_log',
    'allocation_requests','target_selections','tasks','task_events','feedback','feedback_comments',
    'quotation_requests','sms_log','client_portal_access','payment_reminders_log','client_notifications',
    'plot_requests','weekly_visit_forms','leave_requests','memos','pricing_history','contracts',
    'contract_requests','allowed_emails'];
begin
  if coalesce(public.my_role(),'') <> 'manager' then
    raise exception 'Only Management can restore a backup';
  end if;

  select snapshot into v_snapshot from public.backups where id = p_backup_id;
  if v_snapshot is null then
    raise exception 'Backup not found';
  end if;

  v_safety_id := public.create_backup('pre_restore', p_by, p_by_name);

  foreach v_table in array v_tables loop
    execute format('delete from public.%I', v_table);
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', v_table, v_table)
      using (v_snapshot->v_table);
  end loop;

  insert into public.activity_log(agent_key, agent_name, action, detail)
  values (coalesce(p_by,'system'), p_by_name, 'restored a system backup',
    'restored from backup '||p_backup_id||'; pre-restore safety backup '||v_safety_id);

  return jsonb_build_object('restored_from', p_backup_id, 'pre_restore_safety_backup', v_safety_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_monthly_commission_check()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cfg record;
  report_month text;
  full_cap numeric; half_cap numeric; pool_per_plot numeric;
  full_price numeric; half_price numeric;
  agent_count int; eligible_count int; pool_total numeric; grand_total numeric;
  month_label text;
begin
  if extract(day from now())::int < 15 then return; end if;

  select * into cfg from app_config where id=1;
  report_month := to_char((now() - interval '1 month'), 'YYYY-MM');
  if cfg.last_commission_month = report_month then return; end if;

  full_cap := coalesce(cfg.commission_full_cap, 1000);
  half_cap := coalesce(cfg.commission_half_cap, 500);
  pool_per_plot := coalesce(cfg.commission_pool_per_plot, 500);
  full_price := coalesce(cfg.full_price, 0);
  half_price := coalesce(cfg.half_price, 0);

  with first_payment as (
    select lead_id, min(payment_date) as first_date from payments group by lead_id
  ),
  personal as (
    select p.agent_key as key,
      sum(
        (case when l.plot_type='Half Plot' then half_cap else full_cap end)
        * (p.amount / nullif(case when l.plot_type='Half Plot' then half_price else full_price end, 0))
      ) as personal
    from payments p join leads l on l.id = p.lead_id
    where to_char(p.payment_date,'YYYY-MM') = report_month
    group by p.agent_key
  ),
  newplots_this as (
    select l.agent_key as key, sum(coalesce(l.no_plots,1)) as np
    from first_payment fp join leads l on l.id=fp.lead_id
    where to_char(fp.first_date,'YYYY-MM') = report_month
    group by l.agent_key
  ),
  eligible as (
    select distinct l.agent_key as key
    from first_payment fp join leads l on l.id=fp.lead_id
    where to_char(fp.first_date,'YYYY-MM') in (
      report_month,
      to_char((to_date(report_month||'-01','YYYY-MM-DD') - interval '1 month'),'YYYY-MM'),
      to_char((to_date(report_month||'-01','YYYY-MM-DD') - interval '2 month'),'YYYY-MM')
    )
  ),
  agents as (
    select agent_key as key from profiles where role='agent'
  ),
  pool as (
    select coalesce((select sum(np) from newplots_this),0) * pool_per_plot as pool_total,
           (select count(*) from eligible e join agents a on a.key=e.key) as eligible_count
  )
  select
    (select count(*) from agents),
    (select eligible_count from pool),
    (select pool_total from pool),
    coalesce((select sum(coalesce(p.personal,0)) from agents a left join personal p on p.key=a.key),0)
      + case when (select eligible_count from pool)>0 then (select pool_total from pool) else 0 end
  into agent_count, eligible_count, pool_total, grand_total;

  month_label := to_char(to_date(report_month||'-01','YYYY-MM-DD'),'Mon YYYY');

  insert into public.announcements(title, body, image_b64, created_by, active)
  values (
    'Commission ready: '||month_label,
    month_label||' commission is ready to pay today — GHS '||trim(to_char(grand_total,'FM999,999,990'))||
      ' total across '||agent_count||' agents ('||eligible_count||' sharing a GHS '||trim(to_char(pool_total,'FM999,999,990'))||' pool). Open Commission in the app for the full breakdown.',
    null, 'Palmstead', true
  );

  update public.app_config set last_commission_month = report_month where id=1;
end;
$function$
;
