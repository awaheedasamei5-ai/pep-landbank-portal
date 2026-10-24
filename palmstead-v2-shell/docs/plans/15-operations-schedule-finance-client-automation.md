# Operations Schedule, Finance Receipts, and Client Record Automation

**Status: phased implementation in progress.** This plan covers the next linked product slice across Operations, Finance, CRM, allocations, and plot inventory. It is based on a read-only review of the V2 source tree and the connected V2 Supabase project `sbydzrlzqxcdbudjaube`. No business rows, SMS messages, client records, or production schema were changed during discovery or the first schedule slice.

## Outcome

Make Palmstead a coordinated work system with trustworthy reminders, accurate payment records, and a single, auditable client story. Staff should be able to see what to do and when; management should understand progress and exceptions; a client payment should update the client's history, staff pipeline, balance, receipts, and any allocation eligibility from one approved transaction.

Do not introduce duplicate copies of meetings, tasks, clients, payments, or plots. Keep existing tables and workflows as the source of truth until their authorization and integrity have been proved. Derive read models for joined pages and reports instead of asking staff to re-enter the same facts in several apps.

## Verified starting point

### Operations Schedule

- The active personal calendar is `My Schedule` in `src/app/(main)/dashboard/operations/_components/my-schedule-screen.tsx`. It renders month, week, day, and agenda views using the existing FullCalendar integration. It supports task quick add, edit, delete/cancel, completion, drag rescheduling, recurrence, and a conflict warning.
- The active personal task hook writes `op_todos`; its columns include owner and assignee, title/notes, local date and time, status, recurrence lineage, completion/cancellation timestamps, and `sms_notified_at`.
- Meetings and invited attendees live separately in `schedule_items` and `schedule_item_invitees`; the calendar hook aggregates them in the UI. RSVP writes already use the constrained `respond_to_schedule_invite` RPC. Do not collapse meetings into `op_todos`.
- V2 has active `send-push` and `send-todo-alarms` Edge Functions and a minute cron for the alarm function. The alarm function reads `schedule_items` (`kind='todo'`) and sends only at start time. The active personal planner writes `op_todos`, so current planner tasks do not use that push path. The function computes the target clock in UTC, sends to existing push subscriptions only, and advances `push_notified_at` even when push credentials are missing or delivery fails.
- A separate minute cron invokes `send_op_todos_sms_reminders()`. Its current behavior sends a single SMS when a task is due, using a 15-minute catch-up window and a UTC date/time comparison; it does not implement user-selected lead times, a week-ahead task reminder, missed-task follow-up, retry/delivery evidence, or meeting reminders. It marks the task notified regardless of provider acceptance. Staff phone numbers are read from `profiles.phone`.
- The UI has a warning-level conflict lookup, but the plan still needs an all-source conflict model for meetings plus tasks, clear conflict resolution, and a management team/resource view. Reminder preferences and delivery history are not represented as first-class user-facing controls.

### Finance and client automation

