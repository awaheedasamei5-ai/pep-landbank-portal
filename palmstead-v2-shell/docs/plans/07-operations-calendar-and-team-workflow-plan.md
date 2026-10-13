# Operations Tracker — Team Calendar, Meetings, and Work Coordination

**Status: schema audit complete; RSVP safety migration applied and privilege-checked; first meeting/calendar UI slice implemented locally; release verification remains incomplete.** Targeted Biome checks pass. A production build could not start because Next.js was denied while canonicalizing the Desktop checkout path, and no safe Supabase development branch is available for manager/staff mutation and realtime tests. Do not treat this slice as released or verified. This expands the existing Plane-derived Operations Tracker into a coordinated work system while preserving the existing personal schedule, issue workflows, and reports work. The event/invite model already exists in V2; reuse it and do not create duplicate event tables.

### Work completed so far (2026-10-13)

- Applied the reviewed `respond_to_schedule_invite` security migration to V2 and verified direct client UPDATE is revoked while authenticated RPC execution is granted. No event rows were changed.
- Wired meeting creation, internal staff invites, event details/edit/cancel, and attendee accept/decline into the V2 My Schedule calendar, alongside existing `op_todos`. Added a phone-width list view and a manager/organizer event edit boundary.
- Added RLS-scoped realtime invalidation for meeting and attendee changes so managers can observe RSVP updates as well as invitees. This subscription behavior still needs runtime confirmation.
- Targeted Biome checks pass for the three calendar files. Production build and whole-repo TypeScript verification remain blocked/unverified; do not claim management/staff sync or device reminders are tested.
- Still missing from this slice: editable attendee lists after creation, a dedicated management team calendar/invitation inbox, meeting reminder delivery, event history/audit integration, and safe role-based runtime testing. These remain plan work, not implemented controls.

The calendar is only one part of the user's requested V2-wide quality and feature rebuild. Continue the repository's other existing plans for dashboard, Accounting, Operations, and the remaining staff/management apps; do not mark the overall app complete when this calendar slice is done.

## 1. Intended result

Operations should become the place where Palmstead can see what work exists, who owns it, when it is due, when people need to meet, and what happened next. It must support a shared team calendar without confusing three different things: a project issue (work with status, history, and project context), a scheduled personal/delegated to-do (`op_todos`), and a calendar event (a time-bound meeting or work block with an organizer, attendees, and responses).

The calendar aggregates records without copying issues/tasks or turning a meeting into an issue: personal/delegated to-dos remain in `op_todos`, and meetings/invitations remain in the existing V2 `schedule_items`/`schedule_item_invitees` model. Staff must be able to see their own schedule and invitations, respond, complete assigned to-dos, and open linked project work. Management must be able to plan the team and view attendance/RSVP state without treating counts as employee performance scores.

The requested overall feel is Google Calendar's dependable time grid and event composer, combined with Plane/Linear's issue context and project navigation. It should remain a Palmstead application on this repo's existing Next.js/shadcn foundation, not a generic template and not a literal port of Google Calendar.

## 2. Ground truth and constraints

Follow `docs/CONTINUE_HERE.md`, `AGENTS.md`, `.claude/skills/palmstead-app-build/SKILL.md`, and the existing Operations plans. Work only in `palmstead-v2-shell/` on `rebuild`. The V1 root `index.html`, root migrations, `android/`, `www/`, `web-next/`, and V1 Supabase project are outside this change. V1 supplies business rules only; the approved UI foundation is this shell and the real open-source Plane port already under `src/openplane/`.

The current V2 Operations implementation is not empty. It has a command center with issue/status/priority summaries and recent activity; projects; project issue list and board; issue detail and activity/comments; cycles; modules; states/labels; saved views; a work queue; an audit log; reports; and the `My Schedule` tab. The personal planner is built on the shell's FullCalendar integration and supports month/week/day views, quick add by date/time selection, edit/delete/complete/cancel, drag reschedule, simple daily/weekly/monthly recurrence (materialized and capped at 12 items), a conflict warning, an in-app due/overdue summary, and an existing scheduled SMS reminder job for `op_todos`. The V2 database also already contains the separate `schedule_items` model with `kind='meeting'`, invitee RSVP rows, attachment rows, task history, meeting location, and a server-side push alarm for `kind='todo'`. Partial client data adapters for meetings and RSVP remain under `src/webnext/`; those are not wired into the active V2 Operations screen.

