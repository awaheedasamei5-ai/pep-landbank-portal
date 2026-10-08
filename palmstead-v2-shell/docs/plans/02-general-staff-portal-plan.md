# General Staff Portal — Build Blueprint (OSS build order, item 2)

**Status: Part A (foundation) and Part B (7 of 15 modules) complete and detailed below. Part C lists the remaining 8 modules at research-inventory depth only — each needs its own dedicated research pass (real repo file reads, UI research) before it gets the same level of detail, per the standing plan standard. Do not start building a Part C module from this document alone.**

Source repo: `sarmakska/staff-portal` (github.com/sarmakska/staff-portal), cloned and read directly — not from its README alone. Full real file tree, `ARCHITECTURE.md`, all 25 numbered migrations, `components/layout/sidebar.tsx` (full), `app/(app)/directory/directory-client.tsx` (partial) read in this research pass. Full list of what was and wasn't read is in the Sources section at the end.

V1 parity check: ran against the real production `index.html` (main branch). Of the ~15 modules this repo covers, only two have a real V1 equivalent worth preserving logic from — **Announcements** (News & Announcements, a company-wide broadcast feature) and **Team Feedback** (staff → management feedback, distinct from client complaints). Everything else — Directory, Notice Board, Calendar, Complaints (staff/HR, not client), Corrections, Diary, IT Tickets, Polls, Reception/Visitors, Timesheets, Wellness, a shared Settings/Profile surface, an office seating canvas, and an AI chat bubble — has no V1 equivalent at all. This was confirmed by grep across all 26,587 lines of `index.html`, not assumed.

V2 blueprint (the published "Palmstead V2 Blueprint" artifact) and the V3 PDF (`Palmstead_V3_COMPLETE_Professional_Rebuild_Master.pdf`) were both re-checked for any of these 15 module names — neither document mentions any of them. Both predate the OSS-foundation strategy pivot (2026-09-11) and are organized entirely around V1/web-next's own app list. This means for this item, **the governing inputs are: V1 logic only for the two overlapping concepts, the real OSS repo's own source code as the primary spec for everything else, live UI/UX research, and the OSS-foundation master instruction's cross-app integration principles** — not V2/V3, which simply have nothing to say here.

---

## Part A — Foundation (applies to every module below)

### A.1 Role & permission model — do NOT copy the repo's 5-role system

The real repo uses 5 roles (`employee`, `admin`, `director`, `accounts`, `reception`) with a static `roles: string[]` allow-list per nav item (see `sidebar.tsx`). Palmstead has 2 roles (`agent`, `manager`) and the real staff (Elias handles ops/payments, Emmanuel ops, Elizabeth contracts, Adams digital ops) don't map cleanly onto "director/accounts/reception" as fixed roles — V1 already solved this with named-individual permission carve-outs (`canManagePayments()` etc.), and today's V1 session built a genuinely intelligent, per-staff, per-app **Tool Access** system precisely for this shape of problem (Staff Settings → Full / View only / No access, per app, per person, with role-aware defaults).