- Finance uses `payments` tied to `leads`; an approved payment is posted by `approve_payment()`. That function locks the payment and lead, changes payment status, updates `leads.amt_paid`, balance, and stage, writes an activity/audit entry, notifies the salesperson in-app, and creates an `allocation_requests` row once the configured threshold (default 30%) is crossed. This is already a useful transactional foundation.
- A separate `flag_leads_due_for_allocation()` cron also creates requests for eligible leads and texts management/company recipients. Its recipients and message purpose need review against the requested salesperson notification; the approval RPC currently creates the request and in-app message to the salesperson but does not issue a salesperson SMS. The one-request-per-client invariant should be enforced in the database to close concurrent duplicate creation.
- `payments` contains approval state, amount/date, salesperson, client display name, receipt number/proof path, reference and correction fields. `leads` contains payment plan, totals/balance, contact, assigned salesperson, visit/stage and client details. `plots`, `plot_requests` and `allocation_requests` are existing inventory/allocation sources.
- The receipt PDF builder already exists at `src/webnext/features/payments/lib/receiptPdf.ts`. The shell modal at `src/app/(main)/dashboard/finance/_components/receipt-modal.tsx` can download a PDF, create a tokenized Storage-backed share link, and open a WhatsApp message. `ensure_receipt_number()` records receipt issuance in `receipt_log`; public link resolution is handled by the `get-receipt` function and the external `/receipt/[token]` route.
- The shell modal does not yet send a post-approval thank-you SMS or schedule monthly plan reminders. The `leads` row has a `payment_plan`, but `payments` has no explicit installment schedule or due-date ledger. A reminder cannot be safely inferred for every client from the current fields without a documented date rule, payment cadence, consent/opt-out state, phone validity, and idempotency record.
- The PDF builder accepts a `paidAsOf` snapshot, but the active Finance hook does not pass it. Reprinting an older payment receipt can therefore show the lead's current cumulative paid/balance instead of the totals immediately after that payment. Client email is currently hardcoded to `—`; payment date is rendered as a date-only value. The redesign phase must preserve the transaction-time balance snapshot and use verified profile/contact fields.
- Existing client details are spread across leads, activity logs, payment records, contracts, site visits, allocations, and client portal tables. Build the dedicated client record as a permission-scoped timeline and section view over those canonical records, not as another free-form client database.

## Product behavior and design references

Calendar reminders are distinct from event change notifications. A user's default reminder and per-item override should be private to that recipient, while invitation changes and RSVP state have their own workflow. Google Calendar documents these as separate event/reminder behaviors. On the web, durable alerts when the page is closed require an opted-in Push API subscription and active service worker; a timer in a page cannot guarantee delivery after the app closes. Use server scheduling as the clock, Push as a device notification channel, and SMS only as the separately consented fallback/channel policy. Never claim guaranteed delivery from the browser alone.

The product should borrow familiar patterns from Google Calendar (date navigation, month/week/day/agenda, fast event creation, private reminder controls), Todoist (clear Today/Upcoming, due dates, recurrence, priority and quick capture), Linear/Plane (work item context, assignee, project, status, activity and filters), and Stripe/standard accounting receipts (strong receipt identity, amount/currency, payer, date, method/reference, amount paid, balance, issuer/company details, and easy PDF access). Use source patterns and licensed assets; do not copy product branding or proprietary artwork. Pinterest may inform visual mood only; interaction behavior and factual design decisions come from product documentation and accessible source.

Key technical references:

- Google Calendar reminders and event notifications: https://developers.google.com/workspace/calendar/api/concepts/reminders
- Google Calendar event fields and time-zone semantics: https://developers.google.com/workspace/calendar/api/concepts/events-calendars
- MDN Push API (service-worker delivery while the app is not loaded): https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN Notifications API: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API
- Supabase Cron and Edge Function scheduling: https://supabase.com/docs/guides/functions/schedule-functions and https://supabase.com/docs/guides/cron
- Plane source (issues, project, filters): https://github.com/makeplane/plane
- Cal.com source (event scheduling and availability patterns): https://github.com/calcom/cal.com
- Stripe receipt/payment documentation: https://docs.stripe.com/receipts

## System model and data flow

```text
Operations task / meeting
  -> canonical task or event + recipient reminder preferences
  -> durable notification outbox (unique event, channel, recipient, scheduled time)
  -> server worker claims due rows with a lease
  -> Push / SMS provider -> attempts, provider result, retry or terminal state
  -> task becomes overdue only from its due/end time and remains auditable

Payment submission
  -> pending payment -> Management approval (existing atomic RPC)
  -> payment + client balance/stage + activity/audit + receipt number
  -> 30% threshold -> one allocation request + salesperson in-app/SMS alert
  -> receipt PDF snapshot -> secure tokenized download link -> client thank-you SMS
  -> unified client timeline joins lead, visits, contracts, payments, receipts,
     allocations, and staff activity without duplicating the source records

Monthly payment plan
  -> explicit next due date + monthly cadence and reminder opt-in
  -> one-week-before due outbox entry in Africa/Accra local calendar semantics
  -> SMS provider delivery outcome and retry audit
  -> approved payment advances next due date and cancels stale reminders
```

