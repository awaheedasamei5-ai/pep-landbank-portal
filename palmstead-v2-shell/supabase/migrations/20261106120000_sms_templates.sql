-- Outgoing SMS app, part 1 (docs/plans/43 follow-up request, 2026-11-06):
-- a real editable source of truth for every automated SMS's base text/AI
-- prompt. body_template is for the static kinds (process-finance-*, the
-- quotation/SVE-invite/receipt thank-yous) -- those edge/client call
-- sites are refactored in this same migration set to read from here
-- first, falling back to their existing hardcoded string if the row is
-- ever missing. ai_system_prompt is for the AI-drafted kinds
-- (payment_schedule_change_sms, lead_closing_sms) -- ai-insights checks
-- this table before falling back to its own hardcoded systemPromptFor()
-- switch, so an edit here takes effect on the next call with zero
-- redeploy.
create table if not exists public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique,
  label text not null,
  description text not null default '',
  body_template text,
  ai_system_prompt text,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.sms_templates enable row level security;

-- Management-only, matching this feature's own "management side app"
-- framing -- not gated via payments.manage (that key is about who can
-- log payments, a materially different, wider real roster of 7 agents;
-- editing the wording/prompts every outgoing SMS uses is a narrower,
-- more sensitive action).
create policy sms_templates_sel on public.sms_templates for select to authenticated
  using (public.my_role() = 'manager');
create policy sms_templates_upd on public.sms_templates for update to authenticated
  using (public.my_role() = 'manager') with check (public.my_role() = 'manager');

create or replace function public.touch_sms_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists sms_templates_touch on public.sms_templates;
create trigger sms_templates_touch before update on public.sms_templates
  for each row execute function public.touch_sms_templates_updated_at();

