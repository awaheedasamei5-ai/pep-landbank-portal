# Batch 3 — Full Test Sweep + Cross-App Sync Findings

Apps covered: Directory, Staff Hub (Notice Board / Polls / Complaints / Feedback), Attendance, Leave.
Tested live as Adams (agent) and Management against the real `sbydzrlzqxcdbudjaube` project. Part of the full exhaustive test sweep requested 2026-10-30.

---

## 1. Directory

**Functional (Adams)**: Staff tab renders all 8 real staff members (Adams, Bridget, Elias, Elizabeth, Emmanuel, Management, Philip Mensah, WebNext Test Agent) with mailto/tel links. "My Contacts" tab renders correctly (empty state, "Add contact" present). **No staff-detail drill-down page exists** — cards are a flat list with contact links only, by design (no `/dashboard/directory/[staffKey]` route). This is a real architectural fact, not a bug, but it means any future "show live attendance/leave status on a staff profile" idea (see §5) has no existing page to attach to yet.

**Security**: `profiles` RLS (`p_profiles_sel`) correctly scopes client-portal shadow users away from seeing staff profiles outside their own agent's identity; staff/Management see everyone. Sound.

**Realtime**: `profiles` confirmed in `supabase_realtime` publication and wired in `useDashboardRealtime.ts`.

**Data quality**: 0 `profiles` rows missing a matching `auth.users` row. Clean.

---

## 2. Staff Hub (Notice Board / Polls / Complaints / Feedback)

**Functional (Adams)**: All 4 tabs render correctly with real data — Notice Board (post composer + empty board), Polls (1 real open poll, "Show closed polls" toggle), Complaints ("Staff Complaints — a private channel for workplace concerns — separate from client complaints", empty "nothing submitted" state), Feedback (2 real threads: a Management suggestion with 1 reply, an Elias bug report with 0 replies).

**Resolved question from the task brief**: Staff Hub's "Complaints" is **genuinely distinct** from the Sales "Complaints" app tested in an earlier batch — different table (`staff_complaints` vs the Sales `complaints` table), different purpose (internal workplace concerns vs client complaints), and the UI itself explicitly disambiguates this in its own subtitle copy. Not a naming collision, no action needed.

**Security**: all 5 tables' (`notice_board_posts`, `polls`, `poll_votes`, `staff_complaints`, `feedback`/`feedback_comments`) RLS policies reviewed — all sound. `staff_complaints_ins` correctly handles the anonymous-vs-named submission split (`is_anonymous AND staff_key IS NULL`, or `NOT is_anonymous AND staff_key = my_key()`). `polls_ins` checks `has_permission('polls.create')` — under the session's known, already-documented testing-phase override (`has_permission()` forced `true`), any staff member can currently create a poll; this is the existing override's known blast radius, not a new finding.

**Realtime**: `notice_board_posts`, `polls`, `poll_votes`, `staff_complaints`, `feedback`, `feedback_comments` all confirmed in the publication and wired in the hook. **One gap**: `notice_board_reports` (a moderation/flagging sub-table) is NOT in the publication — low priority, a report being flagged live isn't a critical-path feature, but noting it for completeness.

**Data quality**: 0 `staff_complaints` rows with a `staff_key` that doesn't resolve to a real `profiles.agent_key`. Clean.

---

## 3. Attendance

**Functional (Adams)**: Dashboard renders real October 2026 data — calendar grid, exception/correction request entry points, monthly stats tiles.

**Bug found, NOT fixed (flagged for review)**: `useAttendanceMonth.ts` (`src/webnext/features/attendance/hooks/useAttendanceMonth.ts:112`) computes `onTimeRate = attended.length ? Math.round((onTime.length / attended.length) * 100) : 100` — when zero days have been attended, this defaults to a vacuous-truth **100%**. Observed live for Adams this month: 22 workdays, 0 days attended, 22 absences, 0% attendance rate — and the UI simultaneously shows **"100% on time"** as a headline stat. Mathematically defensible (100% of zero days were on time) but genuinely misleading displayed next to "22 absences" — reads as good performance when it's complete absence. The `onTrack` boolean itself is correctly `false` in this case (`onTimeRate >= 90 && absences <= 1` → `22 <= 1` is false), so the pass/fail badge isn't wrong, only the raw percentage tile. Not fixed here — it's a defensible-but-arguably-wrong default on real HR-facing business logic, exactly the kind of thing this batch's instructions say to flag rather than touch.