The outbox is the reliability boundary: unique idempotency key, state (`pending`, `processing`, `sent`, `retry`, `failed`, `cancelled`), attempt count, next retry, lease expiration, provider message ID/status, and a safe rendered-message snapshot. Claim a small batch atomically (`FOR UPDATE SKIP LOCKED` or equivalent RPC), send outside the database transaction, then persist outcome. Provider acceptance means accepted by provider, not delivered to handset; expose that distinction in delivery history.

## Phased build sequence

### Phase 0 — Release and baseline

1. Confirm the current Reports release is READY and test the production alias in Management and Staff roles; preserve the evidence in the reports verification plan.
2. Keep all work on an isolated branch based on current `rebuild`; never alter V1, root assets, or the user's unrelated edits.
3. Keep all data checks read-only until an isolated database is available. Live SMS must never be used as a test channel.

### Phase 1 — Schedule reminders, overdue workflow, and responsive calendar

1. Model reminder settings per recipient and per task/event: in-app, push, SMS eligibility, lead-time presets/custom minutes, quiet hours, and local time zone (`Africa/Accra` default). Owner and invited attendee preferences remain private; management cannot silently change staff personal preferences.
2. Define task reminder semantics (default one day before and at due time; missed follow-up after task end/due plus a reasonable grace window; repeat cadence and stop conditions). Make per-item overrides and staff defaults explicit. An assignee change cancels old-recipient notifications and schedules for the new assignee.
3. Route active `op_todos` and meetings through a durable server outbox. Push requires an explicit opt-in path, permission-state explanation, device list/revoke, service worker, and removal of expired endpoints. SMS requires a valid profile phone and a transparent staff preference/company policy. Do not fall back to paid SMS without consent/configuration.
4. Add worker audit, retry/backoff, rate limits, deduplication, cancel-on-edit/delete/reschedule, missed-task state/notification, delivery diagnostics, and a Management delivery-health view. Convert all stored dates and time windows through the named `Africa/Accra` time zone; test UTC date-boundary cases.
5. Improve Schedule UI: prominent Today/Upcoming/Overdue triage, quick-add with duration/reminder/assignee/project, conflict detection across tasks and meetings, keyboard accessible day/week/agenda, clear RSVP states, accessible event details, mobile agenda-first presentation, and manager team calendar with staff filter and overlap visibility.
6. Test synthetic tasks and meetings only: due reminders exactly once across retries, app closed push on real test device, SMS sandbox/provider test number, missed item escalation, reschedule cancellation, repeat instances, timezone boundary, manager invite/staff response/realtime synchronization, RLS and phone visibility. Report provider acceptance separately from device display.

### Phase 2 — Accounting client receipt and post-payment notification

1. Redesign the receipt as a polished, print-ready A4/Letter PDF with brand header, receipt number, issue timestamp, client identity/contact, plot/site and salesperson, payment date/method/reference, amount received, cumulative paid, contract amount, remaining balance, approval status, issuer, company registration/TIN/contact, terms/footer, and a readable thank-you. Use locale-correct GHS formatting, a clear payment summary hierarchy, accessible contrast, page-safe layout, and no missing-field blanks.
2. Produce the receipt from the approved payment snapshot and linked lead values at approval time, preserving the immutable receipt number and audit log. Keep the public token unguessable, expiring/revocable if appropriate, rate limited, and limited to that receipt PDF; never expose storage paths or general client history through the public endpoint.
3. Add post-approval receipt link creation and thank-you SMS using an idempotent event from `approve_payment()`. SMS text stays short, names the client, amount, receipt number, and secure link; link availability must be checked before sending. Handle invalid/missing phone, provider failure, retries, opt-out, and no duplicate thank-you on reprocessing.
4. Test the PDF in desktop/mobile preview and rendered pages at print size; verify totals against a synthetic approved-payment fixture. Test token access, revocation/expiry, unauthorized receipt IDs, and SMS in a sandbox. No live payment approval or client SMS is part of QA.

