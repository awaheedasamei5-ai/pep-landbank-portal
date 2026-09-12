# Palmstead V2 — Attendance & Leave — Full Build Plan (v2, rewritten)

**Status:** Draft for review — no implementation started.

**Correcting the previous draft:** the first version of this plan was rejected as not detailed enough, for four specific reasons, all fixed here: (1) it copied V1's UI/architecture instead of only its logic; (2) it planned in the abstract instead of naming real files in the approved repo that get edited; (3) it deferred Attendance's own settings to a separate app instead of putting them in Attendance's own Management surface; (4) it didn't separate the Staff experience from the Management experience as two genuinely distinct, user-seat-first sections. This version fixes all four. See `feedback-oss-plan-standard-2026-09-12` in memory — this plan follows that standard.

**What "the repo" means here, concretely:** every UI file named below is a real file read directly from `mimnets/OpenHRApp` (not summarized from its README) — its actual component tree, its actual hook logic, its actual state machine. Building this app means forking that repo's real `Attendance.tsx`/`AttendanceActions.tsx`/`useAttendance.ts`/leave components etc. and editing them to run Palmstead's rules — not writing new components in web-next's or V1's visual style.

---

## Part 1 — V1's logic (rules and data only — no UI language)

This section deliberately contains zero screen/layout/component description. It is the specification the OpenHRApp code gets edited to satisfy.

**Attendance rules (from the real, currently-live `pep-landbank-portal` source):**
- One attendance record per staff member per calendar day. Sign-in and sign-out are two separate actions against that same record; recording one must never overwrite data already captured by the other.
- A sign-in outside a configured office radius requires a typed reason before it can be submitted. A sign-in after the configured start time + grace period requires a typed late reason before it can be submitted. Both reasons are mandatory-when-triggered, not optional add-ons.
- A day where the staff member holds an approved (or pending/planned) leave request covering that date must never be counted as absent, regardless of whether they signed in.
- Monthly on-time classification is a strict pass/fail, not a sliding scale: on-time rate ≥ 90% AND at most 1 absence this month = "on track," anything short of that = "at risk." No amber middle state.
- A staff member's monthly attendance numbers (days attended, on-time days) must be the exact same numbers Leaderboard shows for that person — one real source of truth, never two independently-computed copies that can drift.
- Management can correct a wrong sign-in/out timestamp or delete an erroneous record; both actions must be logged (who, when, what changed), not silent.
- Real-time: a sign-in/out anywhere must be visible to Management's live view and to the person's own history without a manual refresh.