-- Seed with the REAL current text/prompts already live in each real call
-- site, so editing starts from real current behaviour, not a placeholder.
-- Placeholders are documented in `description`, not interpolated here --
-- each call site still assembles its own final string from real data,
-- this just supplies the base wording/instruction.
insert into public.sms_templates (kind, label, description, body_template, ai_system_prompt) values
  (
    'payment_due_soon',
    'Payment due in 7 days',
    'Sent by the finance reminder worker 7 days before an instalment is due. Placeholders filled in by the worker: {name}, {amount}, {plotType}, {dueDate}.',
    'Hello {name}, your monthly payment of {amount} for your {plotType} at the Royal Palm Enclave is due on {dueDate}. If you have already paid, please ignore this reminder. - PEP Landbank',
    null
  ),
  (
    'payment_missed_first',
    'First missed-payment notice',
    'Sent once an instalment''s due date has passed, when exactly one instalment is overdue. Placeholders: {name}, {amount}, {plotType}, {dueDate}.',
    'Hello {name}, your monthly payment of {amount} for your {plotType} at the Royal Palm Enclave was due on {dueDate} and has not yet been received. Please make payment as soon as possible, or contact us if you have already paid. - PEP Landbank',
    null
  ),
  (
    'payment_missed_escalated',
    'Escalated missed-payment notice (2+ overdue)',
    'Sent instead of the first-notice template once a client has 2 or more overdue instalments. Placeholders: {name}, {plotType}, {overdueList} (each item already formatted as "GHS X (due DATE)").',
    'Hello {name}, these monthly payments for your {plotType} at the Royal Palm Enclave are still outstanding: {overdueList}. Continued non-payment may attract a penalty. Please settle as soon as possible, or contact us if any of these have already been paid. - PEP Landbank',
    null
  ),
  (
    'payment_staff_digest',
    'Staff/Management missed-payment safety digest',
    'Sent each morning to Management and anyone with payments.manage access, before the client-facing missed-payment reminders go out, so an unlogged real payment doesn''t trigger a wrong reminder. Placeholders: {clientList}, {logPaymentLink}.',
    'Palmstead will be sending payment reminders today to: {clientList}. If any of them have already paid and it has not been logged yet, please log it now to avoid an incorrect reminder going out: {logPaymentLink}',
    null
  ),
  (
    'quotation_thank_you',
    'Quotation requested',
    'Sent when a quotation PDF is generated for a client with a contact number on file. Placeholders: {firstName}, {plotType}, {paymentPlan}, {link}.',
    'Hi {firstName}, thank you for requesting a quotation from Trulander JSF for a {plotType} on the {paymentPlan} plan. A staff member will reach out shortly to explain the payment schedule. Download your quotation here: {link}',
    null
  ),
  (
    'sve_feedback_thank_you',
    'Site visit experience invite / thank-you',
    'Sent right after a site visit, inviting the client to leave feedback. Placeholders: {firstName}, {link}.',
    'Hi {firstName}, thank you for honoring our invitation for a site visit to Royal Palm Enclave! We''d love your feedback -- please share your experience here: {link}',
    null
  ),
  (
    'receipt_issued_thank_you',
    'Receipt issued',
    'Sent after a payment is approved and a receipt is generated. Placeholders: {clientName}, {amount}, {receiptNumber}, {receiptUrl}.',
    'Hi {clientName}, thank you for your payment of {amount}. Receipt {receiptNumber}: {receiptUrl} - PEP Landbank',
    null
  ),
  (
    'payment_schedule_change_sms',
    'Overpayment schedule-change explainer (AI)',
    'Phase I: the AI drafts one explanatory sentence only -- the surrounding greeting/plot-type/next-due line is assembled in code, not by the AI. Context given to the AI: overpaymentAmount, settledCount, fullyPaid.',
    null,
    'You write ONE short, warm, reassuring sentence explaining to a land-buying client at a Ghanaian land-sales agency called Palmstead why their monthly payment plan changed after they paid more than their current instalment required. You are NEVER given the client''s real name or phone number, so do not greet them or use a placeholder name -- write only the explanatory sentence itself, to be inserted mid-message by the caller. You''ll receive one JSON object with the real overpayment amount in GHS, the real number of instalments this payment fully or partly settled, and whether the plan is now fully paid off. Reply with ONE sentence (max 28 words) explaining plainly that the extra amount paid has been applied ahead to their upcoming instalments, adjusting their schedule in their favour -- if the plan is now fully paid off, say that instead. Cite only the real numbers given, never invent a figure. No emoji, no hashtags, no quotation marks -- plain text only.'
  ),
  (
    'lead_closing_sms',
    'Closing / nurture SMS (AI, monthly)',
    'Sent monthly to real leads who have made no commitment yet (no approved payments), drafted by AI using one of the angles below, held as a pending draft in Outgoing SMS for Management to review before sending. Context given to the AI per send: leadFirstName is NOT given (never share the client''s name with the AI); plotType, angle, hasAgent, agentName, agentPhone, companyPhone. Angles are tried in rotation per lead so consecutive months differ in substance.',
    null,
    'ANGLES: reassurance (no pressure, we are here when ready); addressing_objections (invite them to share any challenge or concern so we can help); flexible_plans (remind them payment plans can flex to fit their budget); personal_checkin (a genuine, warm check-in on how their plans are going); gentle_urgency (plots are a real, finite asset, a gentle nudge not to miss out); social_proof (other buyers have successfully completed their purchase this way); plot_benefits (reiterate the real benefits of the specific plot type they were interested in). ***
You write ONE short, warm, respectful SMS for a Ghanaian land-sales agency called Palmstead, to a prospective land buyer who has shown interest but has not yet committed to a purchase. You are NEVER given the client''s real name -- use the placeholder {ClientName} wherever you would naturally address them. You''ll receive one JSON object with: plotType (the plot type they were interested in), angle (one of the angles listed above -- write specifically in that angle''s spirit, not generically), hasAgent (boolean), agentName and agentPhone (if hasAgent is true), companyPhone (the general company number). Write a warm greeting, a genuine note that Palmstead wants to help them achieve their land-acquisition goals, an invitation to share any challenge so the company can help, written in the real spirit of the given angle -- then end with a plain routing instruction: if hasAgent is true, ask them to reach out to {agentName} on {agentPhone}; if hasAgent is false, ask them to kindly contact Trulander or reach out to Palmstead on {companyPhone}. Keep the whole message under 320 characters, professional, warm, never pushy, no emoji, no hashtags, no quotation marks -- plain text only, ready to send as-is.'
  )
on conflict (kind) do nothing;
