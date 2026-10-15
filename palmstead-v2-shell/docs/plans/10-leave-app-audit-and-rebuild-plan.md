# Leave app: full audit and rebuild plan

**Status: first implementation slice releasing; full rebuild still in progress (15 October 2026).** The V2 database migration and `process-leave-sms-outbox` worker are deployed to `sbydzrlzqxcdbudjaube`. The first scheduled run succeeded and the worker returned HTTP 200 with an empty queue. The matching web release is building on Vercel; do not infer production UI verification from these backend checks.

### Release evidence and remaining work

- Production Next.js build completed locally, including TypeScript and route generation. Build ID: `LD2-XF99F0-VN3njOawdu`. The constrained shell ran out of memory; the same build succeeded outside that sandbox with two compiler threads.
- Synthetic domain/provider checks passed. Both migration drafts compiled in isolated PostgreSQL (PGlite), with 23 privacy, quota, transition, notification and worker-lease checks passing. These did not send SMS or modify shared records.
- Connected V2 read checks confirmed Adams sees two owned requests and zero other-staff requests; Management sees all three existing requests. Staff have neither table SELECT on the SMS outbox nor EXECUTE on its claim function.
- Management and Adams signed in to the local production build in separate browser stores. Management requests and the company-wide 20-day setting loaded; a fractional allowance was rejected without saving. Staff balance loaded as 16 of 20 days with four reserved. Operations reports loaded both company and staff-scoped views.
- Management request list inspected at a 390px phone viewport. Four synthetic PDF examples were rendered and inspected (approved, amended, long emergency and 20-day plan), including continuation pages and signature order.
- Supabase security advisors were run. The outbox intentionally has no client policy and no client grants; service-role access is private. Existing wider project findings, including the staff-directory view and other public RPC grants, require a separate audit. Do not label the entire project security-clean.
- Pending: live Vercel hard reload and both-account checks; complete mutation/synchronization tests with clean test data; actual handset SMS/provider delivery evidence; Management reminder-health/recovery UI; immutable letter/signature revisions; robust legacy-date handling; authoritative Ghana holiday maintenance; Leave reports, then Attendance reports. Do not call the full Leave rebuild finished.
- Backend rollback: pause only job `leave_auto_submit_and_sms_outbox` using `cron.alter_job` and its current job ID; retain the outbox and owner-scoped policies. Existing `leave-reminder-7am` is the older approved-leave reminder and has not been removed.
This document supersedes the leave workflow assumptions in `04-leave-full-app-build-plan.md` where they conflict with the live schema audit or the user's latest clarification. It extends `09-leave-letters-rebuild-plan.md`; the letter editor and adjusted-date display already committed there remain part of the baseline.

## 1. Product brief and confirmed policy

Palmstead Leave is the company's annual leave planning, request, approval, calendar, evidence, and communication system. It must support both everyday staff use and Management's company-wide decisions. Staff can reserve dates early, understand the effect on their annual balance, and see one authoritative current plan. Management can see upcoming coverage, make a decision, and leave a traceable record. A change should reach both systems without staff refreshing a page or relying on a text message as the only record.

The user's clarification is authoritative: **the current policy is 20 annual leave days per staff member per calendar year, with one company-level Management setting to change that annual number for everyone if company policy changes.** It is not a per-person allowance editor and it is not a one-time grant. Keep the one pooled annual category and the separate emergency flow. Do not invent sick, casual, unpaid, or other leave categories. Preserve the existing rule that planned, pending, approved, and rescheduled days reserve entitlement; distinguish reserved days from confirmed-used days. Emergency leave requires a reason and Management approval and may override colleague overlap.

The requested planned-leave automation is also authoritative: if a staff member has saved planned annual leave, seven days before its start the system must create a visible Management decision item and send the staff member and Management an SMS reminder. Management then approves, reschedules to replacement dates, or declines. A reschedule must write the replacement dates into the active staff plan and notify the staff member in-app and by SMS. The letter and decision history remain auditable.

## 2. Scope and explicit exclusions

This is a V2-only rebuild of the Leave module inside `palmstead-v2-shell/`, against Supabase project `sbydzrlzqxcdbudjaube`. It includes staff and Management screens, database functions and policies, reminders and message delivery, annual settings, conflict checks, letters, calendar, history, and QA. It does not change the V1 single-file app, the V1 Supabase project, unrelated apps, staff biodata source, or production policy without a reviewed migration. Do not deploy before Management and Staff have both been verified and `docs/DEPLOY_INSTRUCTIONS.md` has been read in full.

AI must not decide who receives leave, change balances, identify a collision as acceptable, or generate legal/official letter terms. The workflow is deterministic, with Management as the decision-maker. AI is not necessary for the core Leave product; a future help/explanation assistant would be separately scoped and could never execute an approval.

## 3. What was inspected

The audit covered the active Next.js V2 route tree under `src/app/(main)/dashboard/leave/`, the WebNext leave feature under `src/webnext/features/leave/`, data-source and mapper interfaces, existing plan documents, V1's original leave flow in Git history, the active user-facing production Management dashboard/settings, and the V2 Supabase table/policy/cron state previously read from the project. It also inspected source files from the public ComCal GitHub project and compared Google's documented calendar sharing and free/busy patterns. No production records were changed.

The live Management settings screen currently renders “Every staff member's pooled annual entitlement. One number, company-wide” and has a 20-day stepper. This matches the confirmed company rule; keep it. The live Management page has seven active staff, a small leave table, emergency status, a team calendar link, and a settings link. The staff landing screen shows a balance summary and one month at a time. These are real pages rather than one giant page, but the state model and cross-account workflow are not yet strong enough for a company backbone.

## 4. Current system map

### App and data path

- Management entry: `/dashboard/leave/management`, with requests, calendar, and settings routes.
- Staff entry: `/dashboard/leave`, plan, requests, request detail/edit, new request, and emergency routes.
- Main client data source: `src/webnext/data/source.ts`, with feature queries and mutations in `src/webnext/features/leave/hooks/useLeaveRequests.ts`.
- Core calendar, quota, and collision rules: `src/webnext/features/leave/lib/leaveLogic.ts` and the shared Ghana holiday helper.
- PDF path: `src/webnext/features/leave/lib/leaveLetterPdf.ts` and its hook/component consumers.
- Source of phone and staff identity: `public.profiles.phone` (and `whatsapp` as a legacy secondary field). The new workflow should use the staff biodata phone field as the source and should not require a second phone entry in Leave settings.
- Current live reminders: a daily `send_leave_reminders` cron checks approved requests at five and one days before. It does not promote a planned leave to Management at seven days. A queued HTTP request is treated as “sent” before the SMS provider result is known.