### Phase 3 — Monthly instalment dates and one-week client reminders

1. Replace ambiguous “monthly plan” text-only assumptions with an explicit, auditable `payment_schedule` or equivalent: lead/payment plan, expected amount/cadence, first-paid anchor date, next due date, start/end or payoff state, reminder consent/opt-out, and schedule history. Preserve existing `payment_plan` values during staged backfill and have Management resolve ambiguous rows.
2. Set the next due date to the same calendar day as the first installment in each month. For day 29–31, choose a written rule such as last valid day of shorter months; preserve “paid in advance” behavior and do not shift the schedule based on a late payment unless policy says so.
3. Schedule only monthly-plan client reminders seven days before due date, once per due cycle. Verify contact phone and consent; prevent duplicate SMS after job retries and suppress reminders for paid-off clients, non-monthly plans, opt-outs, or superseded due dates.
4. On payment approval, recalculate the ledger and next due date in the same transactional workflow. Pending/rejected payments do not advance the schedule. Management correction/reversal creates an auditable compensating entry and safely rebuilds reminders.
5. Test across month lengths, leap day, timezone, early/on-time/late payment, rejected and corrected payment, cancellation/opt-out, missing contact, provider retry, and duplicate cron executions using only synthetic client fixtures and a sandbox.

### Phase 4 — Client 360 record and cross-app synchronization

1. Build a permission-scoped `/dashboard/clients/[id]` record with an identity/summary header and stable sections for overview, contacts/KYC, site visits and the original staff-submitted form, pipeline/stage/owner history, contract and generated documents, payments and every receipt, allocations/plot assignment, tasks/meetings, notes/activity, and audit chronology. Show author, event time, source app and version; preserve historical values when names/ownership change.
2. Reuse `leads` as the current CRM entity and join canonical `activity_log`, `payments`, `receipt_log`, `receipt_share_links`, contract generation/draft records, site-visit records, `allocation_requests`, `plot_requests`, and `plots`. Inspect exact schema/RLS and existing client list/detail routes before building any adapter. Do not copy KYC or financial data into a broad denormalized JSON record.
3. Make payment approval the single source-of-truth transition: update balance/stage, salesperson pipeline summaries, payment history, 30% allocation request, in-app + SMS salesperson request, and client reminder schedule via atomic RPC/outbox. Use unique constraints/foreign keys for one current allocation request per qualifying lead and trace every automation to a source payment/event ID.
4. Allocation resolution must atomically reserve a compatible available plot, assign it to the lead/client, update inventory status, record actor/time/plot, write audit history, and notify staff. No automatic plot selection or reservation until Management approves eligibility/compatibility rules; the request itself may be created automatically at 30% as currently intended.
5. Keep each app page focused but cross-link through stable client ID and backlinks. Realtime should invalidate/refetch relevant summaries; outbox workers and SQL transactions remain authoritative. Show last-synced timestamps and an error/retry queue; never silently drop a partial cross-app update.
6. Validate manager and staff authorization for every section, including direct route/API/RPC access and signed receipt links. Staff see only assigned clients unless an explicit role permits company scope; mask phone/KYC where not needed. Verify all sync paths with a synthetic client end to end and ensure one event produces one history item, one allocation request, one receipt notification, and correct financial totals.

### Phase 5 — Reports, responsive/accessibility, and release

1. Extend existing Reports with schedule completion/on-time/missed and reminder-delivery metrics; Finance monthly collections, due/overdue, receipt and allocation conversion; client pipeline conversion, visit-to-contract/payment, allocation timing, staff workload and audit history. Every metric needs a definition, date basis, filter, comparison, source timestamp, and role scope.
2. Exports must use the selected filters/comparison and current role scope. Generate polished PDFs with cover/summary, KPI definitions, comparison and trend visuals, filtered detail/register pages, footnotes, page numbers, issue/period/as-of metadata, and no orphan headings or clipped wide tables. User-selectable section exports remain available beside full report.
3. Test desktop 1440/1024, tablet 768, and mobile 390/360; light/dark; keyboard, focus and screen reader labels; zero/large/long-name content; slow/network failure; session expiry; and manager/staff access. Run focused unit/database security tests, TypeScript, production build and actual PDF render inspection.
4. Release app-by-app from an isolated branch through a preview, verify the exact preview with Management and Staff, then merge only to `rebuild` per `docs/DEPLOY_INSTRUCTIONS.md`. Confirm Vercel deployment READY and hard-refresh the production alias; rerun critical role checks and record limitations. Never send live SMS or alter production business records to “prove” the flow.

