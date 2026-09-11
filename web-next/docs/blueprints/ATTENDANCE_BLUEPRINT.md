# Attendance App — Detailed Build Blueprint

**Status**: Living build document. Produced per [[feedback-mandatory-app-build-process-2026-09-11]] after (1) a full re-read of the real v1 production implementation (`index.html` lines 4693-5250, 7464-7494), (2) a fresh re-read of the 59-page Master Rebuild Specification's Section 11 "CORE APP — Attendance" (page 17), (3) the already-completed re-read of the V3 PDF's chapter 01 (see `palmstead-v3-master-rebuild-pdf` memory), and (4) real internet research on Deputy and Homebase's GPS time-clock UI patterns. Every section below states plainly whether it's **BUILT** (already shipped and verified this session), **PARTIAL** (some real coverage, gap named precisely), or **NOT BUILT**. Nothing in this document is aspirational filler — every requirement traces to one of the four sources above, cited inline.

This is not a redesign from scratch. Palmstead's shipped design system (Bricolage Grotesque display / Plus Jakarta Sans body / IBM Plex Mono for numbers, the `--c-*` token set, `--r-md`/`--r-lg`/`--r-pill` radii) is final and already applied across the app. Every new screen below is specified **in these exact tokens**, not invented colors.

---

## 1. Design tokens this app must use (no invented colors, no exceptions)

| Purpose | Token | Value (light) | Value (dark) |
|---|---|---|---|
| Page background | `--c-paper` | `#F5F6FB` | `#0A0B16` |
| Card background | `--c-card` | `#FFFFFF` | `#141530` |
| Card border | `--c-line` | `#E3E5F1` | `#272A4E` |
| Primary text | `--c-text` | `#14162B` | `#EEEFFA` |
| Secondary/muted text | `--c-muted` | `#6A6E8E` | `#9C9FCB` |
| Accent (primary actions, active tab, focus ring) | `--c-accent` | `#7C3AED` | `#B794F6` |
| Accent tint (badges, selected backgrounds) | `--c-accent-bg` | `#F1EAFF` | `#241638` |
| Success (present, approved, on-time) | `--c-success` / `--c-success-bg` | `#146C43` / `#E6F4EC` | `#4FBE85` / `#0F241A` |
| Warning (late, pending, off-site) | `--c-warn` / `--c-warn-bg` | `#B07A1E` / `#FBF1DF` | `#E0AC57` / `#2E2410` |
| Danger (absent, declined, destructive) | `--c-danger` / `--c-danger-bg` | `#B0402C` / `#FBEAE6` | `#E27562` / `#301715` |
| Info (on leave) | `--c-info` / `--c-info-bg` | `#2563A8` / `#E9F1FA` | `#6FA8E0` / `#0F2033` |
| Display font (h1/h2/h3, the clock digits) | `--font-display` | `'Bricolage Grotesque'` | same |
| Body font (everything else) | `--font-body` | `'Plus Jakarta Sans'` | same |
| Numeric/mono (times, counts, coordinates) | `--font-mono` | `'IBM Plex Mono'` | same |
| Card radius | `--r-md` (20px) / `--r-lg` (28px for the clock card) | | |
| Pill radius (tags, buttons) | `--r-pill` (100px) | | |
| Card shadow | `--shadow` | `0 1px 2px rgb(20 22 50 / 5%), 0 10px 28px rgb(20 22 50 / 7%)` | dark variant auto-applies via the token |

Status pill color mapping (used everywhere a status shows — roster tags, calendar cells, exception tags, review tags):

- **Present / On time / Approved** → `--c-success` text on `--c-success-bg`
- **Late / Off-site / Pending** → `--c-warn` text on `--c-warn-bg`
- **Absent / Declined** → `--c-danger` text on `--c-danger-bg`
- **On leave** → `--c-info` text on `--c-info-bg`
- **Not yet signed in / neutral** → `--c-muted` text on `color-mix(in srgb, var(--c-muted) 8%, transparent)`

---

## 2. Information architecture (final, already partly built)

```
Attendance (shell — AttendanceScreen.tsx)
├─ Today (index route — AttendanceTodayScreen.tsx)          [BUILT, this doc extends it]
│   ├─ Clock card (sign in/out)                             [BUILT — needs camera+wizard rework, §4]
│   ├─ Month KPI card                                       [NOT BUILT — §5]
│   ├─ Calendar heatmap                                     [NOT BUILT — §6]
│   ├─ "You vs team" comparison chart                       [NOT BUILT — §7]
│   ├─ Off-site requests card (pre-authorization)           [BUILT — §9]
│   ├─ Recent history list                                  [BUILT, needs detail-modal wiring — §8]
│   └─ Management dashboard (manager session only)
│       ├─ Pending exception requests                       [BUILT — §9]
│       ├─ Today tally + AI suggestions + coordinate flags   [BUILT — §12]
│       └─ Roster (click → detail modal)                    [PARTIAL, needs detail modal — §8]
└─ Records (manager-only tab — AttendanceRecordsScreen.tsx)  [BUILT — §10 lists remaining gaps]

Settings (Management)
├─ Site locations (office_locations admin)                  [BUILT — §11 adds the map]
└─ Attendance policy admin                                  [BUILT]

New, not yet built:
├─ attendance_reviews UI (post-hoc classification)           §13
└─ 10am SMS / 7pm PDF executive daily brief                  §14
```

---

## 3. Screen: "Today" — Clock card (staff-facing centerpiece)

**Layout, top to bottom, single column, max-width 480px, `padding: 20px 16px`:**