### Existing logic to preserve unless a user-visible policy change is approved

- One annual quota, default 20 days for each staff member, set globally in Management settings.
- Ghana working-day rules: weekdays count, weekends and public holidays are excluded; Management maintains Eid windows and ad-hoc company closures; configured Eid observers retain the existing exception.
- Planned, pending, approved, and rescheduled entries reserve days. `used_confirmed_at` is a separate confirmation after leave ends; reserved is never presented as confirmed used.
- Collision is date overlap, not adjacency. Emergency leave is the explicitly documented colleague-overlap exception and still requires a reason and approval.
- Leave letters are deterministic applicant-authored/form text, not AI prose. Management's signature is recorded only after Management acts.

## 5. Detailed findings and failure modes

### 5.1 Schedule and status mismatch

`leavePlannedDueSoon()` only returns a local UI nudge. The user requested a reliable automatic event one week before planned leave. Current `useSendPlannedLeave()` requires the staff member to press a button, and only that browser mutation notifies Management. If the employee does nothing or never opens the app, Management receives no request. The daily cron only considers `approved` rows at +5/+1 days, so it cannot satisfy the week-before approval workflow.

### 5.2 Reschedule is not a synchronized plan change

Current Management reschedule with replacement dates writes them into `leave_requests.dates`, changes status directly to approved, and signs immediately. Without replacement dates, it sets `rescheduled` but leaves the old dates in the row; the staff member has to choose again. This splits the requested outcome across two meanings and risks a stale plan or an implicit approval. The current client hook sends SMS fire-and-forget, stores no reliable delivery state, and does not create a guaranteed staff in-app notification. A letter's original request dates must not be silently rewritten; the approved replacement schedule should be a clearly identified amendment/addendum.

### 5.3 Security and privacy are enforced in the wrong layer

The live `leave_requests` SELECT RLS predicate is `auth.uid() is not null`. The V2 screen filters some `planned` rows client-side and comments describe planned drafts as private, but any signed-in user with Data API access can read all row fields, including reason, letter text, and reschedule notes. This is not privacy. The older `src/openhr` copy contains a comment claiming RLS is already owner-or-manager-scoped; that comment conflicts with the live policy. The live policy wins. Realtime subscriptions must also be audited after policy repair, because a secure page is not enough if Postgres changes are emitted to an unauthorized client.

### 5.4 Availability and conflict correctness

The UI currently calculates overlap from a company-wide request list. The client checks are advisory and can race: two employees can both check an open date and submit at almost the same time. Server-side request creation, Management approval, and reschedule need the same authoritative validation and transaction boundary. Staff need to know that a date is unavailable without receiving a colleague's private reason or letter. Management needs names and operational detail in the team view. Existing calendar and V1 logic checks exact overlap only; preserve that unless the user later asks for a minimum-staffing threshold.

### 5.5 Entitlement presentation

The 20-day company setting is correct per the user's clarification. The code already counts blocking statuses against each individual staff member's requests, but the global setting is the only entitlement value. Verify every card/report says “available,” “reserved,” and “confirmed used” consistently. `LeavePlanScreen` currently says planned days do not count until sent, while its calculation reserves planned days immediately. Correct this contradiction. Prevent duplicate or over-limit annual bookings server-side as well as in the date picker. Preserve Management's existing exceptional `deduct_quota` decision where applicable.

### 5.6 Notifications and messaging are best-effort

`useCreateLeaveRequest`, `useSendPlannedLeave`, decisions, and reschedules catch or discard SMS/in-app notification failures. An SMS send call returning is not proof that a phone carrier accepted delivery. The scheduled reminder marks a timestamp after HTTP enqueue, not after the SMS function/provider reports success. There is no robust outbox with deduplication, attempt counts, delivery status, or retry window. Manager and staff phones should come from profile biodata, be normalized/validated, and have a clear missing-number state. Avoid duplicate Management texts where the company number is also a manager number.

### 5.7 Staff synchronization and audit completeness

React Query invalidation is local to one browser. A second staff browser requires a tested Supabase Realtime event or a bounded refetch. Status history exists in `leave_request_logs`, but it logs status transitions only, not all meaningful date changes, message attempts, or reminder delivery. Client side audit logs are fire-and-forget. Canonical change history should be written transactionally in the database; notification attempts should be separately observable.

### 5.8 Letter quality and correctness

There is already a deterministic PDF and a manager signature flow. The existing letter work restores review/edit and clarifies the newly approved schedule. Full audit must verify paper dimensions, margins, text wrapping, page breaks, date ordering, request ID/reference, original requested schedule, approved/rescheduled dates, signatures, and empty or long-form behavior. Company identity currently includes hard-coded brand/location text in the PDF header. Confirm exact company/address/logo/signatory fields before changing official copy; use configured values where already authoritative. Never imply a signature exists before approval. Letters need a preview before download and a stable historical snapshot so reprinting a past decision does not change after brand settings are edited.

### 5.9 UI, accessibility, and responsive behavior

The live screens exist, but list/table-heavy views need real narrow-screen designs, visible pending actions, search/filter/date range controls, and useful empty/error/loading states. A manager must be able to reach due-soon decisions quickly; staff must see their plan, balance, request state, change reason, and next action without decoding hidden status labels. Test keyboard operation, labels, focus, contrast, 200% text zoom, and responsive layouts. On calendar views, retain context when changing month/year and surface available/conflicting dates without relying on color alone.

## 6. Reference research and what to adopt

### Google Workspace Calendar

Google Workspace documents shared organizational calendars with a free/busy-only option or full event details, team calendars for leave/deadlines, and a “Find a time” flow that checks invited attendees' availability. Adopt the product principles: one recognizable calendar, availability surfaced before commitment, separate detail visibility from availability visibility, and shared team schedule with clear ownership. Do not copy Google UI or imply that Palmstead is a full meeting scheduler. Reference: [Google Workspace: share calendars and find available times](https://support.google.com/a/users/answer/11617205?hl=en).

### Open-source source inspection: ComCal

