# Operations Schedule, Finance Receipts, and Client Record Automation

## 2026-10-26 personal task device reminder lead time — implementation plan

**Scope.** Give every active staff member a private default for the *device* alert before a timed task starts. Choices: at start (existing behavior), 15 minutes, 1 hour, or 1 day before. Management sets only its own preference. The company SMS due/missed policy, missed-task device follow-up, invited-meeting 15-minute alert, and per-task overrides remain separate phases. A device must still be opted in for an alert to arrive. Google Calendar's [private default and event override model](https://developers.google.com/workspace/calendar/api/concepts/reminders) guides the distinction; [MDN Push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) confirms the service worker/device subscription requirement. This does not promise handset receipt.

**Database and security.** Add a private per-agent preference table in `app_schedule_private`, keyed by `profiles.agent_key`, with a constrained minute value and server timestamp. No Data API table grant. Stable, authenticated RPC wrappers derive the active agent from `auth.uid()` and expose only their own value; the setter rejects unsupported values. The set operation adjusts only that recipient's queued/retry future task-due device events inside the same transaction. Already-sending events may have reached the push provider and cannot be recalled; sent history is immutable. If the desired advance point is already past but task start is future, queue immediately; if the start has passed, cancel the due alert. New task/assignment writes consult the recipient's preference before enqueuing. No client-supplied staff key is trusted. Preserve queue idempotency and the independent missed reminder.

**Worker and UI.** Store the chosen lead time on each device outbox event so the worker can validate its timing against the task and show accurate 'coming up' wording. Keep the source task, assignee, status, signature and recipient checks. Add a compact preference card on My reminder activity, with current value, four explicit options, Save, disabled/loading/error/success states, and plain language that this changes device alerts only. Use existing shadcn Card/Select/Field/Button components and theme tokens. At phone widths, the selector and action stack without horizontal overflow. No new app-wide settings route.

**Verification/release.** Inspect the live V2 schema and pending queue first. Use a rollback-only SQL fixture for two agents: owner read/write, cross-owner denial, future rescheduling, immediate reminder, past task cancellation, no missed/sent changes and invalid value rejection. Check Management and Adams in an exact Vercel preview, including save and refresh; restore each account's original setting after QA. Do not opt in a device or send SMS/push for this verification. Apply the migration only to V2, deploy the updated push worker, then release only to `rebuild` after the preview works. Confirm exact READY production deployment, refresh both roles and verify the saved preference. A physical closed-app device test and per-task override are still outstanding.

## 2026-10-26 personal device control slice

The next bounded Operations release makes the existing push opt-in manageable across
devices. My reminder activity will list the signed-in staff member's registered
browsers with a plain browser/platform label, registration date, and
an indicator for the current browser. A staff member can revoke any one of their
registrations after an explicit confirmation. The list will never render a push
endpoint or encryption key. `last_seen_at` currently defaults at registration and
is not refreshed by the worker, so the UI must not imply it proves recent device
activity. The existing RLS owner policy remains authoritative; client queries
also filter by the authenticated profile key. A successful database
removal stops the server worker from sending to that registration. If the current
browser is revoked, it will additionally unsubscribe locally. A remote browser's
permission cannot be changed from this screen, but revisiting its Schedule will
detect its unowned subscription and clear it before any new opt-in.

States: unsupported push browser, no devices, loading, read error, deletion in
progress, and confirmation. Refresh updates activity and devices together. The
control stays below delivery activity to keep the primary history readable on a
phone; rows stack and action labels remain unambiguous at 320–360 px. Management
gets the same **personal** controls and cannot manage other staff devices here.

