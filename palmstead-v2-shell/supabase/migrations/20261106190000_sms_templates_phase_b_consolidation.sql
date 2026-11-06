-- SMS engine rebuild Phase B, item 1 (docs/plans/48 Sec 9): bring the
-- remaining hardcoded SMS kinds into the real sms_templates source of
-- truth, matching the pattern already proven for the 9 kinds wired in
-- docs/plans/47. Covers: allocation staff notice, the sales daily digest,
-- both site-visit reminder variants, and the 4 leave-request transition
-- messages. `promote_due_planned_leave()`'s 2 auto-submit messages are
-- deliberately left out of this pass (documented as a known remaining gap
-- in docs/plans/48) to keep this migration reviewable.

-- A generic {token} renderer for PL/pgSQL callers (the TS edge functions
-- already have their own renderTemplate() helper; this is its SQL
-- equivalent for the two pure-SQL senders being wired here).
create or replace function public.render_sms_template(p_template text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result text := p_template;
  v_key text;
  v_val text;
begin
  for v_key, v_val in select key, value #>> '{}' from jsonb_each(coalesce(p_vars, '{}'::jsonb)) loop
    v_result := replace(v_result, '{' || v_key || '}', coalesce(v_val, ''));
  end loop;
  return v_result;
end;
$$;
revoke all on function public.render_sms_template(text, jsonb) from public, anon, authenticated;
grant execute on function public.render_sms_template(text, jsonb) to service_role, authenticated;

insert into public.sms_templates (kind, label, description, body_template) values
  (
    'allocation_staff_notice',
    'Allocation-ready notice (staff)',
    'Sent to the assigned salesperson when their client crosses the allocation payment threshold. Placeholders: {staffName}, {clientName}, {percent}, {link}.',
    'Hello {staffName}, {clientName} has paid {percent}% of the purchase price and is due for plot allocation. Review the request in Palmstead Allocations: {link} - Trulander JSF'
  ),
  (
    'sales_daily_digest',
    'Daily sales digest (staff/Management)',
    'Sent to active Management when a morning plan or evening results report is generated. Placeholders: {date}, {kind} (e.g. "morning plan"/"evening results"), {link}.',
    'Trulander JSF {date} {kind} report: {link} Sign in as Management to view and download the PDF.'
  ),
  (
    'site_visit_reminder_advance',
    'Site visit reminder - day before',
    'Sent the evening before a scheduled site visit. Placeholders: {name}, {site}, {dateLabel}, {timeLine}, {pickupLine}.',
    'Hi {name}, a reminder that your site visit to {site} is tomorrow ({dateLabel}){timeLine}{pickupLine}. See you then! - Trulander JSF'
  ),
  (
    'site_visit_reminder_today',
    'Site visit reminder - day of',
    'Sent the morning of a scheduled site visit. Placeholders: {name}, {site}, {timeLine}, {pickupLine}.',
    'Hi {name}, this is a reminder that your site visit to {site} is TODAY{timeLine}{pickupLine}. We look forward to seeing you! - Trulander JSF'
  ),
  (
    'leave_request_submitted',
    'Leave request submitted (notifies Management)',
    'Sent to Management when a staff member submits a leave request. Placeholders: {agentName}, {emergencyWord}, {days}, {startDate}.',
    '{agentName} submitted {emergencyWord} leave request for {days} working day(s), starting {startDate}. Open Palmstead > Leave to review the letter.'
  ),
  (
    'leave_request_approved',
    'Leave request approved (notifies staff)',
    'Sent to the requesting staff member when Management approves their leave. Placeholders: {days}, {startDate}, {endDate}.',
    'Your leave has been approved for {days} working day(s). First date: {startDate}; last date: {endDate}. Open Palmstead > Leave for the approved schedule and letter.'
  ),
  (
    'leave_request_rescheduled',
    'Leave request needs new dates (notifies staff)',
    'Sent to the requesting staff member when Management asks for replacement dates. Placeholders: {days}.',
    'Management has asked you to choose replacement dates for your leave. Your {days} reserved day(s) are retained. Open Palmstead > Leave to read the message and respond.'
  ),
  (
    'leave_request_declined',
    'Leave request declined (notifies staff)',
    'Sent to the requesting staff member when Management declines their leave. No placeholders.',
    'Management has declined your leave request. Open Palmstead > Leave to read the decision.'
  )
on conflict (kind) do nothing;