## Questions to resolve from source data before schema implementation

The existing schema confirms `leads.payment_plan` but not a payment schedule ledger. At Phase 3, audit current plan values without exposing client names or phone numbers and preserve any real business terms. Confirm only if source data cannot reveal the intended rule: monthly due-day for first payments on days 29–31, required reminder consent/opt-out wording, and whether missed staff tasks should SMS the assignee only or also their manager. Until then, no automatic reminders are scheduled for clients and no SMS is sent.

## Release evidence ledger

| Slice | Evidence | State |
|---|---|---|
| Operations Reports | Branch `codex/operations-reports-release-current`, PR #15 merged to `rebuild` as `9bfdfb1`; Vercel production deployment `dpl_GADQ7YNLU9pTWCTwxgGrqfD3mdUt` Ready; Staff production view loaded with self-only data and active exports. | Management production account check still to repeat after deploy; both roles passed on exact preview previously. |
| Operations schedule urgency and conflicts | Added a calendar-independent 90-day overdue and 3-day due-soon queue, time-aware deadlines, clickable task details, and task/meeting overlap checks for timed and all-day work. Conflict checks include only meetings where the staff member is an organizer or invitee; query failures block the save instead of silently allowing a collision. The exact Vercel preview passed Management and Staff schedule views; Management saw the overdue item and a no-save 09:15–09:45 test correctly flagged its 09:00–09:30 meeting. Eight focused schedule and receipt tests pass locally. | Preview verified; no task or meeting was written. Not merged or deployed. Push/SMS delivery and device-closed behavior remain open. |
| Durable schedule reminders | Live schema/functions/cron inspected read-only; active planner writes `op_todos`, while the existing alarm job reads `schedule_items`; UTC handling and delivery-state gaps confirmed. Supabase branch creation returned “Branching is supported only on the Pro plan or above”; the only listed branch is the default production-linked branch. | No migration or production data write is safe to test here. Durable outbox, push preferences, retry/delivery audit, missed-task flow, and provider tests remain open until an isolated database is available. |
| Finance receipt accuracy | Reworked the receipt table to show payment date, method, reference, and amount received as separate values, so a partial installment is not presented as if it were the plot’s full contract price. The balance box now uses the approved-payment ledger through the selected payment's approval timestamp; older records without an approval snapshot clearly omit balance totals instead of borrowing today's balance. Snapshot unit tests pass. | Built on the feature branch and Vercel preview build is Ready. PDF download was not invoked against a real payment because it issues a receipt number and stores a receipt record. Rendered PDF visual inspection remains open. No SMS or schema change. |
| Client 360 visit and payment history | Exposed the stored staff-submitted site-visit form, follow-up notes, reschedule/cancellation trail, recording date, payment reference, receipt number, and approval date inside each client profile. Fixed Management's related-data reads to use the existing RLS-protected company-wide payment, visit, and complaint reads; Staff stays self-scoped. Live Management and Staff profiles load with their intended scopes; opening details is read-only. Live data exposed allocation timestamps rendered as “Invalid Date”; fixed the shared formatter to support both date-only and database timestamp inputs, and safely omit malformed values. | Feature branch changes are ready for a fresh preview. Ten focused schedule, receipt, and date-format tests pass. Existing allocations in the live sample profile still had no payment or visit rows; no data was written. Not merged or deployed. |
| Finance/client automation | Approval RPC and 30% allocation workflow inspected; monthly reminder ledger and successful-payment SMS outbox do not exist in the current schema. | Planned; no SMS or schema change. Cross-app synchronization remains open. |