The 2026-10-13 dashboard quality pass already corrected bounded query pagination, recent-activity lookup, retry/error feedback, stale-data warnings, and mobile stacking. It was read-only verified at 390 px and desktop for a real staff account and management account. Preserve this existing work and the separate Reports plan/route. Its verification did not exercise the entire product at every device width, so the new calendar pass still owns mobile calendar, project pages, details, and dialogs QA.

Current product limitations from the code and `03-operations-tracker-plane-port.md`:

1. `My Schedule` queries only rows assigned to the signed-in key in `op_todos`; it does not aggregate the existing `schedule_items` meetings or invitee records.
2. `schedule_items` already models meetings, attendees, three RSVP states, venue, recurrence fields, attachments, and activity support. It has no timezone or meeting URL column, and active V2 Operations currently does not expose its meeting workflow. Do not create a parallel event/attendee schema before evaluating this existing model.
3. The calendar currently groups user actions in a tab on `/dashboard/operations`; its selected tab and date range are not separately addressable, shareable routes. Month/week/day are available, but no Manager team/resource view, attendee response inbox, event change/cancel flow, invitee management, or project event feed exists.
4. An existing user can create and manage their own calendar to-dos; that does not mean they can invite another person or see that colleague's private schedule.
5. V2 has an active push subscription table, `send-push`, and `send-todo-alarms`. The alarm function currently targets only open `schedule_items` rows of `kind='todo'` starting now (up to a three-hour catch-up window); it does not remind meeting invitees or `op_todos` recipients. The existing SMS cron covers `op_todos`. Browser push cannot be claimed until active V2 Operations has a verified opt-in path and delivery QA.
6. `schedule_item_invitees` RLS lets each invitee update their own row with broad row-level column access, including identity fields. RSVP must be moved behind a narrowly scoped database function (or column-restricted grants) before the active UI enables responses. Existing `schedule_items` RLS already scopes organizer, assigned staff, invitees, and managers; preserve and test it instead of creating a second event model.
7. The prior status in `03-operations-tracker-plane-port.md` explicitly excluded multi-attendee invites from the personal todo slice. This plan closes that separate gap while preserving `op_todos` and the existing V1-derived `schedule_items` as distinct operational sources.

Read-only inspection of the connected V2 project `sbydzrlzqxcdbudjaube` confirmed `profiles(agent_key)`, `my_key()`, `my_role()`, all three schedule tables, the constraints and RLS policy expressions, and realtime publication membership for `schedule_items`, `schedule_item_invitees`, and `messages`. The live publication does not include `push_subscriptions` (device endpoints must not be exposed through client realtime). `messages` has sender/recipient RLS and realtime; it can support existing in-app conversation updates but is not a calendar-specific invitation ledger. `send-push` and `send-todo-alarms` are deployed, and VAPID configuration is read by the alarm function without exposing secret values. No email Edge Function was found. No live database changes were made. The V1 project is never a fallback.

## 3. Research and product decisions

### Calendar and meeting behavior

Google Calendar treats an event as a date/time range with a time zone, recurrence, guests, location, description, status, reminders, and optional attachments. Recurring events require both an event start/end and a recurrence rule; edited or cancelled instances must remain distinguishable from their series. Guest responses are real states, not merely an avatar list. Event changes/cancellations and attendee responses generate notifications separately from personal reminder settings. Google also documents a critical privacy distinction: one user's reminder choices are not automatically shared with invitees. The app should adopt those separations.

Microsoft Graph models an event with attendees, organizer, start/end time zones, location, recurrence, reminder timing, cancellation state, and response status. This confirms the event and attendee records need independent lifecycle state and stable time semantics. Linear's project model helps keep time-bound plans connected to projects, issues, milestones, and owner context; its Inbox provides a useful distinction between actionable notifications and ambient activity.

### Source code worth adapting