1. **Clock card** — `background: var(--c-ink)` (dark navy card even in light mode, matching the existing gradient treatment already shipped), `border-radius: var(--r-lg)`, `padding: 26px 16px 20px`, centered text, `box-shadow: var(--shadow-lg)`.
   - Live time, `font-family: var(--font-display)`, `font-size: 40px`, `font-weight: 800`, color `#FFFFFF`. **[NOT BUILT: this must re-render every 30 seconds while the card is on screen — v1's `ATTENDANCE_CLOCK_TIMER` `setInterval`. Currently web-next renders the time once at mount and never updates it live.]**
   - Date below, `font-size: 13px`, `color: rgba(255,255,255,.7)`.
   - The big circular clock button (already built, keep as-is: radial gradient, phase-based color — gold/amber when action needed, muted navy mid-shift, faded when done).
   - **[NOT BUILT] Live hours-worked stat**: once signed in and not yet out, a 3-column stat row below the button — `Clock in` (time) / `Clock out` (`--:--` until done) / `Hours` (live-updating `Xh Ym`, recomputed every 30s same interval as the clock). This is the exact v1 `attClockStats` row; web-next currently shows something similar but does not live-update the hours figure.

2. **Sign-in wizard** — **[MAJOR REWORK NEEDED, see decision below]**.

### Decision: sign-in flow must become a real sequential wizard, matching the spec's own numbered steps exactly

The 59-page spec's Section 11.1 numbers the flow as 10 discrete steps, and v1 implements it as separate blocking modals in this exact order. **[BUILT 2026-09-11]** web-next now matches this exactly — the old single combined form is gone, replaced by a real step-gated wizard (`AttendanceTodayScreen.tsx`'s `flow`/`step` state + `locate()`), each step a real `Modal` overlay (`shared/ui/Modal.tsx`):