**Leave rules (confirmed correct in a prior session's dedicated review — verbatim preserved, not reinterpreted):**
- Annual quota is a configurable number of days (currently 20); only working days (Mon–Fri, minus public holidays) count against it or are selectable at all.
- Two staff members cannot hold overlapping *normal* leave on the same date — first to submit locks that date; a second person attempting an overlapping normal request must be blocked with a clear, real-time warning before submission, not after.
- Emergency leave is the one deliberate exception to that block: it may overlap another staff member's held date, but only if a reason is typed, and it still requires Management approval — "emergency" changes the blocking rule, not the approval requirement.
- Management can approve, decline, or reschedule a request. Reschedule means Management enters a new date (or dates) plus a reason, and that request's actual dates change — it is a real data mutation, not a status relabel — and the staff member must be notified of the new date and the reason, by SMS and in-app.
- A leave day is only "confirmed used" when three things are all true: it was approved, the date has passed, and the staff member has actively confirmed they took it. Until confirmed, it still counts against the quota as "reserved" (so nobody can over-book past their entitlement before confirming), but "reserved" and "confirmed used" must always be shown as two distinct numbers, never merged into one.
- The leave letter Management/staff download is a fixed, formal, pre-generated document — a specific header/body/date-list/signature structure that does not vary — not a free-text field and not AI-authored prose.
- Notifications required: staff submits → Management notified (SMS + in-app). Management decides (approve/decline/reschedule) → staff notified (SMS + in-app) either way. A staff member's approved leave date is approaching → staff gets a reminder, separately from any earlier "you haven't finalized your plan yet" nudge.
- Real-time: any leave request change anywhere must be visible to Management's dashboard and the requester's own view without a manual refresh.

**What V1 never solved (real gaps, not invented scope):**
- No resilience if a sign-in photo fails to upload on a bad connection — it's just lost.
- No structured way to request a single-day exception (arrived late for a stated reason short of a full leave day) — only full leave or nothing.
- No company-wide "who's on leave when" view — only each manager's own list-style queue.
- No versioned attendance policy — changing work hours/grace period has no history of what the policy was before.
- Photos are stored as raw, uncompressed data — expensive and slow.

---

## Part 2 — The real OpenHRApp code this gets built from

Read directly (components, hooks, services, pages — not just the README):

| Real file | What it actually does today | What changes for Palmstead |
|---|---|---|
| `src/pages/Attendance.tsx` | Full-screen, camera-first check-in/out modal. Auto-starts geolocation + front camera on open. Duty-type toggle (`OFFICE`/`FACTORY`), remarks field mandatory only for the second type, disabled-submit logic gated on having both a location fix and a photo. | Rename duty types to Palmstead's real distinction (`OFFICE` / `OFF_SITE`, e.g. a site visit) . Insert the office-radius check (haversine against `office_locations`) between "photo captured" and "allow submit" — if outside radius, an off-site reason becomes mandatory the same way `FACTORY` remarks are today. Insert the late-cutoff check the same way for sign-in only. |
| `src/components/attendance/AttendanceActions.tsx` | The remarks input + big Check In/Check Out button, with a loading spinner state. | Swap the mandatory-remarks condition from "duty type is FACTORY" to "flagged off-site OR (signing in AND late)". Two separate reason fields where V1 has two separate columns (`late_reason` vs `sign_in_reason`/`sign_out_reason`) — the repo's single `remarks` field needs to become two conditionally-shown fields. |
| `src/components/attendance/CameraFeed.tsx` / `LocationDisplay.tsx` | Live camera preview with front/back toggle + torch, a location pill with retry-on-error. | Kept close to as-is — this is exactly the real hardware-capture UX V1 lacks entirely (V1 has no live camera preview, just a bare file input). Genuine upgrade, not scope creep. |
| `src/hooks/attendance/useAttendance.ts` | Loads today's active record + config + resolved shift on mount; **auto-closes a forgotten check-out from a past date and tells the user** (`closedPast` reconciliation); computes lateness from shift-start + grace; drains an offline retry queue for photos and check-ins on every load. | The lateness computation already matches V1's own rule almost exactly (shift/global start time + grace minutes) — keep it, wire it to `attendance_policy`. The forgotten-checkout auto-close is a real, valuable addition V1 never had — keep it, adapt the toast copy. Add the office-radius check and the leave-aware absence lookup (`leave_requests`) V1 requires that this hook doesn't have yet. |
| `src/services/attendance.service.ts` | WebP-compresses the selfie client-side before upload (quality 0.65, max 720px), retries the upload 3× with exponential backoff, and if all retries fail, queues it in `localStorage` for a later drain instead of losing it. | Adopt this pipeline wholesale for `sign_in_photo` — this is the direct fix for the "no resilience for a failed photo upload" gap named in Part 1. Requires moving the photo from a `text` column to real Supabase Storage (open question, §5). |
| `src/components/leave/EmployeeLeaveFlow.tsx` | Real-time net-day calculator as the staff member picks a date range — walks each day, checks it against the employee's working-day set and the public-holiday list, excludes weekends/holidays automatically, shows a breakdown ("2 Weekend(s) excluded. 1 Public Holiday(s) excluded."). Balance-per-leave-type cards. Strict "insufficient balance" block before submit. | The date-range-plus-live-calculator UI is a genuine upgrade over V1's own date-picker (which doesn't show a running breakdown as you pick). Palmstead's V1 model uses discrete selected dates (not always a contiguous range) and a single annual quota rather than per-type balances — adapt the calculator to walk a jsonb date array instead of a start/end range, and reduce the balance-card grid to the one real Palmstead quota type (with room to add types later without a rebuild). **Must add**: the overlap-against-other-staff check before submit — this component has no concept of it today, and it's a hard Palmstead requirement (Part 1). |
| `src/components/leave/ManagerLeaveFlow.tsx` | A pending-requests list + a review modal (reason shown, remarks textarea, Approve/Reject). | Approve/Reject exist; **reschedule does not** — must be added as a third action in the same review modal: a date picker for the new date(s) + a required reason, writing the real date change (not just a status) and triggering the notification. Emergency requests need a visual call-out (a badge/highlight) this component doesn't have yet — real Palmstead requirement, genuinely missing here. |
| `src/components/dashboard/{EmployeeDashboard,AdminDashboard}.tsx` | Real, working example of exactly the Staff-vs-Management split this whole build order requires: Employee sees My Team / My Manager / a leave-request shortcut. Admin sees the same personal widgets PLUS a distinct "Management" quick-access row (Audit, Leave queue, Employees, Settings, Reports). | This is the concrete pattern for "settings live in the Management version of the app": Attendance's own policy/office-location settings become tiles in Attendance's Management quick-access row, exactly like this repo already does it for its own Settings — not a separate app. |

**Explicitly not used from this repo, and why:** `SubscriptionGuard`/`Upgrade.tsx`/billing (multi-tenant SaaS gating, irrelevant — Palmstead is one company); `Turnstile`/public registration/email verification (Palmstead accounts are provisioned by Management, nobody self-registers); the Performance Review module (`review.service.ts` and friends — a real, well-built feature, but out of scope unless you explicitly ask for it as its own item); the blog/landing/marketing pages (product-marketing site, not part of the internal tool).

---

## Part 3 — The Staff experience (written from the seat of the person using it)

A field agent's real day: they arrive somewhere that might not be the office, they need to prove they showed up without friction, and later in the month they want to know, at a glance, "am I doing okay" and "how much leave do I actually have left."

**What they open Attendance for, and what they get:**
- One tap to check in. The camera and GPS start themselves — they are not asked to find a menu for either. If they're at the office, nothing else is asked of them. If they're not, or if it's late, the app asks exactly one short question (a reason) before letting them finish — never a wall of fields.
- If they forgot to check out yesterday, the app tells them plainly ("we closed your Tuesday session for you — remember to check out") instead of leaving a broken-looking open session sitting there with no explanation.
- If their connection is bad the moment they check in, the photo still gets there eventually — they are never told to "try again from scratch" because a photo upload hiccuped.
- A single screen answers "how am I doing this month" without them having to calculate it themselves: a plain on-time percentage, how many days they've been present, how many absences, how many days covered by leave — and whether that's "on track" or "at risk," stated plainly, not left for them to infer from raw numbers.
- They can see how they compare to the rest of the team without it feeling like a public shaming board — a simple "you're #3 of 8 for days attended" framing, not a leaderboard screaming at them.
- A calendar they can actually read at a glance — every day colored by what happened, so "was I late three times this month" is a two-second visual scan, not a mental tally.

**What they open Leave for, and what they get:**
- Picking dates immediately tells them how many real days that costs them — weekends and holidays excluded automatically, shown as a plain sentence, not something they have to count themselves.
- The app stops them, before they waste a submission, if they're trying to take more days than they have left, or if a colleague already holds one of those exact dates — with a clear next step (pick another date, or use the emergency path if it's genuinely urgent).
- Genuinely urgent leave has an honest path that doesn't pretend it's the same as planning three weeks ahead — but it still tells them plainly that it still needs approval, so they don't show up assuming it's automatically fine.
- Once their leave date has actually passed, the app asks them, once, "did you take this?" — a single tap, not a form — and that's what makes it official on their record, not just Management's approval.
- They can download the real, formal letter for their own records (for a landlord, a bank, whatever they need it for) without asking anyone to generate it for them.
- If Management moves their leave to a different date, they're told immediately, with the reason, not left to discover it by noticing their calendar looks different.

---

## Part 4 — The Management experience (written from the seat of the person using it)

Management's real question is almost never "show me a table" — it's "is anything wrong today, and who do I need to deal with."

**What they open Attendance for, and what they get:**
- Who's actually in right now, at a glance, without asking anyone.
- They are not the one who has to notice patterns — if someone's been late three times in ten working days, or absent twice, the app already surfaced that as a real, named suggestion ("suggest a warning note for X, here's a drafted reason") before Management even looked for it. The judgement (is this pattern warning-worthy) is made by real counted data, not a language model's guess — the AI's only job is wording the note, and Management can edit or dismiss it, never just click-approve blind.
- The reverse also happens: a genuinely clean attendance run gets a praise suggestion, not just silence — good behavior is noticed, not just bad behavior policed.
- If a record is wrong (a device glitch, a genuine mistake), fixing it takes one edit, and that edit is on the record permanently — if a staff member ever disputes a correction, there's a real trail of who changed what and when, not "management's word against theirs."
- **Everything about how attendance is judged lives here, not in some separate settings app they have to go find**: the work hours, the grace period, which days count as workdays, and every real office location that counts as "at the office" — all editable from inside Attendance's own management view, with a history of what the policy used to be (so a dispute about a sign-in from three months ago can be checked against the policy that was actually in force then, not today's).
- A staff member's one-off exception request (sick that morning, transport failure) is a real, small queue to clear — approve or decline with a tap — not something that has to become a whole leave day just because there's no other mechanism for it.

