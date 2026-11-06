-- docs/plans/47 open item 2: send-lead-closing-drafts hit the edge function
-- execution-time limit processing all ~130 real candidates sequentially
-- (one real Groq call per lead). Fix: cap candidates per invocation with a
-- real p_limit, and run the cron frequently enough (every 20 minutes) that
-- a large backlog drains over several ticks instead of needing to finish in
-- one shot. compute_lead_closing_candidates() already excludes leads
-- drafted in the last 30 real days, so running it often is self-limiting --
-- it naturally does nothing once a lead already has a recent draft.
create or replace function public.compute_lead_closing_candidates(p_limit integer default 25)
returns table(lead_id uuid, name text, plot_type text, contact text, agent_key text, agent_name text, agent_phone text, prior_draft_count integer)
language sql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
  select
    l.id,
    l.name,
    coalesce(l.plot_type, 'plot'),
    l.contact,
    l.agent_key,
    case when l.agent_key is distinct from 'company' then p.name end,
    case when l.agent_key is distinct from 'company' then p.phone end,
    coalesce((
      select count(*)::int from public.outbound_sms_drafts d
      where d.lead_id = l.id and d.kind = 'lead_closing_sms'
    ), 0)
  from public.leads l
  left join public.profiles p on p.agent_key = l.agent_key and l.agent_key is distinct from 'company'
  where l.deleted_at is null
    and coalesce(l.amt_paid, 0) <= 0
    and l.contact is not null and btrim(l.contact) <> ''
    and not exists (
      select 1 from public.outbound_sms_drafts d
      where d.lead_id = l.id and d.kind = 'lead_closing_sms'
        and d.created_at > now() - interval '30 days'
    )
  order by l.created_at asc
  limit greatest(p_limit, 1);
$function$;

-- Drain the backlog faster: every 20 minutes instead of once a month. Safe
-- because the function is idempotent and self-limiting (see comment above).
select cron.alter_job(23, schedule := '*/20 * * * *');

-- Real data-quality gap found while draining the closing-SMS backlog: some
-- leads have no valid Ghana mobile number on file ("." placeholders,
-- malformed/international numbers). compute_lead_closing_candidates() never
-- excludes a lead until it has a draft row less than 30 days old, so these
-- leads would otherwise reappear in every single 20-minute batch forever
-- (wasted batch slots, though never an AI call or SMS -- the phone check
-- runs before both). Record a real 'dismissed' row with a clear reason so
-- they're correctly excluded for the same 30-day window as a real send,
-- and stay fully visible in the Outgoing SMS Sent-history tab.
create or replace function public.insert_lead_closing_skip(p_lead_id uuid, p_name text, p_angle text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  insert into public.outbound_sms_drafts(kind, lead_id, recipient_name, recipient_phone, body, angle, status)
  values ('lead_closing_sms', p_lead_id, p_name, null, 'Skipped: no valid Ghana mobile number on file.', p_angle, 'dismissed')
  returning id into v_id;
  return v_id;
end;
$function$;