The implementation uses the existing `push_subscriptions` RLS, so it adds no new
database grant or public endpoint. Verify owner isolation with Management and
Staff, test the empty live state without enrolling a real device, and use an
isolated rollback-only database check for other-owner deletion. Do not send a
test push or SMS. A physical opt-in and closed-app delivery test remains separate.
This follows the [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
subscription lifecycle and [Google Calendar's private notification settings](https://support.google.com/calendar/answer/37242?hl=en).

## 2026-10-26 personal reminder activity slice

The due/missed SMS and task/meeting push outboxes already keep delivery state,
but Staff currently cannot inspect their own results. This phase adds a read-only
personal activity page from My Schedule. It combines the latest 30 SMS and device
events, shows scheduled Ghana time, a safe status and the number of registered
devices. A signed-in, active staff profile may see only events addressed to its
own agent key. Phone numbers, message content, push endpoints, provider IDs and
raw errors remain private. Management sees its own history on this page and
retains the separate company SMS health screen.

The screen distinguishes a queued reminder from provider acceptance and explains
that acceptance does not prove an alert appeared on a handset. It includes
empty/error/loading states, a refresh control and a return path to My Schedule.
No message is sent by this read-only feature. Later phases still need recipient
preferences, per-item overrides and physical-device receipt testing. Google's
[reminder model](https://developers.google.com/workspace/calendar/api/concepts/reminders)
supports private per-user defaults and event overrides; Palmstead's existing
outbox timing stays fixed in this phase.

Preview QA uncovered queued device alarms for a task already hard-deleted by a
prior test. A follow-up migration cancels pending SMS/device rows on task delete
and marks earlier orphaned pending rows cancelled while preserving their history.
The worker still rechecks source data before sending; a delete racing a provider
call already in flight cannot recall that provider request.

## 2026-10-26 find a meeting time slice — design before implementation

The next scheduler action will offer up to five same-day alternatives from the
selected date, preserving the proposed meeting duration. Suggestions use
Africa/Accra local time, half-hour starts inside the stated 09:00–18:00 working
window, and never offer a start in the past. They exclude the meeting being edited,
require the organizer to be free, and rank fewer busy invitees before proximity
to the requested start. Invitee conflicts remain advisory; the existing explicit
acknowledgement is still required if a suggested slot has busy invitees.

The suggestion RPC will return only the time and counts of busy invitees, not
their event titles or client/task details. It will require an active staff account,
validate the selected staff, and allow a non-manager to request suggestions only
for their own calendar. The form must show loading, empty and error states, and
applying a suggestion must re-run the existing availability check and revoke an
earlier busy-invitee acknowledgement. The transactional database write guard stays
authoritative if availability changes after the suggestion appears.

Google Calendar's [Find a time](https://support.google.com/calendar/answer/6294878?hl=en)
compares guest availability without making private event details necessary for
the booking choice. Its [event model](https://developers.google.com/workspace/calendar/api/concepts/events-calendars)
distinguishes the organizer and attendees. This phase adapts that interaction to
Palmstead's current `op_todos`, `schedule_items` and invitation model; room
availability, working-hours preferences, holidays and multi-day search remain
separate work. The open-source [Cal.com source](https://github.com/calcom/cal.com)
is the broader booking-flow reference, not a literal dependency in this slice.

## 2026-10-25 transactional organizer booking guard

The meeting form's last-second availability check still allowed two browser sessions
to pass together. V2 now takes a transaction-scoped PostgreSQL advisory lock for the
staff member and Africa/Accra calendar date before every active task or meeting
booking write. Both tables use the same lock and compare half-open time intervals.
The rule protects the task assignee and meeting organizer, including direct table
writes; it does not force invitees to be free. Cancelling or completing an item
releases its slot, and unrelated edits to an existing active row do not revalidate
historical conflicts. The UI retains its privacy-safe busy counts and explicit
busy-invitee choice. A database conflict returns a plain scheduling error in the
existing create/edit dialog instead of silently booking a second item.

V2 schema inspection found one active to-do, no active meetings and no existing
meeting/task organizer overlaps before the migration. Rollback-only SQL exercised
overlapping meeting creation, task time edit, adjacent slots, title edit, and
cancel-then-rebook. No live business row or SMS was changed. The remaining follow-up
is to test simultaneous saves from separate sessions and add free-time suggestions
to the planner. This guard does not reserve invitees or physical meeting rooms.

PostgreSQL documents [transaction advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)
and [range exclusion constraints](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT).
An exclusion constraint over one table cannot cover both existing task and meeting
sources without a new shared reservation table, so this narrow phase uses a common
transaction lock in both write triggers. The existing open-source
[Cal.com scheduling project](https://github.com/calcom/cal.com) remains the broader
availability and booking-flow reference for later team planning.

## 2026-10-25 meeting availability slice

Google Calendar compares the organizer and guests' availability when choosing a meeting
time, while keeping private event details hidden according to permissions. Palmstead's
task editor already checked collisions; the meeting composer, time editor, and invitee
editor did not. The new `check_schedule_meeting_availability` RPC reads task and meeting
intervals for selected active staff and returns only busy counts. Half-open time ranges
allow adjacent slots, declined invitations do not make a staff member busy, and the
edited meeting is excluded from its own check. The composer and meeting editors show
busy staff, prevent an organizer from selecting an overlapping slot, and require an
explicit choice before inviting or rescheduling a busy attendee. Each save rechecks
availability. Removing an invitee does not require a new availability check.

This is a scheduling warning and organizer guard in the application, not a serializable
booking lock. Concurrent writes or direct database clients could still make overlapping
items. A later phase should move the organizer invariant into one transactional write
path and add a free-time suggestion view. Verify the Management and Adams UI flows on
preview and production, including a temporary overlap, before calling this slice complete.

Preview QA exposed a delegated-task ownership error: a task assigned to Adams marked
Management busy merely because Management created it. The follow-up migration counts
tasks for their assignee, and the task editor's existing conflict query now uses the
same rule. Temporary Adams and Management tasks proved the attendee warning and
organizer block in the browser; both QA tasks were deleted immediately afterward.

References: [Google Calendar Find a time](https://support.google.com/calendar/answer/6294878?hl=en-uk),
[Google Calendar private and busy events](https://support.google.com/a/users/answer/9282964?hl=en),
and the open-source [ai-calendar conflict and availability design](https://github.com/damanjz/ai-calendar).

## 2026-10-25 device reminder account check

The older push assessment below predates the task and meeting outbox migrations. The active
`send-todo-alarms` function now handles `op_todo_push_outbox` due/missed events and
`op_meeting_push_outbox` invited-meeting events, in addition to legacy schedule items.
The minute cron is active, and recent HTTP responses returned 200 with both queues empty.
No device is currently opted in, so handset delivery has not been established.

The schedule control previously treated any browser subscription as enabled for the current
staff account. On a shared browser, that could show the wrong status and leave a previous
account's endpoint active. This slice gives authenticated staff SELECT access only to their
own `push_subscriptions` rows, checks the current endpoint against the signed-in agent key,
and revokes an endpoint that is not registered to that agent before offering opt-in. Turning
off reminders now confirms a row was actually removed before revoking the browser endpoint.
Task and meeting wording now matches the active worker.
The browser permission request also has a bounded wait: browsers that leave the permission
prompt unanswered return an actionable retry message instead of a permanently busy button.

The migration was applied only to V2 as `20261025183443_operations_push_subscription_owner_read`.
Rollback-only SQL inserted two temporary endpoint rows and verified that Adams and Management
could each see only their own row; the temporary rows were absent afterward. This verifies
database isolation, not push receipt on a physical device. Remaining validation: opt in a
supported real browser, schedule a harmless test task and invited meeting, observe due/missed
notification behavior with the app closed, then remove the test items and subscription.

**Status: phased implementation in progress.** This plan covers the next linked product slice across Operations, Finance, CRM, allocations, and plot inventory. It is based on review of the V2 source tree and connected V2 Supabase project `sbydzrlzqxcdbudjaube`. The missed-task reminder outbox and worker are live. No synthetic tasks, client records, or real SMS messages were used during verification.

## Outcome

Make Palmstead a coordinated work system with trustworthy reminders, accurate payment records, and a single, auditable client story. Staff should be able to see what to do and when; management should understand progress and exceptions; a client payment should update the client's history, staff pipeline, balance, receipts, and any allocation eligibility from one approved transaction.

Do not introduce duplicate copies of meetings, tasks, clients, payments, or plots. Keep existing tables and workflows as the source of truth until their authorization and integrity have been proved. Derive read models for joined pages and reports instead of asking staff to re-enter the same facts in several apps.

## Verified starting point

### Operations Schedule

- The active personal calendar is `My Schedule` in `src/app/(main)/dashboard/operations/_components/my-schedule-screen.tsx`. It renders month, week, day, and agenda views using the existing FullCalendar integration. It supports task quick add, edit, delete/cancel, completion, drag rescheduling, recurrence, and a conflict warning.
- The active personal task hook writes `op_todos`; its columns include owner and assignee, title/notes, local date and time, status, recurrence lineage, completion/cancellation timestamps, and `sms_notified_at`.
- Meetings and invited attendees live separately in `schedule_items` and `schedule_item_invitees`; the calendar hook aggregates them in the UI. RSVP writes already use the constrained `respond_to_schedule_invite` RPC. Do not collapse meetings into `op_todos`.
- V2 has active `send-push` and `send-todo-alarms` Edge Functions and a minute cron for the alarm function. The alarm function reads `schedule_items` (`kind='todo'`) and sends only at start time. The active personal planner writes `op_todos`, so current planner tasks do not use that push path. The function computes the target clock in UTC, sends to existing push subscriptions only, and advances `push_notified_at` even when push credentials are missing or delivery fails.
- The minute cron now queues due-time reminders (15-minute catch-up window) and missed-task follow-ups into the same idempotent outbox; the service-role worker checks the task and assignee, waits until the due time or end-time plus the configured missed grace period, and only records `sms_notified_at` / `sms_missed_notified_at` after provider acceptance. Explicit rate limits retry; ambiguous provider outcomes require review. Staff numbers are read from `profiles.phone`. No real SMS was sent to test this path.
- Management has a new `/dashboard/operations/reminders` delivery-health page: scheduler freshness, queue counts, recent due/missed status and safe explanations; phone numbers, message bodies, provider IDs, and raw provider errors are withheld. The manager gate is enforced in the RPC as well as the UI. Staff direct access is denied and returns them to My Schedule. The preview was checked in both roles; the worker reported a successful recent run and an empty queue, consistent with the live test data. Provider acceptance is explicitly distinguished from handset delivery.
- The UI has a warning-level conflict lookup, but the plan still needs an all-source conflict model for meetings plus tasks, clear conflict resolution, and a management team/resource view. Reminder preferences and delivery history are not represented as first-class user-facing controls.

### Finance and client automation

- Finance uses `payments` tied to `leads`; an approved payment is posted by `approve_payment()`. That function locks the payment and lead, changes payment status, updates `leads.amt_paid`, balance, and stage, writes an activity/audit entry, notifies the salesperson in-app, and creates an `allocation_requests` row once the configured threshold (default 30%) is crossed. This is already a useful transactional foundation.
- A separate `flag_leads_due_for_allocation()` cron also creates requests for eligible leads and texts management/company recipients. Its recipients and message purpose need review against the requested salesperson notification; the approval RPC currently creates the request and in-app message to the salesperson but does not issue a salesperson SMS. The one-request-per-client invariant should be enforced in the database to close concurrent duplicate creation.
- `payments` contains approval state, amount/date, salesperson, client display name, receipt number/proof path, reference and correction fields. `leads` contains payment plan, totals/balance, contact, assigned salesperson, visit/stage and client details. `plots`, `plot_requests` and `allocation_requests` are existing inventory/allocation sources.
- The receipt PDF builder already exists at `src/webnext/features/payments/lib/receiptPdf.ts`. The shell modal at `src/app/(main)/dashboard/finance/_components/receipt-modal.tsx` can download a PDF, create a tokenized Storage-backed share link, and open a WhatsApp message. `ensure_receipt_number()` records receipt issuance in `receipt_log`; public link resolution is handled by the `get-receipt` function and the external `/receipt/[token]` route.
- The shell modal does not yet send a post-approval thank-you SMS or schedule monthly plan reminders. The `leads` row has a `payment_plan`, but `payments` has no explicit installment schedule or due-date ledger. A reminder cannot be safely inferred for every client from the current fields without a documented date rule, payment cadence, consent/opt-out state, phone validity, and idempotency record.
- Payment approvals now save cumulative paid and balance snapshots in the same transaction as the lead update. A database trigger captures the contract total at approval; receipt flows consume these values instead of today's client balance. Approved rows that existed before snapshots were introduced are marked as reconstructed, and their receipts omit historic balance totals rather than presenting reconstructed values as exact. The data audit found ledger-derived totals that differ from the current client totals, so historical balances cannot safely be inferred for every old receipt.
- The receipt now presents the payment method, transaction reference, and amount received as separate fields; it no longer pairs an installment amount with the full plot price as a unit-price table. Customer email is not present on the canonical `leads` table, so it is omitted rather than printed as a blank. Remaining receipt work includes secure thank-you delivery, issue timestamp/issuer refinements, and richer client/plot context where canonical data exists.
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

**Progress (2026-10-24):** Reliable due-time and missed-task SMS delivery now share the outcome-tracked outbox; Management can inspect scheduler and delivery health. Verified in a preview build after the concurrent Company Leads release was included: Management saw the running worker and empty queue, while Staff could use My Schedule and could not access delivery records. This delivers the delivery-history/operator visibility portion of Phase 1. Still outstanding: replace/extend the legacy browser push path for canonical `op_todos`, reminder preferences, push subscription lifecycle, invite/meeting reminder controls, cross-source collision resolution, and management team planning. No live SMS or task writes were used.

1. Model reminder settings per recipient and per task/event: in-app, push, SMS eligibility, lead-time presets/custom minutes, quiet hours, and local time zone (`Africa/Accra` default). Owner and invited attendee preferences remain private; management cannot silently change staff personal preferences.
2. Define task reminder semantics (default one day before and at due time; missed follow-up after task end/due plus a reasonable grace window; repeat cadence and stop conditions). Make per-item overrides and staff defaults explicit. An assignee change cancels old-recipient notifications and schedules for the new assignee.
3. Route active `op_todos` and meetings through a durable server outbox. Push requires an explicit opt-in path, permission-state explanation, device list/revoke, service worker, and removal of expired endpoints. SMS requires a valid profile phone and a transparent staff preference/company policy. Do not fall back to paid SMS without consent/configuration.
4. Add worker audit, retry/backoff, rate limits, deduplication, cancel-on-edit/delete/reschedule, missed-task state/notification, delivery diagnostics, and a Management delivery-health view. Convert all stored dates and time windows through the named `Africa/Accra` time zone; test UTC date-boundary cases.
5. Improve Schedule UI: prominent Today/Upcoming/Overdue triage, quick-add with duration/reminder/assignee/project, conflict detection across tasks and meetings, keyboard accessible day/week/agenda, clear RSVP states, accessible event details, mobile agenda-first presentation, and manager team calendar with staff filter and overlap visibility.
6. Test synthetic tasks and meetings only: due reminders exactly once across retries, app closed push on real test device, SMS sandbox/provider test number, missed item escalation, reschedule cancellation, repeat instances, timezone boundary, manager invite/staff response/realtime synchronization, RLS and phone visibility. Report provider acceptance separately from device display.

### Phase 2 — Accounting client receipt and post-payment notification

**Progress (2026-10-24):** Added approval-time paid, balance, and contract snapshots; marked all pre-existing approved rows as legacy/reconstructed; corrected the installment detail row; and visually reviewed synthetic A4 PDFs both with exact snapshots and with missing historic snapshots. No payment was approved and no SMS was sent for QA. Thank-you SMS with a receipt link and its retry/outbox path remain open.

1. Redesign the receipt as a polished, print-ready A4/Letter PDF with brand header, receipt number, issue timestamp, client identity/contact, plot/site and salesperson, payment date/method/reference, amount received, cumulative paid, contract amount, remaining balance, approval status, issuer, company registration/TIN/contact, terms/footer, and a readable thank-you. Use locale-correct GHS formatting, a clear payment summary hierarchy, accessible contrast, page-safe layout, and no missing-field blanks.
2. Produce the receipt from the approved payment snapshot and linked lead values at approval time, preserving the immutable receipt number and audit log. Keep the public token unguessable, expiring/revocable if appropriate, rate limited, and limited to that receipt PDF; never expose storage paths or general client history through the public endpoint.
3. Add post-approval receipt link creation and thank-you SMS using an idempotent event from `approve_payment()`. SMS text stays short, names the client, amount, receipt number, and secure link; link availability must be checked before sending. Handle invalid/missing phone, provider failure, retries, opt-out, and no duplicate thank-you on reprocessing.
4. Test the PDF in desktop/mobile preview and rendered pages at print size; verify totals against a synthetic approved-payment fixture. Test token access, revocation/expiry, unauthorized receipt IDs, and SMS in a sandbox. No live payment approval or client SMS is part of QA.

### Phase 3 — Monthly instalment dates and one-week client reminders

**Progress (2026-10-24):** The monthly schedule ledger, Ghana-time seven-day reminder queue, consent checks, payment allocation triggers and internal worker are active in Supabase. Management and Staff both signed into the ready Vercel preview; Management can preview a client schedule but cannot save until contract terms are confirmed, and Staff sees their own assigned-client schedule area without management controls. Month-end clamping was checked against live Postgres; the outbox is empty, no schedules were created and no reminder SMS was sent. The Finance UI changes are in PR #20 pending production promotion.

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
| Operations schedule urgency | Added a calendar-independent 90-day overdue and 3-day due-soon queue, time-aware deadline sorting, clickable task details, and focused tests. Current branch commit `501b413`; PR #16 draft. Vercel preview H4hz5r1y… is Ready. Management loaded the `My Schedule` tab and saw an overdue task alert; opening it displayed the task detail without saving. Staff loaded the same tab and saw only their own empty schedule. At 390px, both previews had `documentElement.scrollWidth === innerWidth`. Unit tests cover timed overdue, upcoming, all-day, and completed tasks. | Preview verified for both roles; no task was created, completed, changed, or deleted. Not merged or deployed to production. Real reminder delivery remains open. |
| Durable schedule reminders | Production Supabase outbox migration `20261024102956_operations_task_reminder_delivery` and Edge Function `process-op-todo-missed-sms` v2 are active. The worker sends one follow-up after a timed task's end (or start) plus the configured grace, rechecks the task/assignee, uses Ghana number validation, and records accepted/failed/review/retry outcomes. Unauthenticated smoke request returned 401; 18 focused schedule/reminder tests pass. No live SMS or synthetic production task was used. | Live first slice; user-level lead-time preferences, push opt-in for closed-app device alerts, meeting reminders, delivery-health UI, and provider sandbox test remain open. |
| Finance/client automation | Approval RPC and allocation threshold workflow inspected; receipt PDF/share-link infrastructure verified in source; no monthly schedule ledger found in queried tables. | Planned; no SMS or schema changes. |