The approved project foundation remains `makeplane/plane` for issues, states, projects, and filters. Its frontend source is already duplicated as `src/openplane/`; do not add Plane's Django contract or create an unrelated parallel task system. For scheduling workflow architecture, Cal.com is a real open-source scheduling reference with booking lifecycle and attendee/invitation concepts. Its codebase is large and has licensing/integration scope beyond this internal calendar; use only reviewable interaction patterns and map them to Palmstead's Supabase schema. OpenCalendar is a smaller, self-hostable reference whose repository describes today's/upcoming meeting actions and accept/decline paths; verify exact source files/licensing before copying any code. Do not copy a UI-kit preview as if it were functioning source.

### UI visual references and the role of Pinterest

Pinterest results reviewed include [Seektask — Team Task Management Dashboard Calendar](https://ph.pinterest.com/pin/seektask-team-task-management-dashboard-calendar--430797520615644281/), [Calendar Task Dashboard UI Design](https://in.pinterest.com/pin/calendar-task-dashboard-ui-design--927319379512951113/), and [Calendar/Schedule Management Dashboard](https://uk.pinterest.com/pin/calendar-schedule-management-dashboard--78039006038977219/). These are inspiration boards, not authoritative interaction specs: apply visual hierarchy, compact event density, readable color labels, and event context, but do not copy decorative card layouts or imply that the referenced mockups provide working behavior. The selected actual calendar component remains `src/components/calendar/event-calendar-views.tsx` (FullCalendar), which the project already uses. The app must use semantic tokens and Palmstead's established shadcn components.

### Product decisions

- Keep issue/task status on `op_issues`; keep the current Operations personal planner on `op_todos`; use the already-live `schedule_items` meeting rows and `schedule_item_invitees` RSVP rows for the meeting calendar. Aggregate these sources in one calendar with clear type labels and links back to each source record. Do not create duplicate event/attendee tables.
- Add a staff RSVP surface (`Accepted`, `Declined`, `Needs response`) and a manager team calendar / attendee roster. An invite is not accepted simply because it appears on a calendar. The current database supports exactly those three states; do not display `Maybe` until the database constraint and flow are deliberately extended.
- Existing meeting rows store a local `date` and local `time` without timezone. Render using the verified Palmstead workspace timezone `Africa/Accra`; do not imply per-event timezone support or cross-zone collaboration until the schema supports it.
- Internal invitations initially target active Palmstead profiles, not arbitrary external email addresses. External guests, Google/Outlook account sync, room booking, video-link generation, and public booking links each need a separately configured provider and abuse/privacy review; do not present fake integrations.
- Invitation and RSVP visibility is initially provided by the existing database rows and member-filtered realtime subscriptions; it is separate from reminders. Do not promise email, SMS invitations, or meeting push reminders. The current push job only sends a device push for an open `schedule_items(kind='todo')` at its start time.
- Every event mutation must be auditable. Cancelling is a status transition with notification, not a silent hard delete. Deleting personal todos remains separate and follows existing `op_todos` behavior.
- Use real-time subscription and normal refetch-on-focus as a redundancy pair. The three relevant current tables already belong to `supabase_realtime`; verify subscriptions at runtime and preserve scoped RLS filters. A visible stale/reconnect state is required; realtime subscription code without reconnect tests is incomplete.

## 4. Database layer (verified current schema; narrowly-scoped safety migration)

The live V2 project already contains the domain records needed for the first meeting/calendar slice. Reuse them; an extra `op_calendar_events` / attendees / inbox/outbox stack would create competing truths and duplicate existing functionality.

| Existing V2 table | Verified fields and behavior | Use in active Operations |
| --- | --- | --- |
| `schedule_items` | `kind` supports `task`, `todo`, `meeting`; meeting location; title, description, notes, date, start/end, owner/assignee, status, recurrence, related-lead/site-visit, and push-notified fields. Existing RLS covers organizer/assignee/assigner, invitees, and manager. | Meetings, invitations' parent record, meeting detail, calendar date/time. Keep `op_todos` as the separately permissioned personal/delegated Operations planner. |
| `schedule_item_invitees` | Unique event/staff pair; status check allows `invited`, `accepted`, `declined`; stores response timestamp. RLS lets invited staff read/respond, owners and managers manage the attendee rows. | Invitee inbox, RSVP counts, manager roster. |
| `task_events` | Existing task event record and `can_see_task()` RLS. | Reuse only where actual schedule/task lifecycle writes already log here; verify meeting coverage before relying on it as audit. |
| `schedule_item_attachments` | Event foreign key, filename/storage path/content type/uploader and visibility RLS; existing bucket conventions documented in source. | Meeting/task supporting documents after confirming Storage rules and UI use. |
| `messages` | Recipient/sender access, read flag, realtime membership. | Do not repurpose chat content as the meeting notification ledger. Realtime RSVP/event changes can power the initial in-app state; a purpose-built inbox can be scoped later if the current global inbox supports it. |
| `push_subscriptions` | Per-owner endpoints, RLS on insert/update/delete; intentionally absent from realtime. | Server-only delivery lookup. Never expose subscription secrets/endpoint rows in client queries. |

The active Operations screen uses `op_todos` today and does not use meeting adapters already present in `src/webnext/data/source.ts`. Port the verified meeting flow into the active route, or move shared domain operations into a deliberate V2 service layer. Do not extend the superseded top-level `web-next/` app. The calendar aggregates `op_todos`, meetings/invitations from `schedule_items`, and date-only issue deadlines. Keep each source's ownership, status, and history intact.

### Safety change required before RSVP UI

Current invitee UPDATE RLS validated row ownership but could not limit which columns were changed. The approved migration added `respond_to_schedule_invite(invitee_id, response)` with an empty search path, explicit auth check, `my_key()` ownership check, accepted/declined-only responses, server-set `responded_at`, and foreign-row rejection. It revoked direct UPDATE from client roles and grants the RPC only to `authenticated`. The exact applied DDL is recorded in `08-operations-calendar-schema-draft.sql`. Live privilege checks confirmed the intended grant boundary; authenticated mutation-flow tests remain to be done after UI wiring.

No new reminder table is needed for first slice: an active one-minute `send-todo-alarms` function already dispatches web push for due `schedule_items(kind='todo')`, and the active `send-op-todos-sms-reminders` cron covers `op_todos`. Neither currently sends meeting invitations or meeting reminders. Don't claim either behavior until the push path is extended and verified safely. There is no V2 email Edge Function. Event and invitee tables are already in `supabase_realtime`; test member-filtered subscriptions and reconnect/refetch.

## 5. Security and permission model

The UI role switch is not a security boundary. Keep the existing database-enforced schedule access, and close the direct invitee-row update gap before exposing RSVP controls.

| Action/data | Staff | Management |
| --- | --- | --- |
| Read personal todo schedule | Self-assigned existing scope | Their personal schedule by default; management's team view is separate and role gated. |
| Read calendar meeting | Organizer, assignee, invitee, and existing policy scopes | Manager policy can read the company schedule. |
| Create meeting | Own meeting; may invite internal profiles under existing policy | Company meeting; internal profiles only. |
| Edit/cancel meeting | Existing organizer/assignee permissions | Existing manager permissions. Cancellation is a status change, not a delete. |
| Manage invitees | Organizer/manager may invite or remove; invitee may only respond to own row through the RPC | Existing manager policy. |
| Read team schedule | Own/invited meetings only; no team-wide access to `op_todos` | Company meeting view; do not combine with staff private todos. |
| Manage reminders/subscriptions | No meeting reminder preference exists in this slice | No workspace reminder settings exist in this slice. |
| Read push subscriptions | Never from client | Never from client; server-only delivery reads. |

Current row access is enforced by the verified `schedule_items` and `schedule_item_invitees` RLS. The identified issue is overly broad UPDATE privilege on an invitee's own row: RLS checks row ownership, not which columns change. The draft revokes direct client UPDATE and exposes only a fixed accepted/declined RPC which derives the identity from `my_key()`. Test own invite, another person's invite, a non-meeting row, anonymous caller, and manager before shipping RSVP UI. No outbox/provider credential table is part of this first migration. Realtime payload access remains governed by existing SELECT policies.

Before rollout, write policy tests for unauthenticated, staff organizer, invited staff, unrelated staff, manager, removed attendee, and cancelled meeting. Verify existing SELECT and write paths plus the new RSVP RPC. Any security error blocks UI enablement.

## 6. AI touchpoints

There is no AI dependency for core calendar correctness. Do not add chat, invented recommendations, or automatically schedule people based on guesses. Later, the real app AI layer may draft an agenda from linked issue descriptions and draft project updates from recorded changes, but it must:

- use only source records the current user can already read;
- produce an editable draft and show linked source references;
- never send an invitation, alter attendees, choose times, or notify staff without a user-confirmed save;
- not infer attendance, employee performance, urgency, or project health beyond stored facts;
- log AI provider/errors separately without sending confidential meeting details to an unapproved model.

Phase 1 delivers no AI touchpoint; this is an intentional boundary, not a missing placeholder.

## 7. UI architecture — routed pages and roles

Keep one Operations Tracker app in the Office navigation. Inside the app, use secondary navigation that routes to real pages rather than state-only tabs. Deep links preserve active page/date/project/filter and are refreshable. Do not create an unrelated second Calendar app. Every list page fills the available width; form/detail panels have a deliberate readable cap centered within the available content. Use the real icon set and semantic tokens. Do not use a flat card grid as the primary screen.

### Shared shell and staff pages

`/dashboard/operations` — **My Operations / management Command Center**. Maintain a distinct staff home with assigned open work, due/overdue items, today's schedule, invitations needing response, and recent changes. Management sees company-wide operational summaries, blocked/overdue issue register, project health context, workload by project and team, meeting/RSVP attention, and quick actions. Both versions use real issue/activity/event queries; no fabricated KPI values. A manager must drill from totals to the rows they represent.

`/dashboard/operations/schedule` — **My Calendar** (all staff and management), routes: month/week/day/agenda, date navigation/today, project/source filters, types, status, and own calendar category visibility. Mobile defaults to agenda/week list; desktop can use the time grid. The calendar header and filters wrap without clipping. Events carry a small type cue, title, time, project/source context, and RSVP state where applicable. Event details open a route/dialog with title, attendees, location, notes, recurrence, reminder state, source link, edit/response/cancel actions permitted by role.

`/dashboard/operations/invitations` — **Invitations** (all roles), with Needs response / Accepted / Declined / Past; event detail; accept/decline; clear cancellation/update state. A response writes exactly one recipient's attendee row through the reviewed RPC and appears to the organizer without reloading.

`/dashboard/operations/my-work` — **My Work** (staff-first), assigned issues, scheduled to-dos, due dates, completion actions, status, filters, and links into projects. Management may switch into their own work view but not masquerade as staff. This aggregates records and does not replace source-specific records.

`/dashboard/operations/projects` — **Projects** workspace list with search, status, owner, dates, member counts, and real create form (permission-aware). On narrow screens, use compact project rows and filter panel; do not squeeze a 5-column table to unreadable width.

`/dashboard/operations/projects/[projectId]` — project overview with tabs that route to Issues, Board, Calendar, Cycles, Modules, Views, Activity, and Settings. Project Calendar filters the shared schedule to events and linked work scoped to that project. Project settings remain within the Operations app and are permission checked.

`/dashboard/operations/projects/[projectId]/issues/[issueId]` — existing detail page is preserved; add links from calendar and meeting records, never clone issue details into event notes.

`/dashboard/operations/reports` — keep the separately planned report route. Its date/range filters and staff scope rules remain as defined in `06-operations-reports-plan.md`; calendar events are not included in task-completion counts without an explicit report definition.

### Management pages

`/dashboard/operations/team-calendar` — privileged resource calendar. Management can switch staff and inspect meetings/RSVP state. It must not imply `op_todos` private schedules are part of the team view unless their RLS explicitly permits that query. Show filter scope and the `Africa/Accra` workspace timezone prominently. Never score staff by calendar density.

`/dashboard/operations/meeting-management` — upcoming/past meetings, organizer/project/type, response counts, attendee roster, cancellation/reschedule and changes audit. Selecting a meeting opens its full detail. Management can create an event with invitees using searchable staff picker (group selection only if real departments exist in the verified profile model).

`/dashboard/operations/settings` (inside Operations only, manager gated) — workspace default timezone, working hours, standard reminder defaults, allowed internal invite scope, and team notification channels. User-level push/SMS preferences live in personal account/device settings, not manager workspace settings. Do not show controls unless a real persisted setting exists.

### Event and task composition

Create from a calendar slot or `New meeting`: title, date, start/end, description/agenda, meeting location, and internal invitees. Existing rows store local date/time; display the verified workspace zone `Africa/Accra`. Default organizer is current profile; use a 30-minute duration only when the user selects a timed slot. No arbitrary invitees or silently generated join links. Validate title, end-after-start, date/time, and duplicate attendees. Existing recurrence columns are not yet a tested meeting-series workflow; do not imply edits to one instance vs series. For deletion/cancellation, retain the row and set `cancelled`. Invitation/RSVP state uses the existing database rows and scoped realtime/refetch, not an unbuilt email/push delivery queue.

## 8. Interaction patterns and responsive behavior

Use `EventCalendarViews` and its existing FullCalendar adapter; inspect local component source and Next docs before implementation. Do not edit protected `src/components/ui/` or `src/components/calendar/` files. Apply customization at Operations call sites. Test light/dark themes and variable shell/sidebar widths.

- Desktop team view: member/project lanes only where space supports them; visible hour labels, now line, readable overlap stacks, small persistent date range, drag create/move/resize with a confirmation where moving a shared event notifies attendees.
- Mobile: no desktop hour grid scaled down to unreadability. Use list/agenda day view with day/date switch, same event details and create capability. If a compact week strip is added, it is a navigation aid; it must not be the only way to reach events. Stacked modal fields, full-width safe buttons, no fixed overlays, no page-wide horizontal scroll.
- Tablet/narrow desktop: allow calendar content scroll inside its own boundary; filters collapse into an accessible labeled panel; detail side-panel becomes dialog or dedicated route if there isn't enough width.
- Keyboard/accessibility: tab order, visible focus, labels, date/time input semantics, event colors supplemented by text/icon labels, announce save/RSVP result, do not encode RSVP only by color, support Escape/close and browser back consistently.
- Loading, no-work, no-invitations, no-project, stale/offline, delivery-not-configured, conflict, and query-error states explain exactly what action is possible. Never present dummy events. Use `aria-live` only for concise mutation status.

Pinterest reference application: review visual framing only (clear calendar center, compact project/person filters, restrained source colors, readable event summary). Prefer the direct functionality of Google Calendar's event composer and the shell's real FullCalendar resource; do not reproduce ornate Pinterest mock cards as operational data entry.

## 9. Scheduling workflows and edge cases

### Create / edit / delete / cancel

1. User opens calendar at a selected date or time.
2. New meeting form loads active staff from the existing profile table; no unbuilt project-link/reminder settings are displayed.
3. Validate the title/date/time and prevent an end time earlier than the start.
4. Create the `schedule_items(kind='meeting')` record and its invitee rows; if attendee inserts fail after the meeting insert, clean up that newly created meeting and report the error.
5. Event/attendee changes appear through authorized realtime subscriptions; reconnect/focus refetches current state.
6. On edit, the existing row updates and its current attendee list stays attached. In-app UI must make clear that no email is sent.
7. On cancel, event status changes to `cancelled` and the calendar retains the item. Staff see that state after refresh/realtime; no cancellation push/email is claimed.

### RSVP and attendance state

Invited users can respond only on their own account row through the RSVP RPC; repeat action updates the existing row. Allowed states are `invited`, `accepted`, `declined`; there is no tentative state or response note in the verified schema. Organizers see response state and response time. A declined row is retained. No meeting reminder is currently scheduled. If a staff profile is disabled, historical event rows remain governed by existing access rules.

### Recurrence and timezone

The existing `schedule_items` model stores simple daily/weekly/monthly frequency fields on materialized rows; its proven personal-to-do implementation is separately capped at 12. Meeting recurrence, exceptions, DST behavior, and series notifications are not implemented. First meeting delivery is a single meeting at the organizer-entered `Africa/Accra` local date/time. Do not offer series editing controls until recurrence behavior and database representation are designed and tested.

### Conflicts and linked tasks

Conflict checking is non-blocking by default and labels whether the conflicting record is an event, assigned issue, todo, or approved/planned/pending leave. Do not block overlapping tasks that are date ranges. For exact-time meeting conflicts, compare only events/assigned timed todos visible to the current actor, name the source, and let the organizer proceed with an explicit acknowledgement when appropriate. Link to-do/issue source records once; a task marked done updates only the task status, not a meeting. Deleting/cancelling the source task does not delete the calendar event; show an unavailable-source marker.

### Notifications and device reminders

Invite/RSVP data and reminder delivery are separate. The invitation and RSVP state is stored in existing rows; the current realtime subscription can refresh screens while open. Existing browser push only covers a `schedule_items(kind='todo')` at its start time, and existing SMS covers `op_todos`. There is no meeting reminder preference/queue and no email Edge Function. Don't label an invite as email/push sent or show unavailable delivery controls.

## 10. Realtime and synchronization

The manager's event create/edit/cancel must reach invitees without logging out; staff RSVP must update manager counts without a manual hard refresh. Subscribe to `schedule_items` and invitees with RLS-derived filters. Never subscribe to all company attendee changes in a staff browser. Both tables already belong to `supabase_realtime`; verify scoped subscription behavior, refetch on focus/reconnect, dedupe repeated packets, and provide a visible manual refresh path.

## 11. Import/export and interoperability

ICS export and Google/Outlook sync are outside the first slice because the current record lacks a version/timezone model. Do not export guessed UTC values from local date/time columns. Revisit export only after timezone, UID/version, attendee email policy, and cancellation semantics are decided.

## 12. Migration, rollout, and rollback

1. Read-only inspect V2 schema, policies, functions, publication, and reminder Edge Functions. Completed for `sbydzrlzqxcdbudjaube`; no V1 access.
2. Review exact RSVP authorization DDL at `docs/plans/08-operations-calendar-schema-draft.sql`; it revokes direct client UPDATE and adds one response RPC only.
3. Apply that reviewed DDL before enabling RSVP mutation UI. No backfill, new event tables, or changes to existing schedule rows.
4. Verify role-scoped reads, manager/organizer create/edit/cancel, invitee self-response, foreign response rejection, and realtime membership/subscriptions.
5. Use existing invitee rows and member-filtered realtime/refetch for invitation and RSVP state. Push is only available for the existing to-do alarm path. No meeting email/push or notification queue is claimed.
6. Implement the shared calendar service and responsive Management and Staff routes. Check Next.js 16 docs, local component wrappers, existing calendar examples, and shadcn guidance first.
7. Test UI with local fixtures and live data read-only. The current V2 Supabase project is real operational data; never create/delete production meeting/test tasks to verify. If no safe test backend exists, mark write and live sync flows not verified.
8. Roll out to manager pilot, then staff after authorization and usability checks. Rollback disables the new UI; no event data migration/backfill is part of this slice.

No commit/push/deploy is part of the current local planning phase. On verified slices, follow the repo's branch workflow. A production Vercel deploy remains a separately reviewable release step; never merge `rebuild` to `main` without the user's explicit deploy instruction.

## 13. Testing and acceptance matrix

### Functional tests

- Organizer creates a 30-minute meeting and invites two internal staff in a safe test database. Event and invitee rows are created once; recipients see Needs response; organizer sees per-person RSVP.
- Recipient accepts/declines; only their attendee row changes through the RPC, organizer counts update live, and another staff user cannot impersonate their response.
- Organizer edits date/title/location, adds/removes an attendee, and cancels a meeting. No inbox, email, or delivery queue event is asserted.
- Personal scheduled todo create/edit/delete/complete/cancel/reschedule/repeat and existing conflict warning remain intact. Task operations never mutate meeting rows.
- Meeting and todo sources open their canonical details; each source's own status remains authoritative.
- Filters for month/week/day/agenda, meeting/todo type, staff (management only), RSVP, and due work produce real matching rows. Empty and error states are tested.
- Local date/time is rendered in `Africa/Accra`; test a range around midnight, sorting, and daylight/time-zone formatting assumptions without claiming per-event TZID support.
- Existing reminder behavior is read-only inspected; do not test-send a push/SMS/email to live staff.

### Security tests

Exercise direct authenticated API calls for own, invited, unrelated staff, organizer, manager, and anonymous identity. Confirm client roles cannot directly update invitee rows, the RPC accepts only an authenticated invitee's own meeting RSVP, and unauthorized/foreign IDs fail. Confirm existing schedule RLS and manager-only team read behavior. Do not read push subscription records from the client.

### UI and device tests

Desktop 1440 px and 1024 px, tablet 768 px, phone 390 px and 360 px, light/dark mode, long event title, many invitees, overlapping meetings, no event, no response, slow query, transient realtime disconnect, and 200-row visible-range boundary. Ensure no page horizontal overflow; intentional calendar/table scroll stays inside its pane. Keyboard-only creation, dialog close/back, focus restore, screen reader labels, contrast and large text are checked. No floating/fixed controls obscure work.

### Role and sync test

Management and staff are verified against the same synthetic event in a safe environment: management creates/invites, staff receives/responds, manager sees response without reload, staff sees organizer's update/cancel, removed staff loses future access, and unrelated staff cannot see a meeting. Do not assert any live notification delivery. Existing project/task records remain unchanged.

Acceptance requires every critical workflow above to pass; TypeScript success alone is not completion. Keep verification partial if production mutations or external notifications cannot be safely tested.

## 14. Phased implementation order

**Phase A — evidence and design review:** completed for the live schema and current provider functions. Before code, inspect protected local FullCalendar adapters and relevant Next docs; compare exact reference source files/licensing; review the RSVP-only SQL draft.

**Phase B — Database:** apply the reviewed RSVP authorization fix only. The existing event/invite model already exists; do not create duplicate tables or alter old `op_todos` data. Additional meeting reminders/timezone/project links require separate reviewed requirements and DDL.

**Phase C — Security:** verify existing meeting RLS in role-claims tests, apply the RSVP RPC/column privilege change, and test the RPC against own/other attendee IDs before exposing the response UI. Existing realtime publication membership is confirmed.

**Phase D — AI touchpoints:** no AI in calendar v1; confirm the existing app agent cannot send schedule mutations. If a later agenda/update draft is built, implement as suggestion-only after access scope review.

**Phase E — Core UI/data:** event services/hooks, accessible event composer, event detail/change/cancel, shared My Calendar with task-source aggregation, staff invitation/RSVP pages; existing personal todo capabilities must not regress.

**Phase F — Management UI:** team calendar, team meeting list/RSVP roster, project calendar integration, role-protected Operations settings and management Command Center activity/context.

**Phase G — notifications and device reminders:** use row-level realtime updates and an RSVP-needed surface for the first slice. Only extend push after meeting recipient preferences, failure/retry handling, and a non-production test target are in place. Email provider does not currently exist. Avoid SMS or push test sends to live staff.

**Phase H — finishing and verification:** desktop/mobile/dark/accessibility, recurrence/timezone/conflict/empty/error/realtime, management/staff sync, integration with Reports semantics, update this plan with actual delivered work, then commit/push only after clean verification. Deployment remains separate.

## 15. What is deliberately outside first delivery

Two-way Google/Outlook sync, email address invitations for people without Palmstead accounts, free/busy visibility from external calendars, public booking links, video conferencing creation, meeting recording/transcription, room/equipment inventory, custom access groups not supported by current HR/profile data, automated time selection, AI sending, employee productivity scoring, bulk CSV import, and cross-timezone working-hours optimization. Each depends on integrations, scope rules, or verified business requirements absent from the current V2 schema. The implementation must not expose decorative controls for these capabilities.

## 16. References

- Google Calendar event model, time zones, attendees, recurrence: https://developers.google.com/workspace/calendar/api/concepts/events-calendars
- Google Calendar reminders, notifications, and delivery limits: https://developers.google.com/workspace/calendar/api/concepts/reminders
- Google Calendar invite and RSVP flow: https://support.google.com/calendar/answer/37161?hl=en
- Google Calendar event creation and time selection: https://support.google.com/calendar/answer/72143?hl=en
- Google Calendar Events API fields: https://developers.google.com/workspace/calendar/api/v3/reference/events
- Microsoft Graph event resource (attendees, recurrence, reminders, response status, timezone): https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0
- Linear Inbox and actionable notifications: https://linear.app/docs/inbox
- Linear project milestones and issue connection: https://linear.app/docs/project-milestones
- Plane OSS foundation: https://github.com/makeplane/plane
- Cal.com OSS scheduling source/reference: https://github.com/calcom/cal.com
- OpenCalendar team scheduling source/reference: https://github.com/kudretyilmazz/opencalendar
- Pinterest visual pins listed in §3; visual inspiration only.
