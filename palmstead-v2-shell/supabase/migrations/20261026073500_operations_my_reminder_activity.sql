-- Personal Operations reminder history. Return only the signed-in recipient's
-- safe delivery metadata; never expose phone numbers, endpoints or payloads.
create index if not exists op_todo_sms_outbox_recipient_activity_idx
  on public.op_todo_sms_outbox (recipient_key, updated_at desc);
create index if not exists op_todo_push_outbox_recipient_activity_idx
  on public.op_todo_push_outbox (recipient_key, updated_at desc);
create index if not exists op_meeting_push_outbox_recipient_activity_idx
  on public.op_meeting_push_outbox (recipient_key, updated_at desc);

create or replace function app_schedule_private.my_reminder_activity()
returns jsonb
language plpgsql stable security definer
set search_path = ''
set row_security = off
as $$
declare
  v_staff_key text;
  v_events jsonb;
  v_device_count integer;
begin
  select p.agent_key into v_staff_key
  from public.profiles p
  where p.id = auth.uid() and p.active is true and p.agent_key is not null;
  if v_staff_key is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;

  select pg_catalog.count(*)::integer into v_device_count
  from public.push_subscriptions subscription
  where subscription.owner_kind = 'staff' and subscription.owner_id = v_staff_key;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(activity)
    order by activity.updated_at desc, activity.id desc), '[]'::jsonb)
  into v_events
  from (
    select sms.id, 'sms'::text as channel, 'task'::text as item_kind,
      sms.event_kind, sms.status, sms.scheduled_for, sms.updated_at,
      coalesce(todo.title, 'Task no longer available') as title,
      0::integer as accepted_devices, sms.provider_accepted_at
    from public.op_todo_sms_outbox sms
    left join public.op_todos todo on todo.id = sms.todo_id
    where sms.recipient_key = v_staff_key
    union all
    select push.id, 'device'::text, 'task'::text,
      push.event_kind, push.status, push.scheduled_for, push.updated_at,
      push.task_title, push.accepted_devices, null::timestamptz
    from public.op_todo_push_outbox push
    where push.recipient_key = v_staff_key
    union all
    select meeting.id, 'device'::text, 'meeting'::text,
      meeting.event_kind, meeting.status, meeting.scheduled_for, meeting.updated_at,
      meeting.meeting_title, meeting.accepted_devices, null::timestamptz
    from public.op_meeting_push_outbox meeting
    where meeting.recipient_key = v_staff_key
    order by updated_at desc, id desc
    limit 30
  ) activity;

  return pg_catalog.jsonb_build_object('device_count', v_device_count, 'events', v_events);
end;
$$;

create or replace function public.get_my_operations_reminder_activity()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select app_schedule_private.my_reminder_activity()
$$;

revoke all on function app_schedule_private.my_reminder_activity() from public, anon;
grant execute on function app_schedule_private.my_reminder_activity() to authenticated;
revoke all on function public.get_my_operations_reminder_activity() from public, anon;
grant execute on function public.get_my_operations_reminder_activity() to authenticated;
