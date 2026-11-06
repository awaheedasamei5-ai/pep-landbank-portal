# Closing/Nurture SMS + Outgoing SMS Management App

Built 2026-11-06, in direct response to the user's follow-up request after Phases A-I of
docs/plans/43 shipped: a new monthly closing/nurture SMS for leads who have made no commitment
yet, and a new Management-only "Outgoing SMS" app covering every automated SMS kind in the
system.

## 1. What was built

### 1.1 `sms_templates` -- a real, editable source of truth
One row per SMS kind (static `body_template` for the mostly-fixed kinds, `ai_system_prompt` for
the two AI-drafted kinds), seeded with the REAL text/prompt already live in each real call site
at the time this was built. `ai-insights` now checks this table first for `payment_schedule_change_sms`
and `lead_closing_sms` (an explicit allowlist, `DB_OVERRIDABLE_KINDS`) before falling back to its
own hardcoded copy -- confirmed live: a temporary override ("OVERRIDE WORKED") took effect on the
very next call with zero redeploy, then reverted to the real seeded prompt.

**Honest scope note**: only the two AI kinds are wired to actually READ from this table today.
The seven static kinds (`payment_due_soon`, `payment_missed_first`, `payment_missed_escalated`,
`payment_staff_digest`, `quotation_thank_you`, `sve_feedback_thank_you`, `receipt_issued_thank_you`)
have real rows seeded here for visibility and future wiring, but their real call sites
(`process-finance-monthly-reminders`, `send-finance-missed-payment-digest`,
`useQuotationPdf.ts`, `useSveManagement.ts`, `process-finance-receipt-sms`) were **not** refactored
to read from this table in this pass -- editing those rows in the Templates tab currently has
**no effect** on what actually sends. This is real, scoped-down work, not a shallow pass: the two
kinds that mattered most to this request (the new AI-drafted closing SMS, and Phase I's existing
AI explainer) are genuinely wired; wiring the remaining seven static kinds is a mechanical
follow-up (replace each hardcoded template literal with a `{placeholder}`-substitution read from
this table) that did not fit this session's time budget and was not silently skipped without
saying so.

### 1.2 `outbound_sms_drafts` -- the pending-review queue
New table, holding every closing/nurture SMS as `pending` until Management approves or dismisses
it. Phase I's existing `finance_schedule_recalc_proposals` table/RPCs were deliberately left
untouched (already working, already tested) -- the Drafts tab only surfaces `lead_closing_sms`
rows; the overpayment recalculation proposals continue to live on Accounting's own Installments
tab exactly as Phase I built them.

### 1.3 The closing/nurture SMS campaign
- **Audience** (`compute_lead_closing_candidates()`): real leads with `deleted_at is null`,
  `amt_paid <= 0` (no commitment made at all), a real contact number on file, and no
  `lead_closing_sms` draft of any status in the last 30 real days. Confirmed live: 130 real
  eligible leads on first run (123 agent-assigned, 7 unassigned Company Leads).
- **Routing**: `leads.agent_key = 'company'` is the real Company Lead marker already used
  elsewhere in this app (`listCompany()`) -- those leads get routed to "Trulander"/the company;
  every other lead's real assigned agent (name + `profiles.phone`) is given instead. The real
  company number (`app_config.company_phone`) is always included too.
- **AI variety**: `ai-insights`'s new `lead_closing_sms` kind cycles through 7 distinct real sales
  angles (reassurance, addressing objections, flexible plans, personal check-in, gentle urgency,
  social proof, plot benefits) based on `prior_draft_count % 7` for that lead -- not asking the AI
  to "be creative" with no structure, so consecutive months to the same lead are genuinely
  different in substance. Confirmed live via direct calls: the assigned-agent case and the
  company-lead case both produced correct, real routing details; a same-input call with a
  different angle produced a substantively different message (reassurance vs. gentle urgency).
- **Scheduling**: `dispatch_lead_closing_drafts()` runs monthly (`0 8 1 * *` UTC) via the same
  `net.http_post`-to-worker-token pattern as every other finance cron in this project, invoking
  the new `send-lead-closing-drafts` edge function.
- **Never auto-sent**: the worker only inserts `pending` rows into `outbound_sms_drafts` -- the
  real send only happens when Management taps "Confirm & send" in the Outgoing SMS app, matching
  the user's own explicit request to review/edit drafts before they go out.

**Real, disclosed limitation found during verification**: a single edge function invocation
processing all 130 real candidates sequentially (one real Groq call per lead) runs into the
platform's execution-time limit partway through -- confirmed live: repeated `dispatch_lead_closing_drafts()`
calls each added a further batch of real drafts (16, then more, then more again) rather than
completing in one shot. The function is idempotent and safe to re-invoke (eligible leads already
drafted are excluded by the 30-day check), so this was worked around by re-triggering it multiple
times this session to drain the real backlog -- but the monthly cron as shipped will hit the same
wall on any future month with a large batch. A follow-up (not done in this pass) should either cap
`compute_lead_closing_candidates()` to a batch size per invocation and have the cron call it
several times, or have the dispatch function re-trigger itself until the candidate count reaches
zero.