**What they open Leave for, and what they get:**
- Every staff member's whole year, visible at once — not one request at a time in isolation, so a pattern like "everyone wants the same week in December" is visible before it becomes a crisis.
- A live "how many days does each person have left" number, always current, never something they have to calculate by hand from a list of past approvals.
- Leave dates that are coming up soon are flagged for them, unprompted — they should never be surprised that three people are all out next Monday.
- Emergency requests visually stand out from routine ones — a genuine emergency should never sit in a queue behind five ordinary vacation requests waiting its turn.
- Approving, declining, or moving a request is one screen, one action — and moving a request is a real change to that person's calendar plus a real notification to them, not Management having to separately go tell the person by phone that their dates changed.
- A real, company-wide "who's out this week/month" calendar — the single view V1 never had, and the one Management has explicitly asked for by implication every time they've had to ask "wait, who's actually around."

---

## Part 5 — Every situation considered, and the app's actual answer to it

| Situation | What goes wrong without a real answer | The app's built-in answer |
|---|---|---|
| Staff forgets to check out | An open session sits broken forever, silently wrong in every report that reads it | Auto-reconciliation closes it on next load and tells the staff member plainly (from OpenHRApp's real `useAttendance` pattern) |
| Photo upload fails mid-signin on bad mobile data | The photo is just gone; sign-in either fails outright or silently has no proof | WebP-compress, retry 3× with backoff, queue in local storage and drain on next load if all retries fail (from OpenHRApp's real `attendance.service.ts`) |
| Staff signs in from a client's plot, not the office | Either every off-site sign-in looks "wrong," or the geofence is quietly ignored and becomes meaningless | Mandatory off-site reason, stored and visible to Management, not blocked outright — trust staff, but require a stated reason |
| Two staff want the same leave date | Double-booking discovered only after both are approved, too late to fix cleanly | Real-time overlap check blocks the second normal request before submission, with the emergency path as the deliberate, reason-required exception |
| A staff member's leave is approved but they never actually take it (plans change) | Their quota is permanently, wrongly reduced for a day they never used | "Reserved" (protects the quota against double-booking) stays separate from "confirmed used" (only set once the staff member confirms after the date passes) |
| Management needs to move someone's approved leave | A phone call and a manual note somewhere, easy to forget or contradict what the system shows | Reschedule is a real action changing the actual stored date + a mandatory reason + an automatic notification, not a manual workaround |
| A staff member is out sick for one morning, not a whole day | No mechanism except either marking them absent (wrong, punishes real leave-aware staff) or forcing a full leave request (overkill) | The dedicated exception-request flow (`attendance_exceptions`, UI genuinely missing until now) — a lightweight one-day, one-reason request, decided fast |
| Someone disputes an attendance correction Management made | No record of what the value was before, or who changed it, or why | Every correction writes to `audit_events` — a real, permanent, queryable trail |
| Attendance policy changes (new office hours) mid-year | Old sign-ins get silently re-judged against today's rule, making history lie | `attendance_policy` is versioned with an effective-from date; a historical sign-in is judged against the policy that was actually in force on that date |
| Management wants to know "who's around this week" | Has to open each person's leave history individually and mentally cross-reference | One real company-wide leave calendar, built fresh (missing in V1 entirely) |
| An attendance/leave number shown here disagrees with what Leaderboard shows for the same person | Two independently-computed numbers that can silently drift, undermining trust in both | Both read the exact same `leaderboard_rows` RPC — one source of truth, enforced structurally, not just by convention |

---

## Part 6 — Data model

Already real and live (confirmed via direct schema query, not assumed): `attendance_log`, `attendance_policy`, `attendance_exceptions`, `attendance_reviews`, `attendance_notes`, `office_locations`, `leave_requests` — every column Part 1's rules need already exists. This is an application build against an existing, correct schema, not a schema redesign. The one real schema-adjacent decision is photo storage (§7, Q1).

---

## Part 7 — Open questions before implementation starts

1. **Photo storage:** move `attendance_log.sign_in_photo` from a base64 text column to a real Supabase Storage bucket, which the WebP-compress-and-retry pipeline (Part 2) needs somewhere real to upload to. This needs a new bucket + RLS policy — confirming before touching schema.
2. **Real office locations:** exactly which physical locations should count as "at the office" for the geofence check (Royal Palm Enclave only, or also an Accra office)?
3. **Leave types:** stay with V1's single annual-quota model (confirmed correct, Part 1), or is there appetite for OpenHRApp's per-type balance model (Annual/Sick/etc.) now that its real UI exists to support it? Flagging because the repo makes it easy to add, not because V1 asked for it.

Everything else in this document I'm confident enough in to proceed without further check-in.
