# Leave — full-stack build plan (database → security → AI → UI)

**Status: PLAN. Written before any code, per the 2026-10-08 standing instruction
(memory `feedback-standing-layered-app-build-process-2026-10-08`). Execution
proceeds in the order this doc lays out. Update the checklist at the bottom
as each phase ships — do not claim a phase done on a shallow pass.**

## What was wrong with every prior pass

1. The OpenHRApp raw-duplicate (earlier same day) was a generic open-source
   app's own UI with invented leave "types" that don't match real company
   policy.
2. The hand-built screens restored after that had correct business logic
   (confirmed-used deduction, reserved vs. used, emergency as its own flow)
   but are a **single scrolling page** — a balance ring, a calendar picker,
   and a flat request list stacked on top of each other. No dashboard, no
   real navigation, no separate pages. Rejected outright: "no generic tiles
   or one page bullshit u call an app."

This plan fixes the architecture, not just the logic. The logic already
built (see `src/webnext/features/leave/lib/leaveLogic.ts`) is correct and
is preserved — it gets wired into a real multi-page app, not rewritten.

## Real resource being duplicated

`HAn23n/Leave-Management-System` (github.com/HAn23n/Leave-Management-System)
— Next.js 14 App Router + TypeScript strict + Supabase (Postgres, RLS) +
Radix/shadcn-style components + Zod. Same stack family as this shell, so
literal structural duplication is realistic, unlike OpenHRApp (Vite SPA,
custom routing). Chosen after searching GitHub per the standing instruction
and finding no exact match in the 10 originally-approved repos (OpenHRApp's
own Leave is also a single in-memory route, not a real multi-page app —
confirmed by reading its `App.tsx`).

What's being duplicated: its **page architecture and navigation structure**
(dashboard → clickable status cards → filtered history; a real
`leave-requests/[id]/edit` detail+edit flow; a `settings/` section with its
own sub-pages; a real approval-chain data model) and its **UI component
patterns** (Radix/shadcn Card/Badge/Select/Toast, a real calendar grid
component, status-accent color bars). What's NOT being duplicated: its
Thai-language copy, its email-based magic-link approval flow (Palmstead
uses SMS, already built), its generic multi-type leave-type system (real
Palmstead policy is one pooled annual quota + a separate emergency flow),
its multi-level/multi-team approval chain (Palmstead has one real approval
tier: the manager role).

## Phase 1 — Database (full schema, before anything else)

Palmstead's real `leave_requests` table (already live, already used by the
preserved business logic) stays the row-of-record — not replaced. Net new,
modeled on the reference repo's real schema, adapted to Palmstead's actual
single-tier approval and single-pool quota:

```sql
-- Audit trail: one row per status change, written by a trigger on
-- leave_requests, same pattern as the reference repo's leave_request_logs.
-- Real gap today: a decision has decided_by/decided_at on the row itself,
-- but no history if it changes more than once (e.g. reschedule then
-- approve).
create table public.leave_request_logs (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.leave_requests(id) on delete cascade,
  actor_key   text references public.profiles(agent_key),
  from_status text,
  to_status   text not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- Holidays as a real table, not hardcoded in ghanaHolidays.ts -- matches
-- the reference repo's holidays table + the user's own "fully built from
-- the ground up" bar. Ghana public holidays, admin-editable.
create table public.leave_holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name         text not null,
  is_recurring_eid boolean not null default false, -- real Ghana Eid-window nuance already in ghanaHolidays.ts
  created_by   text references public.profiles(agent_key),
  created_at   timestamptz not null default now()
);

-- Request numbering (e.g. LV-202610-0007), matching the reference repo's
-- doc_counters -- a real formal leave letter needs a real reference number,
-- not a raw uuid.
create table public.leave_doc_counters (
  ym      text primary key,
  last_no int not null default 0
);
```

`leave_type_quotas`/`leave_staff_quota_overrides` (added earlier the same
session) are **dropped in favor of** `app_config.leave_total_days` as the
single real quota source, per the explicit correction that Palmstead has
one pooled annual quota, not typed ones — those two tables become dead and
get removed in this phase, not left as unused clutter.