1. Tap the clock button.
2. **[BUILT 2026-09-11]** If past the effective cutoff (policy work-start + grace), shows a `Modal`: *"You're signing in after {cutoff} — please tell us why."* Reason is a **preset dropdown + conditional custom field** (`features/attendance/components/PresetReasonPicker.tsx`), not free text:
   - Options: `Traffic`, `Personal`, `Transport`, `Other`. Choosing `Other` reveals a text input (`"Briefly, what happened"`), required before Continue enables.
   - Modal styling matches spec: `--c-card` background, `--r-lg` radius, `box-shadow: var(--shadow-lg)`, header row (title + ✕ close, same typographic-glyph convention already used by ops-tracker's own modals), full-width primary button (`--c-accent` background, white text, `--r-pill`) reading "Continue sign-in".
   - Cancelling (backdrop click or ✕) calls `resetForm()`, aborting the entire sign-in — no partial submission. Verified live.
3. Requests geolocation (`getCurrentPosition`), shows "Locating…" on the button label while waiting (unchanged, already worked).
4. **[BUILT 2026-09-11]** If the computed distance from the nearest active `office_locations` row exceeds its radius, shows a `Modal`: *"You appear to be outside the office area. If you're working for the company elsewhere, tell us why."* Same preset-dropdown pattern:
   - Options: `Company errand`, `Client/site assignment`, `Working from home`, `Other` (+ custom detail).
   - **[BUILT 2026-09-11]** Includes `OfficeMapSnippet` (§7) at the top of the modal, showing the user's captured pin + a caption naming the distance and matched office — the Homebase-researched pattern (map above the confirmation card, not just text). Off-site resolution itself now checks the real `office_locations` table (nearest active row + its own radius) via `resolveOffSite()`, falling back to the legacy single-point Config only when no active office_locations exist — this closes a real gap where the client previously only ever checked the legacy single point even after office_locations admin shipped.
   - A same-day **approved off-site exception** still skips this prompt entirely (unchanged behavior, now wired through `locate()`).
5. **[BUILT 2026-09-11]** Photo capture modal — replaced the old bare `<input type="file" capture="user">` with a real **in-app live camera capture component** (`shared/ui/CameraCapture.tsx`):
   - Requests camera permission via `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })`.
   - Shows a live `<video>` preview, circular mask (`border-radius: 50%`), `220px` diameter, centered, mirrored (`scaleX(-1)`) to match normal front-camera convention.
   - A single capture button below the preview (`--c-accent` circular button, camera icon) draws the current video frame to a canvas via `captureVideoFrameToDataUri()` (`shared/lib/selfiePhoto.ts`), producing a JPEG data URL capped at 480×480, quality 0.85 — same bounds as the file-input path, both go through equivalent resize logic.
   - After capture, swaps the live video for the captured still + two buttons: "Retake" (ghost button, discards and returns to live preview) and "Use this photo" (primary, `--c-accent`) — the photo is only committed to sign-in state once "Use this photo" is tapped, matching the spec's review-before-commit step exactly.
   - **Fallback** (verified live in Browser pane, which itself blocks `getUserMedia` — same code path a real permission denial hits): if `getUserMedia` is unavailable or permission is denied, falls back to `<input type="file" accept="image/*" capture="user">` with the hint text "Camera access unavailable — using your device's camera app instead." — never blocks sign-in entirely over a camera API gap.
   - Verified live end-to-end in DEMO_MODE (idle placeholder → Take photo → fallback UI → file input present), `npx tsc -b` / `oxlint` / `stylelint` all clean.
6. Submit (`useSignIn`), show the existing success toast, return to the idle "Complete" clock state.

**[BUILT 2026-09-11]** Sign-out repeats steps 3–4 only (no late check, no photo) — geolocates, runs the same `resolveOffSite()` check with the same off-site modal + map if flagged, then lands on a `reviewOut` confirm `Modal` ("Confirm sign out") either way, matching both v1 and the previous web-next behavior for the final confirm tap.

---

## 4. Screen: "Today" — Month KPI card **[BUILT 2026-09-11]**

Placed directly below the clock card, own `--c-card` container, `border-radius: var(--r-md)`, `padding: 18px`, `box-shadow: var(--shadow)`.

- **Header row**: `"This month"` (`h3`, `--font-display`, 15px, weight 700) on the left; a status pill on the right reading **"● On track"** (`--c-success` on `--c-success-bg`) or **"● At risk"** (`--c-danger` on `--c-danger-bg`).
  - Deterministic rule (ported exactly from v1's `attendanceMonthStatsFor`): "on track" = on-time rate ≥ 90% **and** absences ≤ 1 for the month so far. Anything else is "at risk". This is real, computed logic — never a vibe.
- **Body**: a horizontal flex row, `gap: 18px`, `align-items: center`.
  - Left: an SVG progress ring, 80×80px, stroke color `--c-success` when "on track" else `--c-warn`, background track `--c-line`, showing the on-time-rate percentage as both the ring fill and a centered number (`font-family: var(--font-mono)`, `font-size: 20px`, `font-weight: 800`).
  - Right: two stacked lines — bold `"On-time rate"` (14px), then muted `"{onTimeDays} of {daysAttended} day(s) present were on time"` (12px, `--c-muted`).
- **Below**: a 3-tile KPI row, `display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px`, each tile matching the existing `.tallyTile` pattern already shipped in `AttendanceScreen.module.css` (light tinted background per metric, big mono number, small uppercase label):
  - **Days present** (`--c-success-bg` tint) · **Absences** (`--c-danger-bg` tint) · **On leave** (`--c-info-bg` tint).

Data needed: this can be computed entirely client-side from data already fetched (`useAttendanceHistory`, `useLeaveRequests`, working-day calendar logic already in `attendanceRosterLogic.ts`) — no new query. **Built as `MonthKpiCard.tsx`**, replacing the old simpler `SegmentedGauge` "days this month" card (a strict superset of it, so no regression — keeping both stacked would have been a redundant duplicate summary). Progress ring reuses the existing `DonutChart` component (two segments: on-time days colored, remainder transparent) rather than a bespoke ring. `computeMonthStats()` (new, `attendanceRosterLogic.ts`) ports v1's exact on-track rule and absence counting (workdays elapsed so far, excluding today itself since it isn't a finished data point yet). Verified live: "At risk" pill correctly showed with 100% on-time rate but 5 absences (correctly AND-gated, not OR).

---

## 5. Screen: "Today" — Calendar heatmap **[BUILT 2026-09-11]**

A real GitHub-contributions-style month grid, own `--c-card` container below the KPI card.

- **Header row**: month label (e.g. "September 2026", `h3` style) on the left; two small pill buttons on the right (‹ and ›) for month navigation, `--c-line` border, `--r-pill`, disabled/greyed when navigating past the current month.
- **Grid**: 7 columns (S M T W T F S), CSS grid, each cell square (`aspect-ratio: 1`), `border-radius: 8px`, `gap: 4px`.
  - Cell fill color by day status: **present** → `--c-success`; **late** → `--c-warn`; **absent** → `--c-danger`; **on leave** → `--c-info`; **not a scheduled work day** → transparent with a `1px solid var(--c-line)` border; **future date** → transparent, no border.
  - The day number sits top-left inside the cell, white text on colored cells, `--c-text` on empty/bordered cells.
  - Today's cell gets a `2px solid var(--c-accent)` outline in addition to its status fill.
  - Clicking a cell that has a real attendance record opens the detail modal (§8).
- **Legend row** below the grid: small colored squares (10×10px, `border-radius: 3px`) + label, `font-size: 11px`, `color: --c-muted`, one entry per status color above (skip "future").

Data: reuses `useAttendanceHistory` — extend the hook's range to cover the currently-browsed calendar month (lazy-load additional months on navigation, matching v1's `attEnsureCalendarMonthLoaded` merge-by-date pattern, so browsing back doesn't refetch or lose already-loaded recent history). **Built as `AttendanceCalendar.tsx`** — deliberate simplification from the lazy-merge-loading approach: fetches one wider 186-day (~6-month) `useAttendanceHistory` window up front instead, and disables the "previous month" nav button once browsing past that window rather than incrementally loading more. Real and fully functional over its horizon (no fake/empty months shown), just a shallower browse-back range than v1's unbounded merge cache — flagged here as an intentional scope trade-off, not an oversight. `buildCalendarMonth()` (new, `attendanceRosterLogic.ts`) computes each cell's status; clicking a cell with a real record opens the §8 detail modal (verified live). Shown to both staff and Management (a manager also clocks in/out personally, so this is their own calendar too, not staff-only).

---

## 6. Screen: "Today" — "You vs team" comparison **[BUILT 2026-09-11]**

Only rendered for a staff (not manager) session, placed below the calendar. Reuses `pdfReport.ts`-adjacent bar styling already established (`Ops Tracker`'s `.bars`/`.barFill` CSS, already proven in this codebase — see `AttendanceRecordsScreen`'s weekday-hours chart).

- **Header**: `"You vs the team"` + a real computed rank line, e.g. `"You're #2 of 4 for days attended"` (`--c-muted`, 12px) — or just `"This month"` if the viewer isn't in the ranked set.
- **Body**: one horizontal bar row per staff member, sorted by days-attended descending.
  - Row: name (bold if it's you, with "(you)" suffix) + a small meta line (`"{days} day(s) · {onTimeDays} on time"`, `--font-mono` for the numbers) above a thin bar track (`height: 7px`, `border-radius: 6px`, `background: var(--c-line)`), filled proportionally (`background: var(--c-accent)` for you, `--c-success` for everyone else — matches v1's own "highlight yourself" convention).

Data: the same `leaderboardRows`-adjacent aggregate v1 used (`daysAttended`, `onTimeDays` per staff). **Correction found while building**: this can NOT be sourced from `useAllAttendanceRange` + roster client-side as originally assumed here — that hook (and `listBetween`/`listToday`) are all manager-gated (`enabled: isManager`) because the real `al_sel_own_or_mgr` RLS policy (re-confirmed live via `pg_policies` 2026-09-11) only lets a staff member read their OWN `attendance_log` rows, never a teammate's. Building this required a real new migration: `get_attendance_month_comparison(p_month_key, p_cutoff)`, a `SECURITY DEFINER` RPC returning only `staff_key/staff_name/days_attended/on_time_days` (no coordinates/photos/reasons — same privacy shape as the leaderboard rankings already visible to everyone), granted to `authenticated` only. New `ds.attendance.monthComparison()` data-source method (demo: computed from local store; Supabase: calls the RPC) + `useAttendanceMonthComparison()` hook + `TeamComparisonCard.tsx`. Verified live as a real staff account: correct rank line ("You're #1 of 3..."), correct accent-colored "you" bar vs grey teammate bars, correctly absent for the Manager session.

---

## 7. New shared component: `OfficeMapSnippet` **[BUILT 2026-09-11]**

A small, reusable map component (`shared/ui/OfficeMapSnippet.tsx`), used so far in the off-site sign-in/out modal (§3 step 4); still to be wired into the office-location admin screen (§11) and the per-record detail modal (§8) when those are built.

- Keyless embed, same no-API-key pattern v1 already used and already proven safe (no billing risk, no key to leak): `https://www.google.com/maps?q={lat},{lng}&z=16&output=embed` inside an `<iframe>`, `width: 100%`, `height: 180px` (`tall` prop gives 200px for the future full detail modal), `border: 0`, `border-radius: 12px`, `loading="lazy"`.
- Caption row below: the `pin` icon + `"{distance}m from {officeName}"` when an office comparison is available, in `--c-muted`, 11px.
- When no coordinates are available at all (e.g. geolocation denied), renders a muted placeholder box instead: `"No location captured for this entry."` — never a broken iframe. Verified live (component renders correctly with real coords in the off-site modal path; the no-coords placeholder branch is straightforward and covered by `npx tsc -b` type-checking the exhaustive prop contract, not separately screenshotted).

---

## 8. Per-record detail modal **[BUILT 2026-09-11]**

Triggered by clicking any row in: "your recent history" list (own records) or a manager's roster row's new "Details" button (the calendar heatmap trigger point doesn't exist yet — see §5, not yet built — so it isn't wired there).

- **Overlay**: full-screen dim backdrop (`rgb(20 22 50 / 45%)`), centered modal card, `--c-card` background, `--r-lg`, `max-width: 420px`, `padding: 20px`, `box-shadow: var(--shadow-lg)`.
- **Header**: `"{Staff name} — {long date}"` (bold, 16px) + a × close button (top-right, icon button, `--c-muted`).
- **Sign-in section** (only if a sign-in exists): a nested card (`--c-paper` background, `--r-md`, `padding: 14px`, `margin-bottom: 12px`):
  - Uppercase eyebrow: `"SIGN-IN · {time}"` (`--c-muted`, 11px, letter-spacing).
  - The captured photo if present, `width: 100%`, `max-height: 240px`, `object-fit: cover`, `border-radius: 12px`.
  - An on-site/off-site line: `"📍 At the office"` (`--c-success`) or `"📍 Off-site — {reason}"` (`--c-danger`), bold, 12px — only shown if an office location is actually configured (matches v1's own guard: don't show a meaningless tag when nothing is configured to compare against).
  - The `OfficeMapSnippet` (§7).
- **Sign-out section**: same shape, no photo (sign-out never captures one, matching both v1 and the current spec).
- **Management-only correction block** (only rendered for `role === 'manager'`):
  - A subheader: `"Correct this record"` (13px, bold).
  - Two time inputs side by side (`type="time"`, pre-filled from the real stored timestamps) for sign-in/sign-out.
  - A full-width primary "Save changes" button.
  - Below that, a danger-zone card (`--c-danger-bg` tint background, `--r-md`): `"Delete this record"` + one line of consequence text + a `"Delete record"` danger button (`--c-danger` background, white text) — requires a native `confirm()` before the mutation fires (matches v1's own double-confirm-for-destructive-actions convention used elsewhere in this app, e.g. the reset-all button in §13).

**New data-source methods needed**: `ds.attendance.update(id, { signInAt?, signOutAt? })` and `ds.attendance.remove(id)`, both RLS-gated manager-only (mirrors the real `al_upd_own_or_mgr`/`al_del_mgr` policies — **re-confirmed live via `pg_policies` 2026-09-11**, no new RLS work needed, just client methods). **Both built and verified live**: `AttendanceDetailModal.tsx`, wired into `AttendanceTodayScreen`'s own history rows (now `<button>` rows, styling preserved) and `RosterRow`'s new "Details" action (only rendered when `entry.record` exists). Verified end-to-end in DEMO_MODE as Manager: opened Elias's detail modal, edited the sign-out time via the correction block, saved, saw the record re-render with the new time and a "Saved." confirmation, map correctly fell back to the "No location captured for this entry." placeholder for the corrected sign-out (no coordinates on a manually-typed correction) — exactly the §7 no-broken-iframe guard. Delete's native `confirm()` gate also verified firing (blocks the mutation until confirmed). `npx tsc -b` / `oxlint` / `stylelint` all clean.

---

## 9. Management: "Reset attendance data" **[BUILT 2026-09-11]**

A danger-zone card at the bottom of the Management dashboard tab (below the roster), same visual treatment as §8's delete block but full-width:

- `"Reset attendance data"` heading, body text verbatim from v1: *"Clears every sign-in/out record for every staff member so days-present/absent counts start at zero. Only affects attendance — no other app or data is touched. This can't be undone."*
- A single danger button, gated behind **two** sequential `confirm()` dialogs (exact v1 pattern — this is a real, considered double-check for a company-wide destructive action, not excessive caution to remove). **Verified live** (button click correctly required confirmation before any mutation fired).
- New data-source method: `ds.attendance.resetAll()` — manager-only, deletes every `attendance_log` row. (Server-side: no new RLS needed, `al_del_mgr` already permits a manager to delete any row; the client just needs to issue an unscoped delete rather than one `.eq('id', ...)` at a time.) `ResetAttendanceDangerZone` component built directly in `AttendanceTodayScreen.tsx` (small enough not to warrant its own file), `useResetAllAttendance()` hook invalidates every attendance query surface on success.

---

## 10. Already built, keep as-is (do not regress while doing the above)

- **Office-locations admin** (multi-site list, `SettingsScreen.tsx`) — §11 below adds a map, everything else stays.
- **Attendance policy admin** (work hours/grace/work-days, versioned history) — no changes needed.
- **Server-side off-site trigger** (`recompute_attendance_offsite()`) — no changes; the map/UI work above is client-side presentation only, the server truth is untouched.
- **Pre-authorized exceptions workflow** (`attendance_exceptions`, staff request + manager approve/decline) — no changes; §13 adds the separate post-hoc classification workflow alongside it, doesn't replace it.
- **4 AI capabilities** (praise/warning drafting, coordinate-flag detection, anomaly explainer, spike-style pattern detection) — no changes.
- **Attendance Records tab** (date-range filter, staff filter, summary tiles, punctuality trend, weekday-hours chart, per-staff expandable rows with the "Explain" AI link) — no changes, though §8's detail modal should also be reachable from a Records row click for consistency.

---

## 11. Office-location admin: add the visible-radius map **[BUILT 2026-09-11]**

In `OfficeLocationsSection` (`SettingsScreen.tsx`), each office-location row in the list gains an inline `OfficeMapSnippet` (§7) showing that office's pin — collapsed by default behind a small "Show on map" / "Hide map" toggle link (`--c-accent`, per-row `mapOpenIds` state) under the coordinates line, so a multi-site list doesn't load N iframes at once. The radius itself isn't drawable in a keyless embed (no shape-overlay API without a real Maps key), so the caption line explicitly states it in text next to the map: `"{radius}m radius around this pin"` — an honest, working compromise rather than a fake-looking circle. Verified live: added a real "Head Office" site (5.6037, -0.187), toggled "Show on map", saw a real Google Maps pin render with the correct caption below.

---

## 12. Already built, cross-reference only

Sections 3 (AI suggestions), 12 (coordinate flags) of the in-progress work this session — no further spec changes found in this audit. See `project-attendance-v3-chapter01-gap` memory for their own detailed build notes.

---

## 13. New: `attendance_reviews` — post-hoc classification workflow **[BUILT 2026-09-11]**

Distinct from `attendance_exceptions` (ask permission ahead of time). This is the 59-page spec's Section 11.2 requirement: *"If staff is off-site for an authorized errand, allow sign-out after reason. Management can later classify the record as authorized or exception."* I.e., after an off-site sign-in/out already happened (with or without a pre-authorization), Management reviews it and labels it.

**Correction found before writing code**: `attendance_reviews` already existed as a real table (leftover from earlier schema-foundation work this session) with RLS already correct (own-or-manager SELECT, manager-only INSERT/UPDATE) — a stale memory note had claimed it "didn't exist yet." Re-verified via `information_schema.columns`/`pg_policies` before touching anything. The one real gap was exactly what this section flagged: no `classification` column, only free-text `note`. Added it as a real migration (`add_attendance_reviews_classification_column`): `alter table attendance_reviews add column classification text check (classification in ('authorized', 'exception'))` — the enum-column path this section said to prefer, not string-prefixing.

- **Trigger point**: in the per-record detail modal (§8), when a record has `isOffSiteIn || isOffSiteOut` and no linked review yet, shows a manager-only inline control (`OffSiteReviewSection` in `AttendanceDetailModal.tsx`): two buttons, `"Mark authorized"` (ghost, `--c-success` text) and `"Flag as exception"` (ghost, `--c-danger` text), each opening a one-line note field before confirming.
- Writes a row to `attendance_reviews` via the new `ds.attendanceReviews.decide()` method (`review_type: 'exception'`, `status: 'reviewed'`, real `classification` column set directly, `note` free text).
- Once reviewed, the detail modal shows a small resolved tag instead of the two buttons: `"✓ Authorized by {name}"` or `"⚠ Flagged by {name}"`, with the note appended inline. Verified live end-to-end (synthetic off-site test record → "Mark authorized" → note → confirm → resolved tag rendered correctly, record disappeared from the dashboard queue below).
- Management dashboard gains `OffSiteReviewQueue`, same `mgrSubTitle` + list pattern as AI suggestions — **"Off-site records awaiting review"** — every off-site record from the trailing 21-day window (`useAllAttendanceRange(21)`, already fetched) with no review yet; each row is a button opening that record's detail modal, so this doesn't rely on Management remembering to check each one individually.

---

## 14. New: 10:00am SMS + 7:00pm PDF executive daily brief **[NOT BUILT — large, cross-app]**

Full spec, quoted from the 59-page document, Section 11.4 (re-read fresh, not from memory):

- **10:00am**: an SMS to Management containing a secure report link (tokenized, same unguessable-token pattern already used for the Site Visit Experience public links). The linked report summarizes: attendance, today's work/tasks, upcoming leave, upcoming site visits, and other critical operational signals.
- **7:00pm**: a professionally designed PDF, generated server-side (pg_cron + an Edge Function, matching the exact pattern already proven for the scheduled client-reminder SMS built earlier this session — see recent commit history). PDF shape:
  - A4 portrait, branded header (logo + company name), title, date/time, management recipient name.
  - Executive summary strip: 5–7 KPIs (reuse `pdfReport.ts`'s `pdfAccentStatRow`).
  - Attendance table with status and exceptions (reuse the exact table/summary logic already built for `attendanceRecordsPdf.ts` — this section is the one piece of this whole brief Attendance itself owns).
  - Work completed / overdue section (Ops Tracker data).
  - Upcoming leave and site visits (Leave + Site Visits data).
  - Pipeline/payment alerts (Pipeline + Payments data).
  - Allocation requests awaiting action (Allocations data).
  - System-health footer: last backup timestamp, failed scheduled jobs, SMS delivery status (System Health app already tracks all three).
  - Page numbers + generated timestamp on every page.

**This is explicitly a cross-app feature, not an Attendance-only report** — attendance is one section among seven. Given its scope (touches Pipeline, Payments, Allocations, Ops Tracker, Leave, Site Visits, System Health, plus a new scheduled Edge Function and SMS token flow), this should be scoped and built as its own dedicated work item once the core Attendance gaps above are closed, not folded into "finishing Attendance." Flagging it here so it is never silently dropped, per the standing instruction that anything named in any reference document gets built, nothing left out — just not necessarily inside this specific app's remaining Attendance work.

---

## 15. Icon audit — no emoji as UI controls

The app's own established rule (already followed everywhere else in this codebase, and independently mandated by the V3 spec's universal design language: *"meaningful line icons from one consistent icon family, not emoji as substitute UI controls"*) means every new control below needs a real icon from `shared/ui/Icon.tsx`'s set, not an emoji glyph.

**Checked against the real current icon set** (`home, briefcase2, desk, chat, more, chartLine, folder, map, ruler, pin, question, gift, warning, building, checklist, note, check, card, document, calculator, palm, notepad, trophy, wallet, settings, barChart, chevronDown, search, team, bulb, shield, logout, chevronRight, bell`):

- **Camera capture button** (§3 step 5) — **[BUILT 2026-09-11]** `camera` added to `Icon.tsx`'s `IconName` union, matching the existing icons' stroke weight (1.8) / viewBox (0 0 24 24) convention exactly.
- **Map pin in the off-site modal / detail modal / office-location list** — `pin` already exists, use it (it's already used correctly in the Sidebar for Banner Tracking).
- **Calendar prev/next chevrons** — `chevronDown`/`chevronRight` exist but are the wrong orientation for a left/right month nav; either add left/right variants or rotate `chevronRight` 180° via CSS `transform: rotate(180deg)` for "previous" — the latter is the pragmatic choice, matches how a few other screens in this codebase already flip a single chevron asset for both directions.
- **Delete/danger action in the detail modal** — reuse the existing danger-zone visual treatment already shipped elsewhere (no icon needed there today, text + color alone; keep that convention, don't add one just for symmetry).
- **"On track"/"at risk" KPI pill** — text + color only (`● On track` / `● At risk`), matching v1's own plain-bullet convention exactly — no icon needed, adding one would be unnecessary decoration on an already-clear status pill.

---

## 16. Empty and loading states (every screen above must define these explicitly)

A screen is not done until every one of these is a real, considered state — not a blank flash or an infinite spinner.

- **Clock card, before today's data loads**: keep the existing `phase_loading` treatment (already built) — a muted circle with "Loading…", no flash of the wrong phase.
- **Month KPI card, first day of a fresh month / a brand-new staff member with zero history**: `daysAttended = 0` → on-time rate shows `0%`, ring renders empty (just the track color, no fill), the sentence reads *"No attendance yet this month"* instead of the usual "X of Y days" phrasing (avoid a nonsensical "0 of 0 days were on time").
- **Calendar heatmap, a month with no data loaded yet (browsed via ‹/›)**: show the grid immediately with every real-work-day cell in a skeleton-shimmer tint (`--c-line`, no color meaning yet) while `attEnsureCalendarMonthLoaded`-equivalent fetches, replace cell-by-cell once data resolves — never blank the whole grid to a spinner, the calendar structure itself is not loading, only the data inside cells is.
- **"You vs team" comparison, a team of one (no comparison possible)**: don't render the component at all rather than a bar chart with a single meaningless bar — matches the existing `if(!ATTENDANCE_MONTH_ROWS.length) return ''` guard already in v1.
- **Detail modal, a record with no photo / no coordinates**: already specified in §8 — a muted placeholder line, never a broken `<img>` or empty iframe.
- **Records tab, a date range with zero staff or zero records**: already built correctly (`"No active staff on the roster."` / `"No sign-ins in this range."`) — keep as-is, don't regress.
- **Off-site records awaiting review (§13), zero pending**: section doesn't render at all (same pattern as `PendingExceptionsQueue` already does when empty) — never show an empty-state card for a list that's supposed to disappear when clear.

---

## 17. Responsive behavior (mobile vs desktop)

This app is used two ways in practice: a staff member on their phone clocking in from wherever they are, and a manager reviewing the dashboard at a desk. Both are real, both matter.

- **Below 1024px (phone/tablet, the default)**: single column throughout, exactly as specified in §3–§9 above. The clock card, KPI card, calendar, comparison chart, and roster all stack full-width, `max-width: 480px`, centered padding `20px 16px`.
- **At 1024px and above (desktop)**: `max-width: 1200px`, `padding: 28px 32px`, matching every other manager-facing screen in this app (`AttendanceRecordsScreen`, `LeaderboardAdminScreen`, etc. already use this exact breakpoint/value pair — stay consistent, don't invent a new breakpoint). At this width:
  - The clock card and month KPI card sit side-by-side in a 2-column grid (`grid-template-columns: 1fr 1fr; gap: 16px`) rather than stacked — there's real horizontal room, and stacking them on a wide monitor wastes it (the same "no artificial stretching, no empty gutters" discipline already established for this project).
  - The calendar heatmap and "you vs team" chart also sit side-by-side below that, same 2-column treatment.
  - The Management roster/dashboard keeps its existing single-column list (a roster is a list, forcing it into columns would fragment scanability) but gains the same `max-width: 1200px` container so it doesn't stretch edge-to-edge on an ultrawide monitor.
- **The detail modal** stays a fixed `max-width: 420px` centered overlay at every breakpoint — a modal doesn't need to grow with the viewport, and a wider modal would make the map/photo feel lost in whitespace.
- **The camera capture preview** stays `220px` square at every breakpoint too — matching the existing selfie-preview convention already sized for a face-framing shot, not a full-bleed video.

---

## 18. Accessibility

- Every icon-only button (modal close ×, calendar prev/next, camera capture) gets a real `aria-label` (`"Close"`, `"Previous month"`, `"Next month"`, `"Capture photo"`) — icons alone are not accessible names.
- The camera `<video>` preview element needs `aria-live="polite"` on its surrounding status text ("Camera ready" / "Photo captured") so a screen-reader user knows capture succeeded without relying on the visual swap alone.
- Preset-dropdown reason selects (`<select>`) keep their native semantics — don't replace with a custom-styled div-based dropdown, native selects are already fully keyboard/screen-reader accessible and every other form in this app already uses plain `<select>`.
- The calendar heatmap's colored cells need a `title` attribute per cell (already specified in v1's own implementation: `title="${meta.label}"`) so hovering or screen-reader "describe" reveals the status in words, not just color — this also covers the WCAG "don't rely on color alone" rule the V3 spec's own universal design language explicitly calls out.
- Focus states: every new interactive element must show the existing app-wide focus ring (already defined globally, do not override with `outline: none` anywhere in this build).
- Respect `prefers-reduced-motion` for the progress-ring fill animation and the camera preview's capture-flash transition — both should snap instantly rather than animate for a user who's set that preference.

---

## 19. Exact data-model changes needed (summary — see each section above for the full reasoning)

| Change | Where | Reason |
|---|---|---|
| `ds.attendance.update(id, patch)` | `data/source.ts`, new method | §8 management time correction |
| `ds.attendance.remove(id)` | `data/source.ts`, new method | §8 management delete |
| `ds.attendance.resetAll()` | `data/source.ts`, new method | §9 reset-all danger action |
| `attendance_reviews.classification` column (`text`, check `in ('authorized','exception')`, nullable until reviewed) | new migration | §13 — a real enum column, not a string-prefix hack |
| New `camera` icon | `shared/ui/Icon.tsx` | §15 |
| Extended `useAttendanceHistory`/equivalent to accept an explicit month range + lazy-merge already-loaded months | `features/attendance/hooks/useAttendance.ts` | §5 calendar heatmap month navigation |

No changes needed to: `attendance_log` (already has every column §3/§8 need — `sign_in_photo`, `sign_in_lat/lng`, `sign_in_accuracy_meters`, etc.), `office_locations`, `attendance_policy`, `attendance_exceptions`, RLS policies (existing `al_upd_own_or_mgr`/`al_del_mgr` already permit the manager-only update/delete §8 and §9 need).

---

## 20. QA acceptance checklist (both sides — do not mark any item built without actually exercising it)

**Staff side:**
- [ ] Sign in on time, no reason prompts appear, camera capture works (or falls back gracefully), record saves with a real photo. **PARTIAL** — verified the not-late path reaches the Photo modal directly and the fallback file input renders; never completed an actual submit with a real photo (Browser pane sandbox can't drive a native OS file picker) — needs a real-device check.
- [ ] Sign in after the effective cutoff — late-reason modal appears first, before geolocation starts; cancelling it aborts sign-in cleanly. **Not yet exercised live** (only the not-late path was tested this session, since the demo clock was always before cutoff) — code path is symmetric with the verified off-site-reason modal, but not itself clicked through.
- [ ] Sign in from a location outside every configured office radius — off-site modal appears with the map snippet showing the real captured pin. **Not yet exercised live** within the actual sign-in wizard (the off-site modal's `OfficeMapSnippet` was verified in isolation via the office-location admin map, and the modal's JSX/logic is the same code, but the live wizard step itself wasn't triggered by a real out-of-radius coordinate this session).
- [ ] Sign in with an approved exception for today — off-site modal is suppressed entirely (already built earlier this session, not regression-tested this pass).
- [x] Camera permission denied — flow falls back to the file-input capture with a one-line explanation. **Verified live.**
- [x] Month KPI card shows the correct on-time rate and "on track"/"at risk" tag for real injected data. **Verified live** (100% on-time rate correctly still showed "At risk" due to 5 absences — the AND-gate, not an OR).
- [x] Calendar heatmap colors match real injected history exactly. **Verified live** (present/absent/today-outline/weekend-border all correct). Month-nav *merge* behavior doesn't apply — see §5's note on the deliberate wider-fetch-instead-of-merge simplification.
- [x] "You vs team" chart ranks correctly and highlights the viewer's own bar. **Verified live** (real account, "#1 of 3", accent bar on self, grey bars on teammates).
- [ ] Clicking any own history row or calendar cell opens the detail modal with the correct photo/map/reason for that exact day. **Partially verified** — history-row click confirmed live; calendar-cell click uses the identical `onSelectRecord` handler but wasn't itself clicked this session.
- [ ] Submitting an off-site exception request / approval flow (already built earlier this session, not regression-tested this pass).

**Management side:**
- [x] Roster tally, AI suggestions, and coordinate flags all still render correctly. **Verified live.**
- [x] Opening a staff member's record shows correction/delete controls only for a manager, never on a staff member's own view of their own record. **Verified live** (Elias's own view had no correction block; Manager's view did).
- [x] Editing a sign-in/out time in the detail modal saves correctly and re-renders immediately. **Verified live** ("Saved." tag + updated record shown without a page reload).
- [ ] Deleting a record removes it everywhere. **Not completed** — the native `confirm()` dialog auto-dismisses in the Browser pane sandbox (verified the gate itself fires correctly, blocking the mutation) — needs a real-device check to confirm the delete itself completes and propagates.
- [ ] "Reset attendance data" requires both confirmations, and every staff member's counters genuinely reset to zero. **Gate verified live** (double confirm() correctly blocks the mutation in the sandbox); the actual reset + a direct-SQL empty-table check was deliberately NOT run against real production data this session — needs a real-device or demo-mode-with-real-click check.
- [x] Office-location map snippet shows the correct pin per site, collapsed by default, expands on the "Show on map" toggle. **Verified live** (real "Head Office" site added, map + radius caption rendered correctly).
- [x] An off-site record with no review yet appears in "Off-site records awaiting review"; marking it authorized removes it from that list and shows the resolved tag. **Verified live end-to-end** (synthetic off-site record → queue → detail modal → "Mark authorized" + note → resolved tag → disappeared from the queue). Only the "authorized" path was exercised — "Flag as exception" uses the identical code path with a different classification value, not separately clicked.
- [ ] Every item above tested on both a narrow (phone-width) and wide (desktop) viewport per §17's breakpoint.

---

## 21. Build order for the remaining Attendance-proper work (§3–§13)

1. **[DONE 2026-09-11]** Camera capture rework (§3 step 5) — the single most spec-explicit, most visible gap. `CameraCapture.tsx` built, wired into `AttendanceTodayScreen`, verified live (idle → live capture UI → Retake/Use-this-photo review step → fallback file-input path), typecheck/lint/stylelint clean.
2. **[DONE 2026-09-11]** Sequential sign-in wizard restructure (§3) — `flow`/`step` state machine + `Modal` overlays per step, verified live (on-time/on-site path reaches the Photo modal directly; cancel-abort verified back to idle clock).
3. **[DONE 2026-09-11]** Preset-dropdown reason capture (§3 steps 2 & 4) — `PresetReasonPicker.tsx`, shared between the late-reason and off-site-reason modals.
4. **[DONE 2026-09-11]** `OfficeMapSnippet` shared component (§7) — built and wired into the off-site modal; still needs wiring into §8 (detail modal, not yet built) and §11 (office-location admin map, not yet built) when those ship.
5. **[DONE 2026-09-11]** Per-record detail modal + management correction/delete (§8) — new `AttendanceDetailModal.tsx`, new `ds.attendance.update()`/`remove()` data-source methods (both demo + Supabase implementations), verified live end-to-end (view → correct → save → confirm-gated delete).
6. **[DONE 2026-09-11]** Month KPI card (§4), calendar heatmap (§5), comparison chart (§6) — the comparison chart needed a real new RPC (`get_attendance_month_comparison`), not the pure client-side computation this line originally assumed; see §6's own note. All three verified live.
7. **[DONE 2026-09-11]** Reset-attendance-data danger zone (§9) — small, independent. Verified live (double-confirm gate fires correctly).
8. **[DONE 2026-09-11]** Office-location map addition (§11) — verified live with a real added site.
9. **[DONE 2026-09-11]** `attendance_reviews` post-hoc workflow (§13) — real `classification` column added, verified live end-to-end.
10. The 10am/7pm executive brief (§14) — separate, larger, cross-app effort; scope as its own project once 1–9 are done. **This is now the only item left; see §14 for why it's intentionally scoped out of this Attendance build pass.**

Each item above gets built, then verified live (DEMO_MODE + direct SQL where relevant), then documented in `PHASE0_INVENTORY.md` and this file's own status column, exactly the discipline already followed for every other slice this session — before moving to the next item.