**Security**: `attendance_log`/`attendance_notes` RLS sound — staff see/insert their own, manager sees/updates all, no delete policy for staff (reasonable for an audit-style log).

**Realtime**: `attendance_log`, `attendance_notes` confirmed in publication and wired.

**Data quality**: n/a beyond the onTimeRate display issue above.

---

## 4. Leave

**Functional (Adams)**: Dashboard (`/dashboard/leave`), My leave plan (`/dashboard/leave/plan`), Emergency leave (`/dashboard/leave/emergency`) all tested live — all render correctly with real data (16 days remaining, 2 real past requests shown including a "reschedule requested" one and an "approved" one with a real reconciliation prompt: "Did you take your approved leave (2026-08-17)? ... Yes, I took it"). Emergency leave form explains its own real behavior clearly (bypasses balance/conflict blocking, SMS's Management immediately, Management decides).

Note: several navigation attempts during this batch hit transient `chrome-error://chromewebdata` / "Redirecting to sign in…" failures that resolved cleanly on retry, and the local dev server itself crashed once mid-batch with a Rust/Turbopack `memory allocation of 16777216 bytes failed` error (environment resource pressure, restarted cleanly). Neither is an application bug — recorded here only so a future session doesn't mistake transient infra noise for a real routing/auth defect in Leave specifically.

**Security**: `leave_requests` RLS is the most carefully-written policy set reviewed this batch — `leave_requests_ins`'s check clause explicitly blocks a staff member from self-inserting a request that's already `decided`/has a `decided_signature`/etc., closing an obvious self-approval hole. Sound.

**Realtime**: `leave_requests` confirmed in publication and wired (plus `useColleagueAvailability.ts` has its own direct read with a 5-minute staleTime, already noted in the hook's own comments).

**Data quality**: 0 stale pending (>30 days) leave requests, 0 requests with an invalid `days_count`. Clean.

---

## 5. Cross-app sync — the deep part

**Directory is the canonical staff identity** every other app's `agent_key` foreign-keys back to (`leads.agent_key`, `payments.agent_key`, `attendance_log.staff_key`, `leave_requests.agent_key`, `staff_complaints.staff_key`, etc.) — confirmed via schema, not assumed. This part of the architecture is sound and already "one system": every app resolves the same staff identity consistently, no drift found.

**Real gap #1 — Leave/Attendance status is not checked before work gets assigned.** Grepped `src/webnext/features/allocations/` for any reference to `leave_requests` or `attendance_log`: **none found.** A staff member on approved leave today can still be the target of a new allocation request, a confirmed allocation, or (per the earlier Site Visits batch's own findings) presumably a newly logged site visit — nothing in the assignment path checks real-time availability. This is a genuine, buildable cross-app connection: **Ops Tracker's own `useColleagueAvailability.ts` already solves this exact problem for its own "Assign Task" flow** (reads `leave_requests` directly, 5-minute staleTime) — the same real hook/pattern could be reused or mirrored for Allocations' own assignment UI, rather than each app re-inventing availability-checking independently. Concrete fix: give Allocations (and anywhere else that assigns a staff member to new work) the same `useColleagueAvailability`-style check, surfaced as a soft warning ("Adams is on leave through Nov 2") rather than a hard block — matching the system's existing pattern of informing rather than blocking (see Emergency Leave's own stated philosophy: "they'll see the conflict and decide").

**Real gap #2 — No staff-facing page shows attendance/leave status inline anywhere.** Directory (§1) has no staff-detail page to put this on. A real, concrete fix: either (a) add a lightweight expandable row/popover to each Directory staff card showing "Present today" / "On leave until Nov 2" / "3 absences this month" pulled from the same `attendance_log`/`leave_requests` tables already queried elsewhere, or (b) if a staff-detail page is ever built (per §1), that's the natural home for it. Either way, the data already exists — this is a pure UI-surfacing gap, not a new data requirement, consistent with the system's broader automation goal of showing facts the system already knows rather than making someone go look them up in a different app.

**Real gap #3 — `notice_board_reports` (moderation) isn't realtime** (§2) — low priority, noted for completeness, not a core cross-app sync item.

**No duplicate/drifting logic found** — Staff Hub's Complaints and Feedback are correctly separate, purpose-built tables, not accidental duplicates of anything else in the system (confirmed in §2).