**Decision: reuse and extend that same Tool Access model in V2, not this repo's role array.** Concretely:
- Every module in this plan becomes one more entry in a `tool_access` JSONB column on `profiles` (mirroring V1's schema), with a `defaultToolAccessLevel(toolKey, profile)` function computing a sensible default per person (e.g. "IT Portal admin view" defaults full only for Adams, matching his digital-ops role) and an explicit per-person override winning when set.
- **The V1 lesson, applied from day one, not bolted on after**: V1's Tool Access bug was that the UI layer (which nav tile shows) and the database layer (RLS policies) were never wired together — a grant updated Staff Settings but not the actual data access. In V2, every module's RLS policy is written to check the SAME `tool_access` override as the nav gate, from the first migration, not retrofitted after a gap is discovered live. A `my_tool_access(tool_key text)` SQL helper (same `SECURITY DEFINER` + `search_path` pattern already proven in V1 today) is part of the Core Infrastructure migration (A.4), before any module-specific table.
- A new Management-only **Staff Settings** screen (`/dashboard/settings/staff`, item 3 in the build order — this plan notes where item 2 and item 3 touch, but item 3 itself is out of scope here) is where these per-app grants get set, exactly like V1's real Staff Settings → Tool Access panel.

### A.2 Auth hardening — close the flagged gap from item 1's own notes

[[project-v2-shell-progress]] already flagged `auth-gate.tsx` as "not yet as strong as it should be: client-side redirect only, not middleware/cookie-enforced." The real repo's own `middleware.ts` + `@supabase/ssr` pattern (confirmed in `ARCHITECTURE.md`: "Session via `@supabase/ssr` cookies, refreshed in `middleware.ts`") is the real fix — adapt this shell's auth to the same pattern as part of Core Infrastructure, closing that gap as a side effect of building Core Infrastructure for this item, not a separate task.

### A.3 Navigation — adapted IA, not copied verbatim

The repo's real sidebar groups (`OVERVIEW / MY WORK / TEAM / OFFICE / FEEDBACK / ADMIN / ACCOUNT`) map onto Palmstead's existing group names with modules slotted in:

| Palmstead group (existing) | New modules added here |
|---|---|
| Office (existing: Memorandum, Quotation, Leave, Attendance, SMS, Expenses, Log Payment) | Notice Board, Polls, Corrections, Diary, IT Support, Wellness Hub |
| Communication (existing: Chat) | Announcements, AI chat bubble (extends existing Chat, not a new sidebar item) |
| New group: **Team** | Directory, Calendar, Office Today (seating canvas) |
| New group: **Reception** (staff-with-access only, mirrors repo's role gate via Tool Access instead) | Visitors, Reception desk view, Roll Call |
| Settings (existing, item 3's own surface) | Each module's own config lives inside ITS OWN Management view per the standing rule (feedback-oss-plan-standard-2026-09-12 point 3), not bundled into one generic Settings app — e.g. Notice Board moderation lives in Notice Board's own Management tab, not Settings |

Every nav item routes through the SAME `hasToolAccess(toolKey)` gate (A.1), not the repo's static role array.

### A.4 Core Infrastructure migration (build this first, before any module screen)

One migration, mirroring the repo's `001_initial_schema.sql` structure but scoped to what's genuinely new for Palmstead (profiles/departments/locations already exist in some form — audit against the live schema before writing this, don't assume the repo's shape 1:1):
- `my_tool_access(tool_key text)` helper function (A.1).
- `departments` / `locations` tables IF Palmstead doesn't already have an equivalent (check `app_config`/`office_locations` from today's V1 Attendance work first — `office_locations` already exists and may cover `locations` entirely).
- `audit_logs` table, matching the repo's real shape (`actor_id`, `action` enum, `entity_table`/`entity_id`, `before_data`/`after_data` JSONB) — this is genuinely valuable infrastructure every module below writes to, and Palmstead doesn't have a generic audit table yet (V1 has scattered activity logs per-feature, not one unified table).
- `user_approvers` (up to 3 approvers per person, priority-ordered) — useful if Corrections/Complaints need a routed-approval chain; confirm against real Palmstead management structure (is it always "Management," or does Elias/Emmanuel/Elizabeth approve their own team's requests?) before building this generically.

### A.5 Realtime sync — every module, from the start

Per the OSS-foundation master instruction (Section 8) and today's V1 lesson (a realtime channel that silently fails with no retry is worse than no realtime at all): every module's live-update channel goes through palmstead-v2-shell's own `useDashboardRealtime.ts` (already built, proven, covers leads/payments/allocations/etc.) — extended with each new table, not a parallel channel per module. No new `subscribeRealtimeTable`-equivalent without the same join-retry logic V1 just had to retrofit in.

---

## Part B — Modules with full detail (V1-parity-checked, repo-file-read, ready to build against)

### B.1 Staff Directory & Profile

**What problem it solves**: "Who is this person, how do I reach them, what do they do" — currently scattered across V1 (no dedicated screen) and this shell's own barebones `AccountSwitcher`.

**Real repo shape** (`directory-client.tsx`, `lib/actions/contacts.ts`): two tabs on one screen.
1. **Staff tab** — every active `user_profiles` row (name, display name, job title, email, phone, department, avatar), searchable, grouped/filterable by department. Read-only for a plain staff member; a profile click opens `/directory/[userId]` (read-only detail: role, department, location, desk extension).
2. **External Contacts tab** — a genuinely different, per-user feature: each staff member's own private rolodex of external people (name, company, email, phone, job title, notes) they personally deal with — NOT shared, NOT the Client Database. Real CRUD (`addContact`/`updateContact`/`deleteContact`), own-row-only RLS.

**Staff experience**: open Directory from the Team nav group, default to Staff tab, search-as-you-type by name. Tap a colleague to see their profile card (title, department, how to reach them — phone/email as tap-to-call/email links). Switch to "My Contacts" tab for their own external rolodex — add a supplier/partner/prospect they deal with outside Palmstead's own client system, edit or remove freely since it's theirs alone.

**Management experience**: same Staff tab, plus (new, not in the repo — Palmstead-specific addition per the OSS instruction's "modify to follow Palmstead logic") a lightweight presence indicator reusing the EXISTING `ensurePresenceSubscribed()`-equivalent real-time presence Palmstead already has in V1, so "who's online now" shows directly in the directory instead of being a separate feature. No separate department/location admin screen needed yet — Palmstead's staff count (7 people) doesn't need org-chart tooling the repo built for larger teams; department/location fields can be simple text/select on the profile rather than their own management tables, revisit only if headcount grows.

**Data model**: extends `profiles` (already exists) with `job_title`, `desk_extension` if not already present (check first). New table `external_contacts` (own-row RLS: `created_by = auth.uid()`), mirroring the repo's real shape exactly (name/company/email/phone/job_title/notes).

**Edge cases**:
- Deactivated staff (V1 already has `active` flag) — hide from Directory search by default, but keep reachable via direct link for historical reference (e.g. a note that references a now-inactive colleague shouldn't 404).
- No department assigned yet — show "Unassigned" group, not an error.
- External contact with no email AND no phone — allow it (a name-and-notes-only entry is still useful), just show neither icon on the card.

### B.2 Announcements

**V1 parity**: V1 already has a real company-wide "News & Announcements" feature with a dismiss-per-announcement mechanism (`dismissedAnnouncements()`/`dismissAnnouncement()` in index.html) and a bell-badge unread indicator. This is the ONE module where V1 logic is the primary spec, not the repo.

**What V1 already does right, to preserve**: per-user dismiss state (not "mark all read" company-wide), a bubble/badge showing unread count, Management-only authoring.

**What the repo adds that V1 doesn't have** (`lib/actions/announcements.ts` + the `/announcements` route, worth adopting): a dedicated category per announcement (matching the repo's `lib/announcement-categories.ts` — confirm its real category list before building, don't invent one), and a real list/archive view rather than V1's bubble-only surfacing — useful since Palmstead currently has no way to browse PAST announcements once dismissed.

**Staff experience**: a bell/badge (reuse V1's exact pattern) surfaces new announcements; tapping opens the Announcements screen — unread at top, a real archive below, each with author/date/category. Dismissing an unread one marks it read for that person only.

**Management experience**: compose (rich text, matching the repo's `rich-editor.tsx` component — confirm Palmstead doesn't already have an equivalent before adding a new rich-text dependency), pick a category, optionally set an expiry, publish. Edit/retract their own past announcements. See a per-announcement read-count (who's seen it, who hasn't) — genuinely useful for Management and not something V1 has today.

**Data model**: new `announcements` table (content, category, created_by, expires_at) + `announcement_reads` (announcement_id, user_id, read_at) replacing V1's localStorage-only dismiss tracking with a real server-side record — this ALSO fixes a real V1 limitation: dismissing on one device doesn't dismiss on another, since it's `localStorage`-only there.

### B.3 Notice Board

**No V1 equivalent** — net new. Real repo schema already read in full (migration 023): `notice_board_posts` (content, link_url, link_label, colour, created_by, expires_at). Real RLS: everyone reads, any authenticated person posts, ANY authenticated person can delete ANY post (`notice_delete_any` — an "open board" moderation model, worth keeping as-is, it matches a genuinely low-stakes physical notice-board metaphor).

**Staff experience**: a visual board (sticky-note-style cards, each with its own colour per the `colour` field) — "selling a desk chair," "anyone want to carpool," "team lunch Friday" — lighter-weight than Announcements (no author gravitas implied, no read-tracking, just a shared corkboard). Post one with an optional link (e.g. a poll link, a shared doc), pick from a small colour palette. Posts with an `expires_at` auto-fade/archive.

**Management experience**: same posting UI, no special admin powers beyond what any staff member has (the open-board model is intentional) — EXCEPT a Palmstead-specific addition: since this is real staff data in a small company, add a simple "report" action that notifies Management if a post needs removal for a reason beyond "I'm done with it," rather than giving every staff member unrestricted delete of everyone else's posts by default. This is a deliberate, documented deviation from the repo's `notice_delete_any` openness — a small 7-person team split between an open board (matches the repo) and unrestricted mutual delete power (a real moderation risk the repo's own larger-org assumption doesn't carry over cleanly) is worth Management's own call before building either way — **flag this as an open decision for the user**, don't silently pick one.

**Data model**: `notice_board_posts` as in the real migration, field-for-field.

### B.4 Polls

**No V1 equivalent** — net new. Real repo schema already read in full (migration 023): `polls` (question, options JSONB array, created_by, deadline, is_archived) + `poll_votes` (poll_id, user_id, option_index, one vote per person per poll via a real UNIQUE constraint). RLS: everyone reads polls and votes (so results are visible to all, not just the creator — a transparency choice worth keeping), any authenticated person can create a poll, only the creator can update/delete their own poll, a voter can delete their own vote (change their mind before the deadline).

**Staff experience**: "What should we do for the team lunch?" — pick an option, see live results (vote counts/percentages) immediately after voting, change vote before the deadline. Past/archived polls stay browsable.

**Management experience**: same creation UI as staff (intentionally not Management-exclusive, matching the repo — company culture/logistics polls don't need gatekeeping) PLUS a genuinely useful Palmstead-specific addition: an option to make a poll Management-only-create for anything operationally significant (e.g. "which Friday works for the office closure") vs. the open default for social polls — implement via the SAME Tool Access mechanism (A.1): a `Polls` tool access level could gate CREATE specifically, defaulting to full-for-everyone but restrictable.

**Data model**: `polls` + `poll_votes`, field-for-field from the real migration.

### B.5 Staff Complaints (HR/workplace, distinct from client complaints)

**V1 has a "Complaint" concept already, but it's the WRONG one to reuse** — V1's complaint/feedback system (98+158 matches in index.html) is entirely CLIENT-facing (a client's complaint about their plot/purchase), already fully built in the Sales desk as "Client feedback." This module is a different, staff-facing concept: a workplace grievance/HR complaint channel, genuinely new to Palmstead.

**Real repo schema** (migration 001): `complaints` (user_id nullable for anonymous, subject, message, severity enum low/medium/high/critical, category, is_anonymous, status submitted/investigating/resolved/closed).

**Staff experience**: submit a workplace concern — pick a category, severity, write it up, optionally submit anonymously (user_id left null). See their own past submissions' status (unless anonymous, in which case there's nothing to track back to them by design — the UI should make this tradeoff explicit: "anonymous submissions can't be followed up with you directly").

**Management experience**: a queue, filterable by severity/status, update status as it's worked (investigating → resolved/closed), add private resolution notes. Critical-severity ones should surface prominently (a real notification to Management on submission, reusing the SMS/notification infrastructure already proven in V1 today for allocation-due alerts).

**Edge cases**: an anonymous complaint with no way to ask follow-up questions — the UI must say so plainly at submission time, not let someone submit anonymously then wonder why nobody responded. A critical-severity complaint sitting unactioned for N days should escalate (exact threshold: ask Management, don't invent one).

**Data model**: `complaints` table as in the real migration, field-for-field.

### B.6 Team Feedback — gap-check against what already exists

V1 already has "Team Feedback" (staff-to-management feedback, distinct from both client feedback and the new HR Complaints above) — confirm it's genuinely ported/working in this shell already (check against item 1's own scope; if not yet ported, this becomes a real small item here) before building anything new under the repo's separate `feedback` table (migration 001: subject, message, category, status). **Do not build a duplicate feedback mechanism** — if V1's Team Feedback already covers this ground, this module in V2 is "port what V1 has," not "build what the repo has," same reasoning as B.2.

### B.7 Attendance Corrections

**Real overlap warning**: item 1 (Attendance/Leave, already shipped) may already have correction-request logic — the V1 Attendance work closed in today's own session mentions `AttendanceRecordsScreen.tsx`'s Management-side correction tool, and V2's own item-1 build (`project-attendance-v3-chapter01-gap` memory) mentions `attendance_exceptions` (pre-authorized) as distinct from a staff-initiated correction REQUEST. **Before building this module, re-read exactly what item 1 shipped for corrections** — this may already be 80% done, and this module's real remaining scope might just be the STAFF-facing "I want to dispute/correct a past clock-in/out" submission flow if that specific direction doesn't exist yet (item 1's `attendance_exceptions` is pre-authorization for an upcoming off-site event, not a dispute about an already-recorded entry).

**Real repo schema** (migration 001): `attendance_corrections` (attendance_id, user_id, field enum clock_in/clock_out/break_start/break_end, original_value, proposed_value, reason, status, reviewed_by/reviewed_at).

**Staff experience**: from their own attendance history, flag a specific day's clock-in or clock-out as wrong, propose the correct value, give a reason. Track status (submitted/approved/rejected/applied).

**Management experience**: a queue of correction requests, see original vs. proposed value side by side, approve (which should ACTUALLY APPLY the correction to the real `attendance`/`attendance_log` row, not just change the request's own status — the repo's `applied` status exists precisely to distinguish "approved in principle" from "actually written back," worth preserving that distinction) or reject with a reason.

**Data model**: `attendance_corrections`, adapted to reference Palmstead's real `attendance_log` table (not the repo's own `attendance` table name) once the item-1 overlap above is resolved.

---

## Part C — Remaining modules, inventory-level only (NOT ready to build from this document)

Each of these needs its own dedicated repo-file read (the real page/client/action files, not just the migration) and, where genuinely novel, live UI research on an established real app, before it gets a Part-B-equivalent section. Listed here with just what's confirmed from the file tree + schema pass so far, so the next research pass has a starting point:

1. **IT Tickets / Helpdesk** (`/it`, `/admin/it`) — real, substantial action file (445 lines: `lib/actions/it-tickets.ts`) referencing `it_tickets`/`it_ticket_comments`/`it_ticket_attachments` tables that **do not exist in any of the repo's own 25 tracked migrations** — a real gap in the source repo itself (confirmed via exhaustive grep, not assumed). Building this module means inferring the real schema from the action file's actual field usage, not copying a migration that doesn't exist. Flag this honestly if/when building — the "repo is the literal code base being edited" standard (feedback-oss-plan-standard-2026-09-12) assumes the repo is internally consistent; this one spot isn't.
2. **Wellness Hub** (`/wellness` + 4 sub-routes: breathing, events, my-journey, stretches; `/admin/wellness`) — same gap as IT Tickets: `lib/actions/wellness.ts` (513 lines) references `mood_checkins`/`wellness_events` tables absent from tracked migrations. Also the single most novel-to-Palmstead concept here (nothing resembling it in V1 or the master specs) — deserves real competitor/established-app research (e.g. how Headspace/Calm or an HR platform like Officevibe handles a lightweight daily mood check-in) before specifying it, not just porting repo code blind.
3. **Visitors & Reception** (`/visitors`, `/reception`, `/reception/today`, `/admin/roll-call`) — real schema already read (migration 001: `visitors` table, reference codes, badge numbers, check-in/out timestamps) — this one IS schema-complete from the migrations, just needs the real screen files read next.
4. **Timesheets** (`/timesheets`, `/admin/timesheets`) — no dedicated table found; very likely an aggregation VIEW over `attendance`, not its own data — confirm by reading `lib/actions/timesheet-export.ts` next.
5. **Calendar** (`/calendar`) — schema read (migration 001: `calendar_events`, sourced from leave/wfh/visitors/holidays via `source_table`/`source_id`) — a real aggregation layer over other modules' own events, build this AFTER the modules it aggregates (Leave is already item 1; Visitors/Corrections/WFH need their own pass first).
6. **Diary** (`/diary`) — schema read (migration 001: private per-user notes with tags + optional reminder) — closest V1 analog is V1's own "Notes" app (private per-agent notes already in ALL_GRANTABLE_TOOLS from today's work) — check for overlap before building a second private-notes feature.
7. **Office Today / seating canvas** (`/office`, `office-canvas.tsx`) — not yet read; genuinely novel concept (a visual "who's in today, where are they sitting" canvas) with no V1 equivalent and no schema read yet.
8. **AI chat bubble** (`components/chat/chat-bubble.tsx`, `app/api/chat/route.ts`) — ties directly into the OSS-foundation master instruction's AI Assistant requirements (Section 5: "must become a Palmstead intelligence layer... retrieve authorized information, summarize activities, identify overdue work...") — this is likely better scoped as part of build-order item 6 (AI Assistant) rather than item 2, since the master instruction describes a cross-ecosystem capability, not a staff-portal-local widget. **Flag for the user**: confirm whether this chat bubble belongs in item 2 or should be deferred to item 6 before building it.

---

## Sources

- `sarmakska/staff-portal`, cloned 2026-10-08, read: full file tree (`find`), `README.md`, `ARCHITECTURE.md`, `supabase/migrations/001_initial_schema.sql` (full, 427 lines), `supabase/migrations/023_polls_and_noticeboard.sql` (full), `supabase/migrations/016_work_schedules.sql` (full), `supabase/migrations/009_advanced_features.sql` (full), `components/layout/sidebar.tsx` (full, 253 lines), `app/(app)/directory/directory-client.tsx` (partial, first 120 of 452 lines), table inventory across all 25 migrations, table-name usage grep across `lib/actions/it-tickets.ts`/`wellness.ts`/`notifications.ts`.
- V1 production `index.html` (main branch, 26,587 lines) — grepped for all 15 module-name concepts; full read not needed since only 2 concepts (Announcements, Team Feedback) had any real match worth tracing further.
- "Palmstead V2 Blueprint" artifact (`082e4018-...`) — read in full for any of the 15 module names; none found, confirmed this document predates and doesn't cover the OSS-foundation module set.
- `Palmstead_V3_COMPLETE_Professional_Rebuild_Master.pdf` — full text extracted via `pdftotext`, grepped for all 15 module names; zero matches, same conclusion as V2 blueprint.
- **Not yet done**: live internet/UI research on established apps (explicitly required, same weight as the other 4 inputs per feedback-mandatory-app-build-process-2026-09-11) — needed for Part C modules especially (Wellness, Office canvas have no close V1/repo-complete precedent to lean on alone).