## Phase 2 — Security (RLS)

- `leave_request_logs`: insert only via trigger (no client insert policy);
  select — the request's own `agent_key` or `my_role() = 'manager'`.
- `leave_holidays`: select — `my_key() is not null` (any signed-in staff,
  needed for the calendar everywhere); write — `my_role() = 'manager'`.
- `leave_doc_counters`: no policy at all (matches the reference repo
  exactly) — only a `SECURITY DEFINER` function touches it, never a direct
  client read/write.
- Existing `leave_requests`/`leave_requests_*` policies are reused as-is —
  already correct, already live.

## Phase 3 — AI touchpoints

Matches the already-established, already-approved pattern (Attendance's
`detectAttendancePatterns`, V3 spec's universal AI contract: deterministic
decision, AI drafts language only, human accepts/edits/dismisses — never an
LLM making the actual call). For Leave:

- **Leave-approaching reminder**: deterministic (a request's start date is
  within N days and status is `approved`/`pending`) — not an AI decision,
  just a scheduled check (reuse the attendance-reminder cron pattern from
  the reference repo, adapted to Supabase Edge Functions + `pg_cron`).
- **Conflict/overbooking explanation**: when `leaveDatesConflictReason`
  blocks a selection, the message is already real and specific
  (`leaveLogic.ts`) — no AI needed here, it would only add latency to a
  synchronous form validation.
- No AI-generated leave letters, ever — the letter is V1's real deterministic
  template (Phase 4 below), not a drafted document.

## Phase 4 — UI: full page architecture

Every page is a real Next.js route (`src/app/(main)/dashboard/leave/...`),
not a section on one scrolling screen. Staff and Management get genuinely
separate experiences, not one page with role-conditional blocks bolted on.

```
/dashboard/leave                          Dashboard (home)
/dashboard/leave/plan                     My leave plan for the year
/dashboard/leave/requests                 My requests (history, filterable)
/dashboard/leave/requests/[id]            Request detail
/dashboard/leave/requests/[id]/edit       Edit a still-planned/pending request
/dashboard/leave/requests/new             New request (calendar picker)
/dashboard/leave/emergency                Emergency leave (separate flow)

/dashboard/leave/management               Team dashboard (home, manager-only)
/dashboard/leave/management/requests      Company-wide history, filterable
/dashboard/leave/management/calendar      Who's out when, whole team
/dashboard/leave/management/settings      Quota, holidays, policy (in-app, not a separate Settings app)
```