Inspected `nkelly-axela/ComCal` source `src/App.jsx`, `src/components/LeaveAdminPanel-2.jsx`, `src/components/LeaveUserPanel.jsx`, and `src/components/LeaveCalendar.jsx`, not just its README. Useful patterns to adapt are a dedicated manager approval queue, searchable staff allowance management, explicit conflict flags, business-day preview, calendar/list alternatives, in-app history, and balance views. The project is a React/Vite SPA and its allowance model includes leave types, extras, role entitlements, and per-user adjustments that are outside Palmstead's policy. Its panel contains silent catch blocks, direct status updates and email side effects from the browser, inline style primitives, and no strong distinction between transaction success and notification delivery. Do not port its code or policy; use only relevant interaction patterns and retain Palmstead's routed Next.js shell and RLS-backed Supabase architecture. References: [ComCal source](https://github.com/nkelly-axela/ComCal), [ComCal app shell](https://github.com/nkelly-axela/ComCal/blob/main/src/App.jsx), [ComCal manager panel](https://github.com/nkelly-axela/ComCal/blob/main/src/components/LeaveAdminPanel-2.jsx), [ComCal staff panel](https://github.com/nkelly-axela/ComCal/blob/main/src/components/LeaveUserPanel.jsx).

### Visual reference scan including Pinterest

The scan included a Pinterest HR/B2B calendar dashboard pin and a Pinterest employee timesheet/leave management pin. They are inspiration only and not authoritative behavior. A useful visual direction is a calm paper-like canvas, compact durable tables, restrained status colors, clear date ranges, human staff chips, and calendar-to-request navigation. The Figr leave-management reference also emphasizes connected Calendar → Requests → Request leave → Review outcome, balances, away-today, pending requests, and explicit loading/error/permission/success states. The Behance time-off calendar concept emphasizes a filterable month grid and duration/approval context. Keep the result inside Palmstead's semantic design tokens. References: [Pinterest HR calendar inspiration](https://uk.pinterest.com/pin/dashboard-for-the-b2b-hr-product--525584219019713014/), [Pinterest leave dashboard pin](https://ph.pinterest.com/pin/353180795794089421/), [Figr Leave Management screen](https://figr.design/templates/leave-management), [Behance Employee Leave Calendar UI](https://www.behance.net/gallery/218858599/Employee-Leave-Management-Calendar-UI).

### Supabase platform guidance

Supabase RLS guidance says to write explicit per-operation policies, test both allowed and denied membership cases, and use a pinned `search_path` for `SECURITY DEFINER` functions. Supabase's current schedule-functions guidance recommends `pg_cron` + `pg_net` and keeping function authentication in Vault. Those align with a server-owned reminder worker, but the app must still record durable delivery outcomes and retry provider failures. Read before implementation: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [Supabase changelog](https://supabase.com/changelog). The changelog was checked on 2026-10-15; no Leave-specific platform feature changes the design. Supabase's public changelog currently includes a forthcoming November 10, 2026 TLS 1.2 cipher change; note it for the project's broader device compatibility review, not as a Leave-specific blocker.

## 7. Target user journeys

### Staff plans and submits

1. Staff opens Leave and sees the individual annual balance: 20 (or the current company setting), reserved, confirmed used, and remaining. Planned bookings are explicitly labelled “reserved” and show whether they are still private/planned or already with Management.
2. Staff opens the annual plan and chooses future weekdays. The picker calculates Ghana working days and shows company/colleague availability. It reports overlaps as a conflict without disclosing a colleague's private letter or reason.
3. Staff reviews the generated letter in an editable letter-review step, sees selected dates and the resulting reserve, and saves a planned booking. If dates are within the seven-day trigger window, the system clearly explains that it will immediately enter Management's queue or submit atomically.
4. Seven calendar days before the earliest planned leave date, the server atomically transitions the plan into Management's actionable queue and creates an in-app inbox item + outbox SMS jobs. It sends the staff and all configured Management recipients one deduplicated reminder. It does not silently approve leave.
5. The staff view reflects the server status change and retains the letter and reference. A failed SMS displays a delivery issue to Management, not a false “sent” claim.

### Management decides

1. Manager dashboard puts due-soon requests, overdue undecided items, collision flags, emergency requests, and missing/invalid contact numbers in a prioritized queue.
2. Request details show the staff-authored letter, proposed dates, annual days, existing company calendar overlaps, reason, and audit trail. Private staff PII is role-scoped.
3. Manager approves, declines with a reason, or reschedules by selecting replacement dates. Replacement-date validation is the same server-side rule as staff scheduling. Reschedule is a proposed replacement awaiting staff acknowledgement only if company policy requires that acknowledgement; otherwise Management's confirmed date change updates the staff plan and is clearly labeled. **Default based on the user's wording:** Management chooses the replacement dates and confirms the reschedule; staff receives a notification and the plan immediately shows those dates. This is not an automatic approval of the original dates.
4. The decision creates a durable notification and SMS outbox record. Staff dashboard, request detail, plan calendar and downloadable letter reflect the exact same new dates and reason.

### Management configures policy

Management changes the single company-wide days-per-year setting in one controlled action. The preview states whether this affects only the current year or future years. **Default migration:** preserve existing `app_config.leave_total_days` as the active rule for new/unlocked years; snapshot the applicable quota on a year-specific policy record so a later change does not retroactively change a year whose leave has already been booked. This exact effective-date behavior must be verified against the current product/CONTINUE_HERE instructions before schema implementation. Eid windows, company closures, approved leave, and active plans continue to be editable through explicit pages and audit events.

## 8. Target data model and migration strategy

Do not rename or replace `public.leave_requests` casually; it is live and holds historical records. Add forward-only migrations after querying exact production schema and current triggers/policies, and test them on a local/Supabase branch first.

1. **Annual policy snapshots:** introduce `leave_year_policies` with year, days_per_staff, effective timestamp, editor, and audit metadata if the existing app_config global setting cannot safely preserve prior years. One policy row per leave year, not one per staff. Backfill the in-scope year from `app_config.leave_total_days`; retain app_config as the Management-editable default for future years only if backward-compatible.
2. **Workflow fields:** add explicit fields for planned start/automation eligibility, first reminder queued/sent status, decision outcome timestamp, and structured replacement date history; avoid overloading `reschedule_note` for all states. A normalized `leave_request_events` audit stream records creation, edit, auto-submit, approval, decline, reschedule, usage confirmation, and system actor events. Keep `leave_request_logs` compatible or extend it without duplicating conflicting histories.
3. **Notification outbox:** add `leave_notification_outbox` with stable idempotency key, request, recipient profile, recipient phone snapshot, event kind, rendered text/version, queued/attempting/sent/failed status, provider reference, attempt count, last attempt, retry-after, and error class. Store only provider diagnostics needed to operate the system; restrict reads to Management. For SMS snapshot the biodata phone at enqueue time so history explains the recipient even if a staff profile changes later. Encrypt or minimize content as provider rules require.
4. **Conflict/availability functions:** use a transaction-safe RPC for create/update/submit/approve/reschedule which validates dates, company calendar, each staff member's own reserved quota, and overlap. A transaction/advisory lock around calendar decision plus indexed dates prevents concurrent double booking. Use normalized reserved-day rows only if needed for reliable indexing; otherwise introduce an indexed day projection maintained transactionally. Keep original source JSON dates authoritative until the projection is reconciled.
5. **In-app notification:** use the existing app notifications system if its recipient constraints and failure model fit. Otherwise add a leave-specific user inbox record with read/unread state. It must be durable and link to a request route.
6. **Indexes and data integrity:** index status + earliest date, owner + year + status, outbox status + next attempt, and event timeline by request/time. Enforce date array non-empty, sorted/distinct ISO dates, supported year, and valid status transition at database boundary.

Migration order: capture schema/policy/RPC baseline; add nullable/additive fields and new tables; backfill event/phone fields without rewriting user-authored letter bodies; deploy server functions; validate behavior against old rows; enable strict RLS; move UI to RPCs; enable scheduler only after dry-run; remove obsolete policies only after staff and manager tests. Include rollback that disables scheduling and restores compatible read access without exposing draft content. No broad destructive cleanup.

## 9. Server-side security and authorization

- Replace the global authenticated-user `leave_requests` SELECT policy with owner-or-Management visibility. Use the application's authoritative profile key/role mapping; do not trust editable user metadata or a UI route guard.
- Apply separate SELECT/INSERT/UPDATE/DELETE policies. Staff may create only a request whose `agent_key` is their own, edit/delete only eligible private planned items, confirm only their own completed usage, and never decide a request. Management may view and decide all requests but cannot impersonate the submitting actor.
- To show staff conflict dates, provide a read-only function/view that returns only dates and availability/conflict flags (or sanitized approved free/busy), not names, reason, letter text, phone, decision notes, or private plans. Management's team calendar can show the approved detail intended for operational planning.
- Lock access to outbox and internal system events to Management/service role. Edge Function secrets stay in Supabase secret storage/Vault; browser clients never see service keys or SMS provider credentials.
- Use server-controlled routines for status transitions and counter assignment. Validate caller role, owner key, and legal transition inside each routine. Pin `search_path` and schema-qualify all objects for every `SECURITY DEFINER` routine. Revoke execute from `anon`; grant only to intended roles.
- Restrict change events and Realtime payloads under the same visibility model. If row-level Realtime filters cannot guarantee private draft confidentiality, publish a sanitized per-recipient broadcast or refresh the caller's own query after a safe inbox signal.
- Add automated RLS cases: unauthenticated, unrelated staff, owner staff, manager, emergency, hidden planned draft, safe availability result, direct Data API read, Realtime event visibility, and outbox access. Test both what a role can and cannot read.

## 10. Seven-day workflow, SMS, and retry behavior

### Scheduler contract

Run once daily in `Africa/Accra` at a documented local time, with timezone conversion made explicit in the cron job. Find eligible planned annual requests whose first planned day is exactly seven calendar days away and whose decision queue event does not already exist. A batched function claims eligible rows, transitions them to pending, writes one audit event, and creates one outbox message per unique staff/Management destination in the same transaction. Concurrent runs must be safe through a unique event/idempotency key. Do not send an HTTP call and then assume success from the database enqueue.

### Recipients and copy

Resolve staff SMS to the request owner's `profiles.phone`; Management recipients are active manager profiles' `phone`, deduplicated, plus configured company phone only if existing company policy intends that number. Use `whatsapp` only as an explicitly documented fallback where `phone` is empty and existing contact rules permit it; do not send to email or unverified contact data as a substitute. Normalize Ghana numbers before enqueue and show invalid/missing phone status. Messages identify staff, planned start date, day count, and point to the app. Never put the full leave reason or letter in SMS.

### Delivery lifecycle

An Edge Function drains outbox rows with a bounded batch, claims a row with a lease, calls the existing SMS provider with credentials on the server, and records accepted/rejected response and provider reference. Retry transient failures with capped exponential backoff; permanent invalid-number failures stay visible to Management. Messages must be idempotent per request/event/recipient. Record “queued,” “provider accepted,” and “failed” accurately; only say delivered if the provider supplies delivery receipts. Provide a Management monitor for failures, attempts, and manual retry with audit. If staff SMS fails, their in-app notification remains the source of truth.

### Calendar-day edge cases

Use local Ghana date, not UTC day truncation. If the planned leave begins fewer than seven calendar days from creation, promote immediately and notify. If a plan begins in the past, block it or route to emergency/Management correction according to existing policy; do not send a stale reminder. If all selected date blocks differ, trigger based on each block's start with one per-block event, or require one request to represent one contiguous block; audit actual existing multi-date semantics before choosing. Do not send repeated daily reminders after the first queued event.

## 11. Collision and annual balance rules

- Collision is overlap with any active reservation belonging to another person: planned, pending, approved, and rescheduled. Same-person duplicate day selection is rejected. Declined entries release dates. Confirmed-used approval still remains in date history, but a past day does not block a new booking for the current year.
- Client feedback should be immediate, but server RPC decides final success. When another request wins a race, preserve the typed form and show the conflicting dates with an actionable return to calendar.
- Emergency flow can override colleague collision, requires a reason, and still routes to Management. It cannot silently override user's own duplicate days or schema validity.
- Count Ghana working weekdays excluding applicable holidays/closures under the existing rule. Keep discrete-day selection where supported, because the original business model can select separate dates, and clearly show each date. Ensure policy-year boundaries are explicit and stable.
- Reserved = all days in active blocking statuses for that staff/year. Confirmed used = approved request, its last date has passed, and staff has explicitly confirmed. Do not subtract usage twice from entitlement. Management can correct an exceptional `deduct_quota` flag only with a reason and audit event.
- Changing the company annual allowance must state its effective year. Do not silently rewrite remaining balance in the middle of a year without a user-approved policy definition.

## 12. Staff experience and route map

Keep the current route family but make each route a complete workflow, not a repainted card stack:

- `/dashboard/leave`: “My leave” home; balance breakdown, reserved and confirmed-used labels, next planned dates, requests needing attention, one clear “Plan leave” action, a compact calendar, and recent request outcomes.
- `/dashboard/leave/plan`: year chooser, available/reserved/confirmed-used summary, all future blocks, automated-submission countdown/next action, create/edit/delete eligibility, and date collision guidance.
- `/dashboard/leave/requests`: searchable/filterable history, date range, status, year, decisions, and letters; usable on mobile without an unreadable wide table.
- `/dashboard/leave/requests/new`: multi-step date selection → live business-day/availability summary → editable official letter preview → save plan or submit.
- `/dashboard/leave/requests/[id]`: authoritative dates/status, current action/decision message, reschedule notice, original and approved schedule, letter downloads, audit timeline, notification status relevant to staff, and follow-up action.
- `/dashboard/leave/requests/[id]/edit`: only dates/letter on a private planned draft, with conflict and quota recheck; never edit around an already-submitted Management decision.
- `/dashboard/leave/emergency`: separate clearly-labeled exceptional flow; reason mandatory, date selection, conflict override explanation, submit to Management.

Staff should see an in-app alert for automatic submission and every approval/decline/reschedule. The plan and detail page should update from a secure realtime event or a measured refetch. A failed text message must not prevent the decision or app update.

## 13. Management experience and route map

- `/dashboard/leave/management`: attention-first dashboard: due this week, undecided/overdue, total reserved by month, who is away, collision flags, emergency requests, missing contact details, and clear links to act. KPIs must link to real filtered views.
- `/dashboard/leave/management/requests`: queue and searchable archive with status, staff, period, emergency, conflict, and reminder-delivery filters. Actions are available from request detail or a deliberate confirm dialog.
- `/dashboard/leave/management/requests/[id]` (add if current detail page cannot support it): full letter, reason, dates, working-day count, balance impact, availability/collision context, history, and secure approve/reschedule/decline controls.
- `/dashboard/leave/management/calendar`: month and agenda modes, year/month navigation, filters, legend, company holidays, active planned/pending/approved markers appropriately differentiated, staff names only at Management, and mobile list fallback.
- `/dashboard/leave/management/settings`: one global annual days setting with effective-year preview, Eid window, closures, and notification schedule/provider health. No per-person quota table or per-person quota editor. Company sender number is not edited here unless existing verified configuration path requires it.
- `/dashboard/leave/management/notifications`: delivery health and retry queue if needed; can be a focused settings subpage rather than a new app-level feature.

An automatic plan promoted at seven days must not be buried below historical data. Due items should sort by date/risk and provide a single accessible action area. Batch actions can be considered only after safe individual decision semantics exist.

## 14. Formal leave letter and PDF specification

Preserve the staff-authored contents and V1's wording unless the user gives revised official copy. The visual should read as an actual Ghanaian company letter, not a dashboard printout.

1. A4 portrait with real physical margins, clean typesetting, restrained Palmstead navy/brand accent, logo with correct aspect ratio, company address/contact if verified, and a document reference number.
2. Header shows company identity and issue date/reference. Recipient/subject is clear and formal. Applicant name is taken from the authenticated profile, while the editable staff letter body remains staff-controlled.
3. Schedule shows the exact requested dates and number of working days, clearly distinguishing a later Management-approved replacement schedule as an “Approved schedule” or “Rescheduled schedule” addendum. Never leave the original dates visually ambiguous.
4. Approval block includes manager name, role, dated decision, and signature image only when the decision is approved; a pending/declined letter does not imitate an approval signature. Declined/revised decisions include the actual manager note with no fabricated text.
5. Long applicant statements wrap without clipping; automatic page breaks preserve section headings and signature blocks. Test a one-day leave, multi-date/discrete plan, long name, long reason, changed year, long reschedule note, no signature, and 2-page output. Date formatting uses unambiguous day-month-year.
6. Preview exactly the file that downloads. Create a stable snapshot/version tied to the decision event so historical PDFs do not silently change after a logo, address, or staff name edit. Use a human-readable filename with request reference and staff name, sanitized for file systems.
7. Add PDF metadata (title, author/company, subject, created date) and selectable text where the current library supports it. Don't store secrets or an unnecessary copy of private notes in metadata.

PDF is a meaningful part of the deliverable, not a last-minute export. QA visually at 100% scale and inspect the actual downloaded PDF for wrapping, printable margins, correct dates, signature and page count.

## 15. Visual design and accessibility principles

Use Palmstead's current design system and route shell. Apply the research as product patterns rather than a copied template: quiet surfaces, tidy information density, real people context, clear annual dates, an obvious action hierarchy, a calendar plus agenda/list alternative, and links between calendar, request queue, and detail. No generic graphs with decorative numbers and no fake success indicators.

Status must use text/icon and color. Tables collapse into labeled request rows/cards below breakpoint; don't force horizontal scroll to perform a decision. Calendar day targets are keyboard reachable and have accessible date/state labels. Forms include field labels, clear errors, disabled/busy state, conflict explanation, and unsaved change handling. Respect reduced motion, dark mode, contrast, screen-reader headings, focus order, focus return from dialogs, and 200% zoom.

Use concrete content: actual state counts, actual policy balance, real upcoming dates, real empty messages. Show a stale-data/refetch indicator if the network is unavailable. Distinguish local optimistic UI from server-confirmed state.

## 16. Engineering sequence (must follow)

### Phase A — Inventory and baseline

Finish exact schema/policy/function/trigger/cron/Realtime inventory. Read project Next.js docs before Next work. Capture role-specific current UI states. Record current migrations and production-safe rollback. Do not make live changes. Confirm whether multi-date requests may span separated blocks and whether global annual policy changes are immediate or next-year effective. Use the confirmed default of one global annual number while resolving effective-year semantics.

### Phase B — Database and domain rules

Create versioned forward-only migration(s), policy snapshots only if required, explicit event/outbox structures, and safe transactional functions. Add DB tests for integrity and transitions. Test migration on local or dedicated Supabase branch first; inspect data diff; verify existing rows unaffected. Establish a controlled scheduler dry-run that creates no external SMS calls.

### Phase C — Security

Add owner/Management RLS for leave rows, safe availability function, secure event/outbox permissions, and safe Realtime story. Run positive and negative authorization cases with Manager, owner Staff, unrelated Staff, and unauthenticated request contexts. Validate no reason, letter body, phone, private draft or manager note escapes via Data API, PostgREST embedded selects, or Realtime.

### Phase D — Workflow and integrations

Add server-side date/quota/collision validation for every state-changing action; move side effects off the browser's best-effort hooks; implement durable idempotent outbox and provider result handling; verify phone mapping from biodata; implement seven-day transition and tests around timezone, duplicate cron, retries, date changed before delivery, canceled/declined request, and duplicate manager/company numbers. Keep existing +5/+1 approved reminders only if user intent still includes them and copy they are operationally useful; ensure new seven-day rule doesn't send duplicate/confusing notices.

### Phase E — Staff/Management UI

Build Management decision queue and detail first, then staff workflow against the finalized data contract; wire all routes and current app shell. Add secure realtime updates or bounded refetch, notification inbox, mobile table/calendar fallback, accessible modals/forms, complete loading/error/empty/success states, and consistent status names. Build global policy settings with effective-year preview.

### Phase F — PDF and calendar/report QA

Finalize official PDF output, schedule addendum, stable versions and download. Complete Management calendar, Staff plan, exports if a real reporting need exists, and report arithmetic checks. Do not expand into arbitrary report widgets.

### Phase G — verification, deploy, observe

Run unit/domain tests, migration tests, typecheck/build/lint per repo instructions and this user's explicit verification request. Test same request simultaneously in a Manager browser and Staff browser; verify Manager's decision and Staff's inbox/plan/date/letter update. Test outbox with a provider sandbox or mocked response so no real SMS is sent during QA. Use test-only disposable records with cleanup only after proving the target user explicitly authorized it; the standing plan says live testing may create and clean a disposable leave, but this rebuild turn says leave production data untouched, so use local/demo/branch data unless the user explicitly opts in later. Read `DEPLOY_INSTRUCTIONS.md` in full. Production deploy requires verified slice, and a deployment is separately confirmed by checking the live URL and both roles.

## 17. Acceptance matrix

| Concern | Staff acceptance | Management acceptance | Server/data acceptance |
|---|---|---|---|
| Annual allowance | Sees the one company yearly quota and own reserved/used/remaining counts | Changes one global annual value with effective year shown | No per-person override; reservations are calculated per owner and policy year |
| Advance plan | Saves and edits an eligible planned block; receives automatic submission alert at 7 days | Sees due request once, immediately actionable | Single idempotent transition/event despite repeated cron |
| Conflict | Sees occupied dates and useful safe explanation | Sees names and actionable details | Atomic conflict/valid-date guard; race cannot double-book |
| Decisions | Sees approval, decline reason or replacement dates in-app; SMS is supplemental | Decision has required note/signature and is auditable | Only manager can decide; state and audit commit together |
| Reschedule | Staff plan/calendar/detail/letter all use replacement dates | Replacement dates collision-checked and recorded | Original schedule retained in event; canonical active dates updated atomically |
| Notifications | Inbox displays event even if SMS fails | Outbox shows recipient/provider state and retry action | Per-recipient idempotency, retries and no secrets in browser |
| Privacy | Can read own full request and safe availability | Can read company request detail | Unrelated staff cannot read another private request through API/Realtime |
| PDF | Downloads reviewed, legible official letter | Sees unambiguous approved schedule and actual signer | Snapshot matches exact decision and doesn't invent signature |
| Responsive UI | Mobile form, calendar/list and detail usable | Mobile triage and table actions work | Accessible labels, focus, contrast, zoom and state semantics |

## 18. QA inventory (no production mutations)

Test annual-boundary dates, Ghana weekends/holidays, Eid observed/unobserved staff, closure days, separated date selections, quota at 0/remaining/exact cap/over-cap, multiple planned blocks, same-person duplicate, another person's overlap, emergency overlap with reason/no reason, cancellation/decline freeing reservation, reschedule across year and no replacement date, auto-promote at exactly 7 days and 6/8 days, daylight/timezone conversion, duplicate cron run, invalid phone, duplicate phone destination, SMS provider timeout/rejection/accepted/delivered states, staff realtime disconnect/reconnect, and PDF variants above.

For every write, prove exactly one DB transition, one audit event and one notification per recipient. For rejected writes, prove no partial updates or message side effects. Use deterministic fake dates and provider mocks; do not trigger real SMS from a live account during testing.

## 19. Rollout, monitoring, and recovery

Ship migrations additively, keep the previous route/data contract until new routes pass, and run the scheduler in dry-run first. When enabled, monitor cron runs, auto-submit counts, outbox backlog/age, SMS accepted/failure ratio, dead letters, RLS denial logs, realtime connection status, and user-visible fallback refetches. Alert Management for actionable failures, not routine unchanged runs. If a rollout fails, pause the cron and outbox dispatcher first, leave already-created audit rows intact, fix/roll back the code, and re-run idempotent eligible work after verification. Never rewind or overwrite a staff letter/decision record.

Deployment must use the project's verified Vercel account/scope and documented workflow. At this checkpoint Vercel access is still not available to the connected connector or local CLI: both report unauthorized for `dnm-garments`. GitHub connector access is verified (admin/push on `awaheedasamei5-ai/pep-landbank-portal`), although the local GitHub CLI previously authenticated as a different account and received 403. Do not treat Vercel auth as fixed until an authorized API read and deployment are independently verified.

## 20. Implementation checklist

- [x] Read existing Leave plan, continuation instructions, current route/hooks/data logic, V1 logic, and current live screens.
- [x] Confirm global 20-days-per-staff-per-year policy with user; preserve one company-level setting.
- [x] Research Google Workspace Calendar, Supabase current security/scheduling docs and changelog, actual open-source source files, and Pinterest/UI reference scan.
- [x] Record current flaws and target architecture before broad implementation.
- [ ] Confirm exact annual-policy effective-year behavior from existing policy/Management guidance.
- [ ] Verify exact production schema/policies/cron/realtime definitions against migrations and migration history.
- [x] Draft the V2 owner-scoped Leave read policy, guarded staff transitions, date-only collision RPC, seven-day promotion job, and durable SMS outbox/worker; keep migrations unapplied until a disposable database can verify them.
- [ ] Implement and locally verify transaction-safe quota/collision writes and verify provider acceptance/retry behavior without sending live SMS.
- [ ] Implement retryable SMS and seven-day auto-promotion with idempotency.
- [ ] Complete the Management and Staff experience, wire notification delivery health, and verify live account synchronization after schema rollout.
- [ ] Verify every status, cross-account sync, collision, mobile breakpoint and PDF without production mutations.
- [ ] Read deploy guide; publish only through connected authorized Vercel account; live-check both roles.

## 21. Proposed service and database contracts

The UI should not duplicate policy in separate direct table mutations. Define a small domain contract and keep all meaningful state transitions behind it. The exact Postgres names should follow local conventions after the migration inventory, but the behavior is fixed here.

### Read contracts

- **My requests:** returns the authenticated staff member's requests and their own letter/history. It must scope at SQL/RLS level and support year/status/date filters without first downloading the company's rows.
- **Management queue:** manager-only, paginated and sorted by urgency; includes the fields required to make a decision and safe counts. Return request and profile data via explicit projections, not `select *`.
- **Team availability:** accepts date range and returns unavailable dates (or availability counts) to Staff. It returns no person name, reason, letter body, phone, internal note or private planned-request identifier.
- **Management calendar:** manager-only, returns approved/pending/planned reservations with the correct status labels and staff identity, with a deliberate projection for calendar rendering.
- **Global policy:** signed-in staff may read the effective quota for a selected year; only Management may update the company default/effective year. The client cannot write the config row from a staff session.
- **Staff notification inbox:** only the recipient reads/marks read; no other recipient can enumerate, update or claim it.
- **Management delivery monitor:** manager-only view over notification outbox summaries, with phone masking and provider error category; never expose API credentials/provider request headers.

### Write contracts

Every mutation returns the canonical updated request, the event identifier, and any user-visible message. It does not report notification success unless the provider has returned the defined acceptance/delivery state. Validation errors use stable machine codes (`invalid_dates`, `weekend_or_holiday`, `quota_exceeded`, `collision`, `invalid_transition`, `not_authorized`, `profile_phone_missing`) and safe display text. This gives both Staff and Management the same human-readable explanation instead of bespoke client branches.

- `save_planned_leave`: owner-only; validates sorted unique future-working-day selection, year, existing reservations and quota; saves the applicant's letter snapshot; creates a planned event.
- `submit_leave_request`: owner-only, valid planned request; checks dates again, assigns or retains request number, promotes to pending, and creates manager inbox/outbox records transactionally.
- `promote_due_plans`: service-only; batch safe, idempotent, creates system actor audit entries and notification jobs exactly once.
- `decide_leave_request`: Management-only; validates current state and policy, records outcome, signature/name/time, reason as needed, event and durable inbox/outbox jobs atomically.
- `reschedule_leave_request`: Management-only; validates replacement dates in the same transaction, stores old and new dates as an append-only event, changes canonical active dates, creates a versioned schedule amendment, and sends notifications. If no dates are supplied, the request is not silently shown as having new dates; the UI must say exactly what action remains.
- `confirm_leave_used`: staff owner only; requires status approved and all selected dates before local current date. It marks usage confirmed once and must reject repeat changes that would make reports inconsistent.
- `retry_notification`: Management-only and only retryable failure; appends an attempt, preserves idempotency and avoids duplicate messages for recipients already accepted.
- `update_leave_policy`: Management-only; validates integer range, chosen effective year and impact preview; persists a policy change audit record.

Avoid exposing a general-purpose `update leave_requests` operation in the UI source layer. Every operation should express a domain action and let the database enforce role, state, collision, and quota semantics.

## 22. Existing-row reconciliation and backward compatibility

The active database has years of live request rows. Treat letter text and `dates` as business evidence, not disposable cache. Before any migration, export a schema-only snapshot and row counts by year/status, plus a checksum/count summary for request IDs and their dates. The migration dry-run reports exactly how many rows would receive new policy/event/outbox metadata. It must not print phone numbers or letter bodies into build logs.

### Historical status mapping

Do not rewrite statuses to make a new state machine appear tidy. Map current values (`planned`, `pending`, `approved`, `declined`, `rescheduled`) into the target state model explicitly. Distinguish a `rescheduled` row awaiting replacement dates from an approved row whose dates were changed by Management. Preserve the old status timeline if available; create a “history unavailable before migration” boundary instead of inventing past approval decisions.

### Legacy requests without reliable metadata

- If `request_no` is absent, generate a stable number in a controlled backfill and confirm no duplicates; do not regenerate a number on each screen load.
- If a past request has no signature snapshot, continue rendering it as historically approved with its recorded manager identity if present, but do not synthesize a new signature.
- If `dates` is malformed, empty, duplicated or spans years unexpectedly, flag it for Management review and exclude it from automated promotion. Never let a malformed historical row crash calendar parsing.
- If `days_count` differs from distinct eligible selected workdays, do not silently alter a signed request. Report the discrepancy; use Management's documented correction action to amend it with an audit event.
- If `agent_key` no longer maps to an active profile, retain history and render a stable stored `agent_name`; do not delete the row or send SMS to a guessed number.
- If phone is missing, invalid, or has changed since request creation, notify through the in-app inbox and surface the state to Management. Do not block the approval itself solely because SMS is unavailable.

### Temporary dual-read and rollback

During rollout, new read paths should support old rows, but there should be one canonical mutation path. Keep a feature flag for the due-plan worker. Rollback means disabling the worker and reverting to manual management review while retaining the new audit/outbox rows; it does not mean deleting notifications or restoring the insecure broad SELECT policy. Any fallback used during incident response must still protect planned letters and private reasons. Document the command or dashboard step that pauses cron before migration/application rollback.

## 23. Calendar information hierarchy and states

### Staff calendar/plan

Make calendar browsing a planning tool, not a decorative mini-month. Month controls are obvious, month/year can be selected with keyboard, today is clearly marked, selected dates have a separate state, public holiday and closure reasons are text-readable, and blocked dates expose an explanation on focus/tap. Planned, awaiting Management, approved, rescheduled, declined and confirmed-used history must not collapse into one color. The annual plan list underneath remains the accessible alternative to date-cell discovery.

### Management calendar

Desktop: calendar grid with staff rows or month grid plus a compact agenda panel. A staff filter and status filter should preserve selected month and scroll position. Event detail is a right-side panel or dialog with the request number, staff member, dates, status, team conflict context and direct “open request” action. Avoid hover-only disclosures. Mobile: switch to an agenda grouped by date, with a month heading and sticky filter controls that do not cover content. Weekends and Ghana holidays are visually quieter but still distinguishable. A monthly count can never imply a request is approved if pending/planned rows are included; use a legend and consistent labels.

### Capacity semantics

The current business rule is a binary overlap guard, not an organization staffing ratio. The UI must say “dates overlap another staff leave booking” rather than “team understaffed” unless a real per-team minimum staffing policy exists. If the user later asks for coverage capacity, model team/departments and per-day minimums explicitly; do not infer them from historical patterns or AI. For an emergency overlap, indicate “overlap override requested” to Management and keep the reason attached to the decision history.

## 24. Detailed decision behavior and state-transition table

| Current state | Actor | Action | Next state | Date effect | Quota effect | Required communication |
|---|---|---|---|---|---|---|
| planned | Staff | edit | planned | Replace only dates on private draft; rerun checks | Recalculate reservation | Staff sees saved state |
| planned | Staff | delete | removed | Release planned dates | Release reservation | No manager SMS; audit deletion metadata if records are retained |
| planned | Staff | submit now | pending | Keep current dates | Keep reservation | Manager inbox + SMS; staff confirmation |
| planned | System at D-7 | promote | pending | Keep current dates | Keep reservation | Manager + staff inbox/SMS; system event |
| pending | Management | approve | approved | Keep current dates | Keep or explicitly waive with reason | Staff inbox/SMS; signed letter version |
| pending | Management | decline | declined | Preserve requested dates as history, no longer active | Release reservation | Staff inbox/SMS with reason |
| pending | Management | reschedule with replacement dates | approved/rescheduled-approved (domain choice) | Update active plan and preserve original in history | Recheck/recalculate reservation | Staff inbox/SMS, amended PDF, calendar update |
| pending | Management | request new dates without choosing them | reschedule-needed | Old dates may stay held until staff picks, per established quota invariant | Keep reservation until a deliberate replacement/decline | Staff inbox/SMS; actionable selection task |
| approved future | Management | amend dates | approved with schedule amendment | Transactionally replace active dates; retain old dates | Recalculate within policy year | Staff inbox/SMS, updated plan and versioned PDF |
| approved past | Staff | confirm used | approved + used confirmation | Dates immutable | Convert display from reserved to confirmed-used, never deduct twice | Staff success; Management audit visibility |

The table must be reconciled with actual V1 and user-established rules before implementation. In particular, “request new dates without choosing” must not free active reservation days silently. The latest request asks Management to reschedule the staff to another day, so the main path should require Management-selected replacement dates and update the canonical plan in one decision. If UI still supports “staff choose a different date,” that is a separate state/action with clear reservation rules.

## 25. Failure handling and user-visible recovery

The app should handle failures according to what failed:

- **Policy/date validation failed:** keep the form values, identify exact dates/constraint, and offer the calendar control to select alternatives.
- **Network interrupted before server response:** show “Checking status…” and refetch the request by idempotency key before inviting retry. Do not create duplicate requests or send duplicate SMS on a blind retry.
- **Database write failed:** report no state change and preserve the form. Do not emit notifications before the transaction commits.
- **Outbox accepted but provider call pending:** show “Text queued” in Management and “In-app update available” to Staff. Never show “delivered.”
- **Permanent SMS rejection:** keep the leave workflow successful, highlight invalid number/contact maintenance for Management, and keep the in-app notification available.
- **Realtime disconnected:** display stale state subtly and refetch on reconnect/focus. The request detail is the canonical source and must recover after sign-in on another device.
- **PDF generation error:** leave the request/decision valid, show a retryable download error, and keep a manager-accessible link to re-render the same stored version. Never ask the manager to re-approve because rendering failed.
- **Scheduler function failed:** preserve eligible planned rows; retry later by idempotent batch. Show a last-success time and backlog count in Management operations. Alert only after the configured delay/threshold.

Messages should be brief and specific. Examples: “Your planned leave for 12–16 October is now with Management for review.” “Management approved your leave for 12–16 October.” “Your plan changed to 19–23 October. Open Leave to review the updated schedule.” Avoid vague “updated successfully” text that omits the dates or action.

## 26. Metrics and operational report definitions

The rebuild needs operationally useful numbers with definitions users can audit. They should be computed from canonical requests/events, not hardcoded example data.

- **Upcoming leave:** distinct staff with an active approved period, by local date range.
- **Requests awaiting decision:** status pending only, separately highlight any due within 7 days or already started.
- **Planned dates not yet submitted:** status planned; show due-at-seven-day date and exclude a private reason from unauthorized staff.
- **Reserved days:** sum active blocking day counts for one staff/year; do not sum duplicated reschedule history events.
- **Confirmed used days:** approved and fully elapsed with staff confirmation, by applicable leave year.
- **Decision time:** median elapsed business/calendar time from pending transition to management action, with the definition displayed.
- **Reminder reliability:** queued, provider accepted, delivered (only with receipt), transient failure, permanent failure, and overdue; count by unique request/recipient/event idempotency key.
- **Overlap exceptions:** emergency requests and Management overrides, with reason and approver accessible only to authorized roles.

Reports should answer specific questions such as “who is away this month,” “how many requests are waiting,” “what is the staff member's remaining annual allowance,” and “which reminders failed.” Provide date/year filters and export to CSV/PDF only when rows, totals, and role privacy match the UI. Do not expose individual reasons or letter text in a team-wide bulk export unless the user has an authorized business purpose and role.

## 27. Visual verification checklist by viewport

At minimum inspect Management and Staff at a wide desktop, a 768px tablet, and a 375–390px phone viewport. Check both light and dark theme if the route supports the application's theme switch. On each viewport verify:

- title, global shell and local breadcrumb/navigation do not wrap awkwardly or consume excessive first-screen space;
- status queue and due dates remain visible before historical requests;
- global annual balance uses a clear number plus labels and is readable without interpreting a circular chart;
- calendar controls and chosen month are discoverable and tap targets are not cramped;
- long Ghanaian names, long formatted dates, status labels and request numbers wrap or truncate with an accessible full value;
- management action buttons stay with the request and never float over/obscure the page;
- dialogs fit in viewport with keyboard focus, scroll internally, and retain an obvious cancel/back action;
- the staff form preserves dates on collision/API error and places the validation message next to the relevant field;
- request tables become usable cards/agenda at phone size, not a clipped desktop table;
- PDF preview uses page width/zoom that preserves paper margins and signature visibility;
- no horizontal document scroll appears except for an intentional calendar scroller with visible affordance;
- network loading/error/empty states occupy the same space as populated content and do not cause violent layout shifts.

Save screenshots of the final role and viewport matrix with the changeset so UI claims are verifiable. The current production inspection above establishes a Manager session and live page baseline only; the Staff cross-session synchronization matrix is still pending.

## Appendix A — Current plan discrepancies to resolve

`04-leave-full-app-build-plan.md` says existing RLS is correct and suggests reusing it. That is contradicted by live policy `leave_requests_sel` (`auth.uid() is not null`) and must be corrected. It also calls the leave-approaching step a deterministic five-day reminder and marks schema phases complete, neither of which meets the new seven-day auto-submit/Management action. `09-leave-letters-rebuild-plan.md` restores a letter-review surface, which is retained, but its pre-deploy account verification is still pending and its adjusted PDF should be incorporated into this complete plan rather than treated as all of Leave.

The older OpenHR duplicate under `src/openhr/` is not the active V2 Leave app; its UI and comments must not be treated as authoritative. Current data-source client writes and UI comments often describe policy assumptions more strongly than database guarantees. For the rebuild, database and provider responses are the source of truth.

## Appendix B — Evidence links

- [Google team calendar sharing and availability](https://support.google.com/a/users/answer/11617205?hl=en)
- [Supabase current changelog](https://supabase.com/changelog)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Cron scheduling](https://supabase.com/docs/guides/functions/schedule-functions)
- [ComCal repository](https://github.com/nkelly-axela/ComCal)
- [Pinterest calendar design reference](https://uk.pinterest.com/pin/dashboard-for-the-b2b-hr-product--525584219019713014/)
- [Pinterest time-off design reference](https://ph.pinterest.com/pin/353180795794089421/)
- [Figr leave-management workflow screen](https://figr.design/templates/leave-management)
- [Behance employee leave calendar UI](https://www.behance.net/gallery/218858599/Employee-Leave-Management-Calendar-UI)
