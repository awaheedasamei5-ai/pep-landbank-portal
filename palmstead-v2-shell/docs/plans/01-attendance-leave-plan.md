# Palmstead V2 — Attendance & Leave — Full Build Plan

**Status:** Draft for review — no implementation started. Per standing instruction, this plan is presented before any code is written; execution begins only after you confirm or correct it.

**Governing process (OSS-foundation strategy, 2026-09-11, and this build order, 2026-09-12):** every app is built by forking/modifying the source of an approved open-source repo, grounded in Palmstead V1's real logic — not written from scratch, and not simply re-presenting the existing web-next implementation as "done." This document is Phase 1–3 of that process (Analyze V1 → Analyze the repo → Map repo-to-app) for Attendance + Leave specifically, the first item in your build order.

---

## 1. What V1 (the real production app) actually does today

I read the real, currently-used production source directly (`pep-landbank-portal`'s own `main` branch — confirmed via GitHub Pages API to be what's actually deployed and in daily use), not a description of it. Two systems, tightly coupled to each other and to Leaderboard.

### 1.1 Attendance — real behavior

**Data model (`attendance_log`):** one row per staff member per calendar day (`unique(staff_key, work_date)`). Sign-in and sign-out are both **partial upserts** against that same row (`onConflict: 'staff_key,work_date'`) — signing out never overwrites the sign-in timestamp, because each upsert only sends the columns it actually has. Columns captured: `sign_in_at/lat/lng`, `sign_out_at/lat/lng`, `late_reason`, `sign_in_reason`/`sign_out_reason` (off-site justification), `is_off_site_in`/`is_off_site_out`, `sign_in_photo`, accuracy-in-metres for both fixes, `device_info`, `notes`.

**Sign-in flow:**
1. Staff taps Sign In. `getCurrentLocation()` requests a real GPS fix (`enableHighAccuracy: true`, 10s timeout) via the browser Geolocation API — the exact same promise-wrapped pattern already reused for Banner Tracking's "use my location" button in this codebase.
2. `haversineMeters()` (great-circle distance) checks the fix against `CONFIG.officeLat/officeLng/officeRadiusMeters` (now `office_locations`, plural — multiple real office locations, not one hardcoded point).
3. If outside the radius, the UI requires a typed off-site reason before the sign-in is allowed to submit (`is_off_site_in = true`, `sign_in_reason` populated). If late (after `CONFIG.attendanceCutoffTime`, now `attendance_policy.work_start_time` + `grace_minutes`), a late reason is similarly required.
4. A photo can be attached at sign-in (`sign_in_photo`) — real column, real capability, but V1 stores it as a plain base64 data URI with no compression step and no offline retry. This is a genuine weak point (see §3.2).
5. Row is upserted; UI reflects "signed in" state immediately.

**Sign-out flow:** same shape, symmetric off-site check, no lateness concept (only sign-in has a cutoff).

**Staff-facing screen (`viewAttendanceApp`/`paintAttendanceBody`):**
- A live clock (`ATTENDANCE_CLOCK_TIMER`, ticks every second while the screen is open).
- Today's status + hours-worked-so-far (`attHoursWorkedStr`).
- **This month** stats: a donut/progress ring showing on-time rate, plus `days present / absences / on leave` KPI tiles. The "good/at risk" classification is deliberately strict, not a fuzzy amber zone: on-time rate ≥ 90% **and** at most 1 absence this month, or it reads "at risk."
- **You vs the team** (managers see everyone; staff see themselves ranked): horizontal bars, days-attended-based, sourced from the *same* `leaderboard_rows` RPC the Leaderboard app itself uses — deliberately, so these numbers can never drift from what Leaderboard shows.
- **Calendar heatmap** — a real GitHub-contributions-style grid, one cell per day, colour-coded (present / late / absent / on leave / not-a-workday / future), lazy-loaded a month at a time and merged into history rather than replacing it (so browsing the calendar backward never blanks the recent-history list underneath). Legend included.
- **Absence logic is leave-aware**: a day where the staff member holds a `planned`/`pending`/`approved` leave request covering that date is never marked absent — `staffOnLeave()` cross-references `leave_requests` directly. This exact cross-app correctness requirement is also in your own memory as a previously-found real bug (`isConfiguredWorkday` / leave-blocks-absence), already fixed once in web-next — must not regress in the rebuild.
- **Off-site tag**: any row shows "📍 At the office" or "📍 Off-site: {reason}" once an office location is configured.
- Management additionally sees **Team today** — everyone's live sign-in status for the current day.
- Real-time: `attendance-live` channel, INSERT/UPDATE/DELETE on `attendance_log`, patched directly into the in-memory arrays (not just a blanket refetch) so the calendar/KPIs update live without a flash.