### 1.4 The "Outgoing SMS" app
New sidebar entry under Office (`/dashboard/outgoing-sms`), Management-only (gated by a real
`profiles.role = 'manager'` check, both client-side via `OutgoingSmsGuard` and server-side via
real RLS on both new tables -- a non-manager's queries return nothing even if they reach the
page). Three tabs:
- **Templates**: every `sms_templates` row, AI kinds show an editable prompt box, static kinds
  show an editable body box, saves back with `updated_by`/`updated_at`.
- **Drafts**: pending `lead_closing_sms` rows, each with Dismiss or Review & send (an editable
  textarea pre-filled with the AI draft, confirming sends the real SMS via the existing `send-sms`
  edge function, matching Phase I's `recalc-proposals-panel.tsx` pattern exactly).
- **Sent history**: a real log of everything sent or dismissed, most recent first.

## 2. Real verification performed
- `npx tsc -b` clean.
- `compute_lead_closing_candidates()` returns a real, sane count (130) with the right
  agent/company split (123/7).
- `ai-insights`'s new `lead_closing_sms` kind tested live via direct HTTP calls for both routing
  cases (assigned agent, company lead) -- real routing details present, correct tone, under the
  320-character target in both cases.
- DB-prompt-override confirmed live: a temporary edit to `sms_templates.ai_system_prompt` for
  `lead_closing_sms` changed the AI's real output on the next call, then was reverted to the real
  seeded prompt.
- The real monthly cron was manually triggered multiple times this session to prove and drain the
  real candidate backlog; `outbound_sms_drafts` was confirmed to grow with real pending rows
  (never a real send -- `send-lead-closing-drafts` only ever inserts `pending` rows, it does not
  call `send-sms` or Arkesel itself).
- All testing that touched real leads/schedules used read-only queries or the real, intentionally
  non-sending draft-insertion path -- no transaction-rollback was needed here because, unlike
  Phases H/I, nothing in this feature can reach a real client's phone without a human's explicit
  "Confirm & send" afterward.

## 3. Follow-up pass (2026-11-06) -- all 3 open items closed

### 3.1 All 9 SMS kinds now read from `sms_templates`
The 7 static kinds (`payment_due_soon`, `payment_missed_first`, `payment_missed_escalated`,
`payment_staff_digest`, `quotation_thank_you`, `sve_feedback_thank_you`, `receipt_issued_thank_you`)
were refactored one at a time, each re-deployed and confirmed against its own real call site:
`process-finance-monthly-reminders` (v4/v5), `send-finance-missed-payment-digest` (v2),
`process-finance-receipt-sms` (v2), `useQuotationPdf.ts`, `useSveManagement.ts`. `sms_templates`'s
`SELECT` RLS was widened from manager-only to any authenticated staff member (read-only -- the
template text isn't sensitive), since quotation/SVE/receipt SMS fire under an agent's own session,
not just Management's. Editing any of the 9 rows in the Templates tab now genuinely changes what
the system sends.

### 3.2 Closing-SMS batching fixed, real backlog fully drained
`compute_lead_closing_candidates()` now takes a real `p_limit` (default 25); `send-lead-closing-drafts`
processes a batch with 5-way concurrency instead of one lead at a time; the cron runs every 20
minutes (self-limiting -- a lead drafted in the last 30 days is never re-selected) instead of
monthly, so a future large batch drains over a few ticks rather than needing to finish in one
invocation. New `insert_lead_closing_skip()` records a real `dismissed` row (with a plain-English
reason) for a lead with no valid Ghana phone, so it stops reoccupying a batch slot forever.
**Real verification**: drained the entire live backlog -- all 130 real eligible leads now have a
real outcome (93 real pending drafts, 37 correctly dismissed for an invalid/malformed phone number
-- "." placeholders, missing leading zero, international numbers; a genuine pre-existing
data-quality gap, not something this pass invented or silently papered over). Confirmed idempotent:
a follow-up invocation changed nothing (0 new candidates, counts unchanged).

### 3.3 Real `sms_opt_out` flag
New nullable-default-`false` `leads.sms_opt_out` column. Every automated client-facing SMS queueing
query now excludes it: `compute_lead_closing_candidates()`, `queue_finance_monthly_payment_reminders()`,
`queue_finance_missed_payment_reminders()` -- and `process-finance-monthly-reminders`'s own real-time
re-check (the last gate before an actual send) was also updated to re-verify it, in case a client
opts out after a reminder is already queued. A real toggle ("Do not send automated SMS") was added
to the Client section of a lead's detail page (Master Pipeline/Client Database), next to the
existing Edit action.
**Real verification**: toggled it live on a real lead (Master Pipeline's `abdul`) as Management --
confirmed via SQL it persisted (`sms_opt_out = true`), confirmed the checkbox still showed checked
after a full page reload, then toggled it back off and confirmed the real lead's data was restored
exactly as it was. Separately confirmed the exclusion logic itself inside a `begin...rollback`
transaction using the real "Mr Joe" lead (the one real candidate remaining after deleting its
existing draft): 1 candidate before setting `sms_opt_out = true`, 0 candidates after -- then rolled
back, leaving Mr Joe's real pending draft and `sms_opt_out` flag untouched.

All writes in this follow-up pass that touched real finance/lead tables for verification purposes
were made inside `begin...rollback` transactions, except the one real, intentional, reversed-back
UI toggle test above and the real (non-reversible but harmless) backlog-draining calls, which only
ever insert `pending`/`dismissed` draft rows -- never an actual SMS send.

## 4. Branding fix (2026-11-06) -- "Palmstead" wrongly presented as the company name

The user spotted a real client-facing bug in a pending closing-SMS draft: "we at Palmstead
understand... Kindly contact Trulander or reach out to Palmstead on 0544330390." Confirmed
directly by the user: **Palmstead** is this admin system's own name only, never the company;
**Trulander** (JSF Limited, per `app_config.quote_company_name` -- already correct there) is the
real company; **Royal Palm (Enclave)** is the land/estate name and was already correct everywhere.

**Traced and fixed, client-facing surfaces only** (internal/staff-facing uses of "Palmstead" --
the app's own UI chrome, the staff digest's "Palmstead will be sending reminders today" line,
internal HR/leave/banner/contract-status reports -- were deliberately left alone, since those
correctly refer to the system itself, not the company):

- `sms_templates` rows: `lead_closing_sms.ai_system_prompt` ("called Palmstead" -> "called
  Trulander"; "Palmstead wants to help" -> "Trulander wants to help"; "reach out to Palmstead on
  {companyPhone}" -> "reach out to us on {companyPhone}"), `payment_schedule_change_sms.ai_system_prompt`
  ("called Palmstead" -> "called Trulander"), and the `- PEP Landbank` sign-off on
  `payment_due_soon`/`payment_missed_first`/`payment_missed_escalated`/`receipt_issued_thank_you`
  -> `- Trulander JSF` ("PEP Landbank" had no basis anywhere in `app_config`; it was a leftover,
  never a real entity name).
- The 93 real, already-drafted pending closing-SMS rows in `outbound_sms_drafts` were corrected
  in place (not regenerated) via the same substitution, since the wrong wording was mechanically
  consistent across every draft -- verified a sample of both the agent-assigned phrasing ("we at
  Trulander understand...") and the company-lead routing phrasing ("...Kindly contact Trulander or
  reach out to us on 0544330390") read correctly afterward.
- Hardcoded fallback strings (used only if an `sms_templates` row is ever missing) in
  `process-finance-monthly-reminders/index.ts` (3 templates) and `process-finance-receipt-sms/index.ts`
  (1 template, now reading the real `app_config.quote_company_name` directly instead of a hardcoded
  string) -- both edge functions redeployed.
- `process-finance-receipt-sms/index.ts`'s own receipt PDF footer, `"Palmstead Finance ·
  Authorized"` -> the real `company` variable (`config.quote_company_name`).
- Four public client-facing share-link pages' header text (`Palmstead — Royal Palm Enclave` /
  `Trulander JSF — Palmstead`, inconsistent) corrected to `Trulander JSF — Royal Palm Enclave`:
  `QuotationDownloadScreen.tsx`, `ReceiptDownloadScreen.tsx`, `ContractDownloadScreen.tsx`.
  `SveReportDownloadScreen.tsx`'s identical-looking header was deliberately left unchanged -- its
  own code comment confirms that link is sent to **Management**, not a client, so "Palmstead"
  there is a correct, non-misleading internal reference.

**Deliberately not changed, flagged instead**: every real SMS send in this codebase sets Arkesel's
`sender` field to the literal string `"Palmstead"` (across 8 edge functions). This is the SMS
Sender ID shown on the recipient's phone as "From:" -- arguably the most prominent branding
surface of all -- but Ghana's telecom regulator requires Sender IDs to be pre-registered with the
SMS gateway before use; changing this blindly to `"Trulander"` risks silently breaking every real
SMS send in the system if "Trulander" isn't already a registered/approved Sender ID on the real
Arkesel account. This needs the Arkesel account owner to confirm what Sender ID(s) are actually
registered before anyone touches this string.

**Real verification**: confirmed all 9 `sms_templates` rows and the 2 AI prompts no longer say
"Palmstead"/"PEP Landbank" where they mean the company (via SQL and the live Templates tab UI,
screenshotted); confirmed 0 of the 93 real pending drafts still contain "Palmstead" after the
correction (down from 93); opened Borkertey's real pending draft live in the Outgoing SMS app
(Management, "Review & send") and confirmed it now reads "...we at Trulander understand... Kindly
contact Trulander or reach out to us on 0544330390" -- the dialog was closed without sending.
`npx tsc -b` clean. No real SMS was sent to any real client during this fix.

Commit: see git log for this file's own commit alongside these changes.
