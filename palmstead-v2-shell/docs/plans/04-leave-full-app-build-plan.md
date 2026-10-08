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

- [ ] Phase 1: database (leave_request_logs, leave_holidays,
      leave_doc_counters; drop leave_type_quotas/leave_staff_quota_overrides)
- [ ] Phase 2: RLS for the 3 new tables
- [ ] Phase 3: AI — leave-approaching deterministic check wired to a
      scheduled job
- [ ] Phase 4: UI — Dashboard
- [ ] Phase 4: UI — Plan (prefill for the year)
- [ ] Phase 4: UI — My requests (list + filters)
- [ ] Phase 4: UI — Request detail/edit
- [ ] Phase 4: UI — Emergency leave (own route)
- [ ] Phase 4: UI — Management dashboard
- [ ] Phase 4: UI — Management requests/calendar
- [ ] Phase 4: UI — Management settings (quota/holidays/policy, in-app)
- [ ] Phase 5: 5-day reminder SMS (staff + Management)
- [ ] Phase 6: leave letter re-verified + real request_no wired in
- [ ] Verified live, staff + management, real test accounts