**Management-only actions:** correct a record's sign-in/out timestamp (typo/device-error fix, RLS-gated to manager-or-owner, not just UI-hidden), delete a record, and a full reset-all (explicitly scoped to `attendance_log` only, for wiping test data before real usage begins).

**Already built correctly in web-next** (per your own prior sessions, confirmed present as real files): the calendar, month KPI card, team-comparison card, a **Records/Analytics screen** (date-range + staff filter, company-wide summary, per-staff comparison, branded PDF export) that V1 itself does not have, an **exceptions** flow (`attendance_exceptions` — a staff member requests an exception for a specific date, decided by a manager) that is also new relative to V1, and a **deterministic AI pattern-detector** (`attendanceRosterLogic.ts`'s `detectAttendancePatterns()` — 3+ late or 2+ absent in trailing 10 workdays = warning-worthy, a clean 10/10 = praise-worthy) feeding real "AI suggestion" cards on the management dashboard, with the AI drafting only the *reason sentence*, never the underlying judgement call. `attendance_reviews` is the real table this praise/warning flow writes to.

### 1.2 Leave — real behavior

**Data model (`leave_requests`):** `agent_key/name`, `year`, `dates` (jsonb array of ISO dates — not a start/end range; leave can be non-contiguous), `days_count`, `letter_text` (the full pre-generated formal letter, stored, not regenerated from parts later), `status`, `is_emergency`, `deduct_quota`, `decided_by/at/signature`, `reschedule_note`, two reminder-sent timestamps, and `used_confirmed_at`.

**Core rules (confirmed correct, keep as-is — do not "improve" these away):**
- Annual quota is config-driven (default 20 days), only **working days** count against it (Mon–Fri, public holidays excluded — both from the picker and the quota math).
- **Pure date-overlap blocking** for normal leave: two staff cannot hold overlapping normal leave; first to submit a date locks it, and a colleague attempting the same date gets a real-time warning before they can submit.
- **Emergency leave is the one exception** to that block — it can be filed on a date someone already holds, *always* requires a typed reason, and still requires Management approval (emergency does not mean auto-approved).
- Flow: staff selects date(s) + reason → submitted → Management approves / declines / **reschedules** (enters new date(s) + a reason, which actually moves the staff member's calendar, not just relabels the request) → staff notified either way, by SMS and in-app.
- **A day only counts as "used" once: approved, AND the date has passed, AND the staff member actively confirms they took it.** The annual-quota math still reserves the days the moment a request is planned/pending/approved (so nobody can stack requests past their real entitlement before confirming), but "Reserved" and "Confirmed used" are shown as two distinct, never-conflated numbers. This was a real, explicit user correction in a prior session and must not regress.
- The leave letter is a **real pre-generated formal letter** with a fixed header/body/bulleted-dates/signature-block structure (`buildLeaveLetterText`/PDF in V1; `leaveLetterPdf.ts` in web-next, already verified byte-for-byte against V1). It is not a free-text box and not AI-drafted prose — this was also a real, corrected mistake in a prior session.
- Management-facing dashboard (does not exist in V1, built fresh in web-next): every staff member's yearly leave plan at a glance, live remaining-days counter per person, "approaching" alerts, emergency requests called out distinctly for faster attention.
- Real-time: `leave-live` channel on `leave_requests`, same patch-in-place pattern as Attendance.

### 1.3 Where V1 was genuinely shallow (per your own words: "v1 ... was too shallow and stupid" — concretely, where)

- No offline resilience at all for the sign-in photo — a bad connection at the exact moment of sign-in silently loses the photo or blocks the whole sign-in.
- No photo compression — full-resolution phone camera images stored as base64 text in a `text` column; expensive to store and slow to load in any list view.
- No attendance *policy* versioning — `attendance_policy` now exists as a real table (work hours, grace period, workdays, effective-from date) so policy changes have a real history, but V1's own UI never exposed changing it over time; this needs a proper Management screen.
- No structured "exception request" flow for a specific day (sick that morning, transport strike, etc.) short of a full leave day — `attendance_exceptions` exists in the schema but V1 has no UI for it at all (web-next started this).
- Leave has no company-wide calendar view showing everyone's leave at once (only your own + Management's list-style dashboard) — worth adding as a genuine improvement, not scope creep, since it directly serves the "who's around this week" question Management actually has.

---

## 2. OpenHRApp — what the repo actually contains, and what's real

Inspected the actual repository (`mimnets/OpenHRApp`, TypeScript, Supabase-native — same backend family as Palmstead, confirmed via its own `src/services/supabase.ts`), not just its README. 135,911 KB, real production app with real documentation discipline (`ATTENDANCE_STANDARDS.md`, `COUNTRY_BASED_HOLIDAYS.md`, `GDPR_COOKIE_COMPLIANCE.md`, a `HOLIDAY_UPDATE_GUIDE.md`).

### 2.1 Architecture actually found

`src/services/attendance.service.ts`, `leave.service.ts`, `organization.service.ts`, `notification.service.ts`, `audit.service.ts`, `hrService.ts`, `review.service.ts`, `shift.service.ts` — a clean service-per-domain layer, each talking to Supabase directly with its own short-TTL in-memory cache and a `dedupe()` helper that collapses concurrent identical requests into one. `src/hooks/attendance/{useAttendance,useCamera,useGeoLocation}.ts` and `src/components/attendance/{AttendanceActions,AttendanceHeader,CameraFeed,LocationDisplay}.tsx` — attendance UI is genuinely componentized, not one monolithic screen. `src/components/leave/` splits Employee/Manager/Admin/HR flows into separate components rather than one screen branching on role internally.

### 2.2 Real, concrete things worth adopting

1. **Offline-resilient selfie/photo upload with retry** (`attendance.service.ts`): the photo is converted to WebP client-side (`convertToWebP`, quality 0.65, max dimension 720px) *before* upload — a real fix for V1's "full-res base64 in a text column" weakness. Upload retries with exponential backoff (3 attempts, `3^attempt` seconds); on final failure the pending upload is queued to `localStorage` (`checkInSyncQueue`) and retried later rather than silently lost. This is a genuine, concrete improvement over both V1 and web-next's current photo handling — recommend adopting the WebP-compress-then-upload-with-retry-and-offline-queue pattern wholesale, adapted to Supabase Storage the same way `resizeImageToDataUri` is already used elsewhere in this codebase (Banner Tracking, SVE) but going further with actual retry/queue semantics.
2. **Line-manager notification on late check-in** (`notifyLineManagerOfLate`) — reads the checking-in employee's own line manager and notifies *that specific person*, not a blanket "all managers" broadcast. Palmstead is small enough that "all managers" is probably still correct, but the pattern (targeted notification via a real reporting-line lookup) is worth keeping in mind once/if Palmstead's org chart grows past a single manager tier.
3. **Department-based approval routing** (`leave.service.ts`'s `initialStatus` logic, reading `organization.getWorkflows()`) — leave requests route to Manager or HR depending on a configured per-department workflow, with a fallback to HR if the requester has no line manager set. This is more workflow machinery than Palmstead currently needs (one Management tier, not Manager-then-HR), but the *underlying idea* — a configurable approval chain rather than a hardcoded "always goes to whoever has `role='manager'`" — is worth keeping as a forward-compatible seam (a `leave_approval_chain` concept that today just always resolves to Management, but doesn't hardcode that assumption into five different places).
4. **Organization module** (`OrgShifts`, `OrgTeams`, `OrgStructure`, `OrgHolidays`, `OrgWorkflow`, `OrgPlacement`) — this is real, working shift/holiday/team-structure management UI. Directly relevant to your **Staff Settings** item (next in the build order) rather than Attendance/Leave itself: recommend treating `OrgHolidays` (a real public-holiday calendar editor, feeding the same "only working days count" logic Leave already depends on) and `OrgShifts` (named shift definitions, not just one global start/end time) as reference architecture for that later app, not duplicated here.
5. **GDPR/cookie consent + audit log** (`CookieConsent.tsx`, `audit.service.ts`) — Palmstead is an internal staff tool with provisioned accounts, not a public SaaS collecting cookie consent from anonymous visitors, so the cookie-consent piece doesn't apply. The **audit log** pattern (a durable, queryable record of who changed what, when) is worth adopting generally across Palmstead (you already have `audit_events` in the real schema) — Attendance/Leave corrections (Management editing a sign-in time, rescheduling leave) should write to it, which V1 does not currently do.
6. **PWA/offline shell** (`src/sw.ts`, `PWAUpdateBanner.tsx`, `useServiceWorker.ts`) — relevant given field staff sign in from phones with unreliable connections; ties directly into item 1 above (the offline photo queue only matters if the app itself can function offline enough to queue the request in the first place). Recommend a proper service worker for palmstead-v2-shell generally (not attendance-specific), flagged here because Attendance is the single most connectivity-sensitive screen in the whole app.

### 2.3 Real things NOT worth adopting

- **Performance Review module** (`review.service.ts`, competency ratings, HR/Manager/Employee review flows) — genuinely well-built, but it's a distinct HR function (formal periodic reviews) that neither V1 nor any of your instructions asked for. Flagging its existence per your "anything I forgot that might be of great help" instruction, but recommending it stay **out of scope** for Attendance/Leave specifically — if you want it, it's better scoped as its own explicit ask than folded in silently.
- **Multi-tenant SaaS machinery** (`SubscriptionGuard`, `Upgrade.tsx`, `SuperAdmin.tsx`, billing, ad management, blog/marketing/landing pages) — OpenHRApp is a multi-tenant product being sold to many organizations; Palmstead is one company's internal tool. None of this applies and none of it should be ported.
- **Turnstile/bot-verification, public registration, email verification flows** — Palmstead accounts are provisioned by Management, not self-registered; irrelevant.

### 2.4 Feasibility verdict

**High.** Same backend (Supabase/Postgres), same frontend family (React/TypeScript). Real component- and service-level patterns can be adapted directly, not just referenced at arm's length the way a Mongo- or Django-backed repo elsewhere on your list would have to be.

---

## 3. What actually gets built (Phase 3 — mapping)

### 3.1 Keep, verbatim (already correct against V1 + your own prior corrections)

- Every core Leave rule in §1.2's bullet list — overlap blocking, emergency exception, working-days-only quota, the real letter format, used-only-when-confirmed. These are correct and tested; the rebuild ports the *logic*, not a from-scratch reinterpretation.
- Attendance's leave-aware absence calculation, the on-time/absence "good/at risk" threshold, the calendar-heatmap concept, and the AI pattern-detector's deterministic-decision-then-AI-drafts-language-only shape.
- Existing real tables: `attendance_log`, `attendance_policy`, `attendance_exceptions`, `attendance_reviews`, `attendance_notes`, `office_locations`, `leave_requests` — schema is already right, confirmed live; this is a UI/app build against existing data, not a schema redesign.

### 3.2 Add (genuine gaps, not scope creep)

- WebP compression + retry-with-offline-queue for the sign-in/out photo (from OpenHRApp, §2.2.1) — real reliability fix for phone-based field sign-ins.
- A proper Management screen for `attendance_policy` (versioned, effective-from, not just a hidden config field) and for `office_locations` (add/edit/deactivate a real office location on a map, not a single hardcoded lat/lng).
- A UI for `attendance_exceptions` (schema exists, no screen yet) — a staff member requests an exception for a specific date with a reason; a manager decides it; an approved exception behaves like leave for that one day in the absence calculation.
- A company-wide "who's on leave this week/month" calendar view for Management (currently only a list-style dashboard).
- Audit-log writes (`audit_events`) for every Management correction to an attendance record or leave decision.
- Cross-app real-time audit, not an assumption: confirm `attendance_log`, `leave_requests`, `attendance_exceptions`, `attendance_reviews`, `attendance_notes` are all (a) in the `supabase_realtime` publication and (b) wired into the dashboard realtime bridge this session already extended for Banner/SVA/Quotation-settings — this is exactly the class of gap that bridge has repeatedly turned up elsewhere.

### 3.3 Explicitly deferred / flagged for your decision

- Department-based multi-tier approval routing (§2.2.3) — Palmstead-style single-Management-tier approval stays as the default; the *seam* for a future approval chain gets built (not hardcoded past it) but the actual multi-tier workflow itself is not built now unless you say otherwise.
- Performance Review module (§2.3) — flagged, not built, pending your explicit decision.
- Named shift definitions (`OrgShifts`) — belongs to the Staff Settings app (your next item), referenced here only so Attendance's own `attendance_policy` schema doesn't need to change twice.

---

## 4. Screen-by-screen build list

**Staff — Attendance:**
1. Today card: live clock, sign in/out button with GPS+photo capture, late/off-site reason prompts exactly where V1 requires them.
2. This month: on-time-rate ring + KPI tiles (present/absent/leave), strict good/at-risk classification.
3. You vs team comparison bars (leaderboard-sourced).
4. Calendar heatmap, lazy-loaded per month, leave-aware.
5. Recent history list.
6. Request an exception (new).

**Management — Attendance:**
1. Team today — live roster.
2. AI suggestion cards (praise/warning), Accept/Edit/Dismiss.
3. Records/Analytics screen (already exists in web-next — port as-is): date range + staff filter, company summary, per-staff comparison, branded PDF.
4. Exceptions queue — approve/decline (new).
5. Attendance policy + office locations settings (new).
6. Correction tool (edit/delete a record) — now writes to `audit_events`.

**Staff — Leave:**
1. Yearly plan calendar (pick dates, real-time overlap warning).
2. Reserved vs Confirmed-used counters (distinct).
3. Emergency leave path (reason required, still goes to approval).
4. Request history + status.
5. "Did you take your leave?" confirmation banner (post-date, pre-confirmation).
6. Download the real formal letter PDF.

**Management — Leave:**
1. Everyone's yearly plan at a glance.
2. Live remaining-days counter per staff member.
3. Approaching-leave alerts.
4. Emergency requests called out distinctly.
5. Approve / decline / reschedule (reschedule actually moves the staff member's calendar + notifies).
6. Company-wide "who's on leave" calendar (new).

---

## 5. Cross-app data flow (what this app creates, consumes, and triggers elsewhere)

Per the governing instruction's own requirement to document this explicitly rather than assume it:

**Attendance creates:** `attendance_log` rows (read by: Leaderboard's `leaderboard_rows` RPC for days-attended/on-time rank; the Home dashboard's "today's attendance" section for Management, per your homepage spec item 3 below in the build order; `attendance_reviews` when the AI pattern-detector fires; `audit_events` when Management corrects a record).

**Attendance consumes:** `leave_requests` (to exclude on-leave days from absence tallies), `office_locations` + `attendance_policy` (geofence + cutoff/grace rules), `staff`/`profiles` (roster for the Management "team today" view).

**Attendance triggers:** a late/off-site sign-in with no accompanying reason should be flagge-able for Management review (already true); an AI-detected pattern should be able to reach the Streak system once built (item 9 in your order — "app usage is also a requirement in the streak system," and a clean attendance run is exactly the kind of real, verified event a streak should reward, not a manually-fabricated one) and the daily 9am Management SMS report (item 8) needs today's attendance tally as one of its real sections.

**Leave creates:** `leave_requests` rows (read by: Attendance's absence exclusion above; Management's Leave dashboard; the daily 9am SMS report's "staff whose leave is approaching" section, which is explicitly named in your report-app instructions).

**Leave consumes:** `attendance_policy.work_days` + a public-holiday source (today implicit in `isWorkingDayIso`; Staff Settings' OrgHolidays-style editor, once built, becomes the real source of truth) for the working-days-only quota math; `staff`/`profiles` for the approval routing.

**Leave triggers:** an approved leave changes what Attendance should expect for that staff member starting the moment it's approved, not just retroactively when the date arrives (the calendar/roster views should show the future leave, not just silently not-flag it as absent once the date passes); a rescheduled leave must propagate to any other screen already displaying the old date (this exact "reschedule must be a real cross-app data change, not just a status relabel" requirement mirrors what was just built for Site Visit Authorization's own reschedule flow this session — same pattern, different app).

---

## 6. Phased execution checklist

Per your instruction to work "step by step" and verify each piece before moving to the next, not attempt the whole app in one blind pass:

**Phase A — Data/infra decisions (blocks everything else):**
- [ ] Resolve open question 1 (photo storage: Storage bucket + RLS vs. keep base64 column).
- [ ] Resolve open question 2 (which real office locations to geofence).
- [ ] Confirm `attendance_log`, `leave_requests`, `attendance_exceptions`, `attendance_reviews`, `attendance_notes` are all in the `supabase_realtime` publication (checked the same way the banner/config gaps were found this session — `pg_publication_tables`, not assumed).

**Phase B — Attendance, staff-facing:**
- [ ] Port the Today card (clock, sign in/out, GPS+photo, late/off-site reasons) into palmstead-v2-shell from web-next's `AttendanceScreen.tsx`, adding the WebP-compress-and-retry photo pipeline (§3.2) as a real improvement over both V1 and the current web-next version.
- [ ] Port This-month KPIs + on-time ring.
- [ ] Port You-vs-team comparison (verify it reads the same `leaderboard_rows` RPC, not a duplicate calculation).
- [ ] Port the calendar heatmap, verify leave-awareness against a real approved-leave row before calling it done.
- [ ] Build the new "request an exception" flow against the existing `attendance_exceptions` table.
- [ ] Verify live: sign in, sign out, check the calendar cell updates, check a second session (or the Management "team today" view) sees it in real time without a manual refresh.

**Phase C — Attendance, management-facing:**
- [ ] Port Team Today + the AI suggestion cards.
- [ ] Port the Records/Analytics screen + its PDF export as-is (already correct).
- [ ] Build the Exceptions approval queue.
- [ ] Build the Attendance Policy + Office Locations settings screens.
- [ ] Wire the correction tool to write `audit_events`.

**Phase D — Leave, staff-facing:**
- [ ] Port the yearly plan calendar + overlap-warning logic.
- [ ] Port Reserved-vs-Confirmed-used counters, the used-only-when-confirmed banner.
- [ ] Port the emergency-leave path.
- [ ] Port the real formal letter PDF generation (byte-for-byte check against V1's own output, not just "looks similar").

**Phase E — Leave, management-facing:**
- [ ] Port the yearly-plan-at-a-glance + remaining-days counters + approaching alerts + emergency call-outs.
- [ ] Port approve/decline.
- [ ] Port reschedule — confirm it actually moves the staff member's calendar and notifies, not just relabels status.
- [ ] Build the new company-wide "who's on leave" calendar.

**Phase F — End-to-end verification (per the governing instruction's own Phase 6, not skippable):**
- [ ] A real scenario, start to finish: staff signs in late off-site with a reason → appears correctly in Management's Team Today and the AI suggestion surface → staff later requests leave overlapping a date a colleague already holds → gets the real-time warning → staff instead picks a free date → Management approves → Attendance's future calendar reflects it → the date passes → staff confirms they took it → Confirmed-used increments, Reserved stays consistent → Management downloads a Records PDF covering the period and the numbers on it match what was seen live throughout.
- [ ] Confirm zero dead-space/uncentered-max-width regressions on every new screen (the fix already applied elsewhere this session — check it here too, don't reintroduce it).
- [ ] Mobile check on the sign-in flow specifically (camera + GPS prompts, exactly like the Site Visit Experience form's own mobile pass this session).

---

## 7. Open questions before implementation starts

1. **Photo storage:** move sign-in/out photos from `attendance_log.sign_in_photo` (base64 text) to real Supabase Storage (matching OpenHRApp's approach) so the WebP-compress-and-retry pattern has somewhere real to upload to? This is a schema-adjacent decision (new storage bucket + RLS policy), not just an app-layer choice — confirming before I touch it.
2. **Office locations:** how many real office/site locations should geofencing check today (just Royal Palm Enclave, or also the Accra office if staff sign in from there)?
3. Confirm the three deferred items in §3.3 stay deferred (approval-chain seam only, no Performance Review, shift definitions deferred to Staff Settings) — or if any should be pulled into this build now.

Everything else in this document I'm confident enough in to proceed without further check-in. Say go and I'll start with the data/photo-storage decision from Q1, then work top-down through §4.