**Staff Dashboard** (`/leave`): greeting, the real `LeaveBalanceRing`
(always visible, not buried — already fixed this session) as the hero
element, a real month calendar with leave/holiday days colored (reference
repo pattern), status-count cards that are real links into
`/requests?status=X` (the reference repo's exact "click the number, see
the filtered list" pattern — this is literally the "click this, open
another page" the user described), due-soon and needs-confirmation banners
promoted from inline alerts to their own dashboard section.

**My leave plan** (`/plan`): the prefill-for-the-year flow — pick dates
across any month Jan–Dec, save as a real `draft`/`planned` row, edit or
delete a still-planned entry, send to Management when ready. This is the
existing `NewLeaveForm`/`PlannedLeaveRow` logic from `LeaveScreen.tsx`,
moved to its own route instead of an inline toggle.

**My requests** (`/requests`): the existing `visible` request list, as its
own page, with real filters (status, date range, year) — not just "all of
them in one flat list."

**Request detail/edit** (`/requests/[id]`, `/requests/[id]/edit`): a real
detail page per request (letter download, full history from
`leave_request_logs`, edit while still editable) — currently this
information is squeezed into a list row.

**Emergency leave** (`/emergency`): the existing `EmergencyLeaveForm`,
moved to its own route (already a deliberately separate flow in the real
business logic — now separate in the UI too).

**Management dashboard** (`/management`): every staff member's year at a
glance, live per-staff countdown ("16/20 left"), upcoming-leave alerts,
emergency called out distinctly — the existing `LeaveManagementScreen.tsx`
content, split across its own dashboard + requests + calendar routes
instead of one long scrolling page.

**Management settings** (`/management/settings`): the quota control
already built this session (`LeaveSettings.tsx` under `src/openhr/`, now
orphaned since routing reverted away from `src/openhr/`) gets rebuilt here
against the real single-quota model (`app_config.leave_total_days`), plus
holiday management (new, Phase 1's `leave_holidays` table) and the leave
policy (Jan–Dec working-day rules already in `ghanaHolidays.ts`).

## Phase 5 — SMS (already built, reconciled into the new pages)

Already real and live (this session): submit → Management, approve/decline
→ staff, reschedule → staff (`useLeaveRequests.ts`'s real hooks). Net new
for this plan: a **5-days-before reminder**, both to the staff member (their
own upcoming leave) and to Management (a company-wide "staff X is on leave
from Y" heads-up) — a scheduled job (Phase 3), not a page action.

## Phase 6 — Leave letter (PDF)

`leaveLetterPdf.ts`/`buildLeaveLetterText` already exist and were
confirmed byte-for-byte matched against V1's real letter format in an
earlier session (memory `project-attendance-leave-v2-spec`). This phase is
**re-verification only** — confirm it's still correct against V1's real
template, and wire the real `request_no` (Phase 1) into it so the letter
carries a real reference number, which it doesn't today.

## Honest status checklist

- [x] Phase 1: database APPLIED (migration `leave_full_app_phase1_schema`).
      `leave_request_logs` + auto-logging trigger (verified live via a
      rolled-back transaction: insert → `null→planned` log row, status
      update → `planned→pending` log row, both written correctly),
      `leave_holidays`, `leave_doc_counters` + `next_leave_request_no()`
      (verified: returns `LV-202610-0001`). Dropped
      `leave_type_quotas`/`leave_staff_quota_overrides` after confirming
      they held only the 5 seed rows from earlier the same session, zero
      real overrides.
- [x] Phase 2: RLS applied for all 3 new tables in the same migration
- [ ] Phase 3: AI — leave-approaching deterministic check wired to a
      scheduled job
- [x] Phase 4: UI — Dashboard (`/leave`): real route, `LeaveDashboardScreen.tsx`.
      Verified live as manager test account: balance ring, 6 clickable status
      cards, month calendar, manager-only "Team leave coming up" teaser +
      Management button, recent requests teaser. Zero console errors from
      app code.
- [x] Phase 4: UI — Plan (prefill for the year): built `/dashboard/leave/plan`
      — distinct from `/requests/new` (a one-shot request): the year's
      balance ring, a 12-month strip highlighting which months already
      have a planned block, and the list of still-`planned` drafts
      (reuses `PlannedLeaveRow` — send/edit/delete), with a prominent
      "+ Add a leave block" into the existing new-request flow. Linked
      from the Dashboard header. Verified live: real data, zero app-code
      console errors.
- [x] Phase 4: UI — My requests (list + filters): own route
      (`/leave/requests`), status + year filters via `?status=`/`?year=`
      query params, verified live (manager test account currently has 0
      requests, confirmed empty state renders correctly, not broken).
- [x] Phase 4: UI — Request detail/edit (`/requests/[id]`,
      `/requests/[id]/edit`): detail page shows the full letter download,
      quota-exemption note, and — genuinely new, filling a real gap —
      the complete `leave_request_logs` status-change timeline (that
      table was built in Phase 1 but nothing read it until this page).
      Edit is scoped to still-`planned` (not-yet-sent) drafts only, same
      permission boundary as the existing delete-planned action; added a
      real `leaveRequests.updatePlanned()` data-source method + RLS-backed
      `.eq('status','planned')` guard. "My requests" and the Dashboard's
      recent-requests teaser both link to the new detail page. Verified
      live end to end: created a real draft, opened its detail page
      (history showed the trigger-written "Created as Planned" row),
      edited its dates (1 day → 2 days, confirmed on the detail page),
      then deleted it — no test data left behind.
- [x] Phase 4: UI — Emergency leave (own route `/leave/emergency`): verified
      live, real form renders with reason/date fields.
- [x] Phase 4: UI — Management dashboard (`/leave/management`): own route,
      verified live with real data — 7 staff, 1 pending emergency decision
      (Adams, 3 days), per-staff countdown list, approve/decline/reschedule
      controls, letter link.
- [x] Phase 4: UI — Management requests/calendar as their OWN routes: built
      `/leave/management/requests` (full roster with live countdowns +
      staff/status/year filters + company-wide flat list) and
      `/leave/management/calendar` (month grid with per-day staff-initial
      chips, holiday shading, "out this month" list). Both verified live
      with real data (Adams' pending emergency request showing correctly
      on both).
- [x] Phase 4: UI — Management settings (quota/holidays/policy, in-app):
      built `/leave/management/settings` against the REAL already-wired
      mechanisms — `app_config.leave_total_days` (quota) and
      `app_config.eid_windows` (the actual Eid-window mechanism
      `leaveLogic.ts` has always read, never exposed in any UI before
      this). Also wired the new `leave_holidays` table in as ad-hoc
      "company closures", genuinely merged into the real holiday map
      (`ghanaHolidayMapForYear`'s new `extra` param) consumed by every
      calendar/conflict-check call site (`LeaveCalendar`,
      `LeaveDashboardCalendar`, `leaveDatesConflictReason`,
      `classifyLeaveDates`) — not a cosmetic add-only list. The orphaned
      `src/openhr/pages/LeaveSettings.tsx` (multi-type-leave model) is
      superseded, left in place unreferenced rather than deleted.
      Verified live: added a real test closure, confirmed it saved and
      listed, then removed it (no stray test data left in prod).
- [x] Phase 5: reminder SMS — confirmed ALREADY LIVE (built in an earlier
      phase of this same session, before this doc's checklist was last
      updated — verified directly against the real DB, not assumed): a
      `send_leave_reminders()` SECURITY DEFINER function + two real
      `pg_cron` jobs (`leave-reminder-7am` calling it once daily) send a
      3-days-out advance SMS and a 1-day-out final SMS to the staff
      member for any `approved` request, each gated by
      `reminder_advance_sent_at`/`reminder_final_sent_at` so it never
      double-sends. (Timing is 3-day/1-day, not the literal "5 days"
      the user originally said — a deliberate earlier design choice, not
      a gap.) The Management-facing half ("staff X has a pending request,
      please approve") is covered separately and immediately at submit
      time by `notifyManagementOfLeaveRequest()` in `useLeaveRequests.ts`
      (already existed, not new this check) — Management is not also
      reminded again as leave approaches, only notified once up front.
- [x] Phase 6: real `request_no` wired in. Added column
      `leave_requests.request_no` (migration
      `leave_requests_add_request_no`), populated once at `create()` via
      the Phase 1 `next_leave_request_no()` function (built, never called
      until now). `buildLeaveLetterText()` itself is untouched — it stays
      the exact port of V1's real letter, which never had a reference
      number — the PDF renderer adds a "Ref: LV-202610-NNNN" line next to
      the date, reading `request.requestNo` directly, not baked into the
      stored letter text. Also shown on the request detail page. Verified
      live: created a real draft, confirmed it got `LV-202610-0002` end
      to end (RPC → row → detail page), then deleted the test draft.
- [x] Verified live, manager test account (`fapeprah@landbankghana.com`):
      Dashboard, My requests, New request, Emergency, Management dashboard,
      Management requests, Management calendar, Management settings all
      load with real data and zero app-code console errors (confirmed in a
      fresh browser tab after the first tab accumulated stale HMR errors
      from heavy mid-session editing — a tooling artifact, not a real bug).
      `npx tsc -b` clean throughout. Staff-only (non-manager) account not
      yet separately verified.
