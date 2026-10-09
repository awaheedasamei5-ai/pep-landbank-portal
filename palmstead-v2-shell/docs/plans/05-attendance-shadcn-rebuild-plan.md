# Attendance — real-component UI rebuild (database → security → AI already closed; this plan covers UI only)

**Status: PLAN. Written before any code, per `.claude/skills/palmstead-app-build/SKILL.md` §2.5 and
the 2026-10-08/2026-10-09 standing correction (memory
`feedback-never-handcode-ui-use-real-resources-2026-10-08`): no hand-coded
dashboard chrome, use the shell's own real shadcn component system (the
one Finance/CRM/Analytics already use, per this repo's own `AGENTS.md`) —
the same treatment just applied to Leave.**

## 0. What's already real and closed — not touched by this plan

Confirmed live against `sbydzrlzqxcdbudjaube` before writing this doc (skill step 0.4):
`attendance_log` (21 cols), `attendance_policy` (10), `office_locations` (9),
`attendance_exceptions` (13), `attendance_notes` (9), `attendance_reviews` (12,
orphaned — real open architecture question, not revisited here), `attendance_photos`
(9, orphaned — same). RLS, the server-side off-site trigger
(`recompute_attendance_offsite()`), the 4 AI capabilities (pattern-note
suggestions, suspicious-coordinate flags, anomaly explainer, and the
not-yet-built 10am/7pm brief) are all real, already built in earlier
sessions (see `project-attendance-real-gap-audit-2026-09-11`,
`project-attendance-v3-chapter01-gap`). None of this is rewritten —
only the screens.

## 1. Real gap found while reading the current code (not previously tracked)

`AttendanceExceptionsQueue.tsx` is Management's *decide* queue, but no
staff-facing form exists anywhere to actually *create* an exception
request (`attendanceExceptions.create()` is wired in the data source and
RLS, but nothing in `AttendanceScreen.tsx`/`AttendanceCheckInScreen.tsx`
calls it). This plan adds the missing staff-facing request form as part
of the rebuild — a real functional gap, not scope creep, since every
other piece of this workflow already exists.

## 2. Current architecture (what's being replaced)

`AttendanceScreen.tsx` is a single page with a `view: 'mine' | 'management'`
state toggle — the exact pattern Leave was rejected for. `AttendanceManagementScreen.tsx`
is itself a four-way `tab` state toggle (Today/Records/Exceptions/Policy&Locations)
inside that. All hand-rolled CSS modules. The underlying hooks
(`useAttendance`, `useAttendanceManagement`, `useAttendanceMonth`,
`useAttendanceComparison`) and lib (`attendanceGeo.ts`, `attendanceRosterLogic.ts`,
`attendancePhotoQueue.ts`) are real, correct, and unchanged by this plan —
only the screens consuming them are rebuilt.

The full-screen camera check-in flow (`AttendanceCheckInScreen.tsx` +
`CameraFeed`/`LocationDisplay`/`AttendanceActions`/`AttendanceHeader`) is
a genuinely specialized widget with no shadcn or reference-repo
equivalent — already uses plain Tailwind (not a CSS module), already a
real considered UX (matches the Homebase/Deputy research on file from
the earlier `ATTENDANCE_BLUEPRINT.md` pass: GPS + live camera, step-by-
step reason capture). It stays as its own full-screen overlay, triggered
from the dashboard's primary Check In/Out button — this *is* "check-in
as the primary visual element," not a regression from it. Only its
outer chrome (buttons, text styling) gets lightly touched for
consistency with the shadcn `Button`/`Badge` set; the camera/map/GPS
internals are untouched.

## 3. Real design resource

Same foundation as Leave: this shell's own shadcn/ui library
(`src/components/ui/`), the same primitives Finance/CRM/Analytics use,
plus the shared wrappers already built for Leave (`PageHeader`,
`StatCard`, `ConfirmDialog`, `SubmitButton`, `FormItem`, `TableEmpty` in
`src/components/`) — reused here, not reinvented. Additionally drawing on
the real Homebase/Deputy screenshots already researched and saved in
`ATTENDANCE_BLUEPRINT.md` during the 2026-09-11 web-next pass: named
exception pills ("Missing clock out" style) instead of a generic status
tag, and a map-pin-behind-a-confirm-card pattern for the check-in
screen's location display (already how `LocationDisplay.tsx` works —
confirmed, not rebuilt).

## 4. Page architecture

```
/dashboard/attendance                       Staff dashboard (home): today's
                                             status + primary Check In/Out,
                                             month KPI card, calendar
                                             heatmap, you-vs-team comparison,
                                             "My exception requests" teaser
/dashboard/attendance/exceptions            Staff: full request history +
                                             "Request an exception" form (NEW)
/dashboard/attendance/management            Management dashboard (home):
                                             team-today, AI suggestions,
                                             teasers into records/exceptions/settings
/dashboard/attendance/management/records    Full records table + filters +
                                             correction Dialog (per-row,
                                             not a separate route — same
                                             pattern as Leave's ConfirmDialog)
/dashboard/attendance/management/exceptions Full exceptions decide-queue
/dashboard/attendance/management/settings   Policy + office locations
```

Check-in itself stays an in-flow full-screen overlay (not a nav route),
launched from the dashboard's primary button — matches the explicit
"check-in is the primary element, not buried" rule and how a real
time-clock app (Homebase/Deputy) actually behaves: punching the clock is
an action, not a page you navigate to and from.

## 5. Build order

Screens only, in this order: Staff dashboard → staff exceptions page →
Management dashboard → Management records → Management exceptions →
Management settings. Each verified live (manager + staff test accounts)
before moving to the next. Commit after each real slice, per the skill's
"commit and push regularly" rule.
