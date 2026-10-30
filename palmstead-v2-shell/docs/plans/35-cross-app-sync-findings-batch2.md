# Batch 2 — Full test sweep + cross-app sync findings

Site Visits, Site Visit Authorization, Enquiries, Referrals, Complaints. Tested live as Adams (agent) and Management (`fapeprah@landbankghana.com`), both roles, real clicks through list → detail → actions. Part of the full exhaustive sweep requested 2026-10-30; feeds into the master 100-page findings/fix plan.

---

## Functional test results

| App | Adams | Management | Console errors |
|---|---|---|---|
| Site Visits | ✅ list scoped to own 11, detail expands (Purpose/Transport/Pickup/Nationality), download PDF, delete present | ✅ "19 company-wide" of 85 total, staff filter dropdown works | none (HMR noise only) |
| Site Visit Authorization | ✅ day-picker, real entries render for a populated day, no Finalize button (correct — not authorized) | ✅ same render, **"Finalize & approve" button present** (Adams correctly doesn't have it) | none |
| Enquiries | ✅ "0 logged or assigned to you" (none are his) | ✅ "2 across the team" | none |
| Referrals | ✅ 2 recorded, both render with real names/status/points | not re-checked separately — same query path as Adams, no role-scoping code found | none |
| Complaints | ✅ "0 logged or assigned to you" | ✅ "2 across the team" | none |

No bugs found or fixed this batch — every app rendered correctly, role-scoping behaved exactly as designed, no broken buttons or crashes.

## Realtime

All 5 core tables (`site_visits`, `weekly_visit_forms`, `enquiries`, `referrals`, `complaints`) confirmed **both** in the `supabase_realtime` publication **and** wired into `useDashboardRealtime.ts`. Fully covered, nothing to fix.

## Security (RLS)

Pulled real policies for all 5 tables. All follow the established, sensible pattern (`agent_key = my_key() OR my_role()='manager'`, plus a client-self-service policy keyed on phone-digit + name match for the client portal). `weekly_visit_forms`'s `wvf_staff_ins`/`wvf_staff_upd` confirmed still correctly widened from the earlier testing-phase fix (2026-10-25).

**One note, not a bug**: `weekly_visit_forms` has no delete policy at all (no `wvf_staff_del`/`wvf_del`). Given the app's own UI doesn't appear to offer deleting an authorization form (consistent with these being formal signed-off records), this is probably intentional, not an oversight — flagged for confirmation, not fixed.

## Data quality

- `site_visits`: **82 of 85 rows have `lead_id = null`**. Checked whether these are a broken-matching bug or genuinely unlinkable: cross-referencing by phone-digit match against `leads.contact` found only 13 of the 82 could be auto-linked to a real existing lead. The other 69 are real site visitors who were never separately entered as a Pipeline lead — this is a real gap in the *funnel*, not a bug in the matching logic.
- `enquiries`/`complaints`: 2 rows each, too small a sample to be meaningful on its own, but the schema itself has no `lead_id` column at all (see below).
- `referrals`: 2 rows, `referrer_lead_id`/`referred_lead_id` well-populated proportionally — this table already does the FK linkage right.

---

## Cross-app sync analysis

### Site Visits ↔ everything else

**Real shared entity**: `lead_id` FK to `leads` (Master Pipeline / Company Leads), `agent_key` to staff (Directory, Attendance, Leaderboard).

**Working today**: when a visit IS logged from Pipeline (via the `leadId` query param in `AddSiteVisitScreen.tsx`), it correctly writes `lead_id`, and the lead detail page's Site Visits tab reads it back live via the realtime bridge. Site Visit Authorization's day view already does real-time reconciliation against `site_visits` for the selected date (verified live — a visit shown on the Site Visits list for 2026-10-21 appeared correctly on that day's authorization form). This is a genuinely working connection, not a silo.

**Real gap**: the "+ Log visit" entry point reachable directly from the Site Visits app (not via a lead's own detail page) does attempt a name/contact match against known leads, but **82/85 real rows have no `lead_id`** — only 13 are retroactively matchable, meaning ~69 real site visits represent prospects who visited but were never captured as a Pipeline lead at all. This is the real finding: **not a broken link, but a missing step in the funnel**. A visitor who shows real interest (enough to attend a site visit) should, at minimum, prompt the field agent to create a lead record — right now there's no enforcement or even a gentle nudge.

**Concrete fix**: add a lightweight "Convert to lead" action on any site_visits row with `lead_id is null`, pre-filled from the visit's own name/contact/plot_type, so capturing that follow-up takes one click instead of manual Pipeline data entry. This directly serves the user's stated automation goal — the data already exists, it just isn't being carried forward.

### Site Visit Authorization ↔ Accounting

**Real shared entity**: the day's `ACTUAL EXPENSES` total (`weekly_visit_forms.vehicle_rental_act` etc.).

**Current state**: these costs are entered and totaled here but — based on a grep of `src/app/(main)/dashboard/finance/` (not exhaustively re-audited this batch, flagged for Batch 4 which covers Accounting directly) — there's no evidence this feeds into the real Accounting app's expense ledger. **Concrete fix to evaluate in the Accounting batch**: a real `weekly_visit_forms` row whose status moves to finalized/approved should post to Accounting's expense table automatically rather than existing only as a number on this one screen — that's a genuine double-entry risk (a real cost exists in two places, or only one, with no reconciliation) worth Accounting-batch follow-up.

### Enquiries / Complaints ↔ Master Pipeline / Client Database

**Real gap, structural**: neither table has a `lead_id` column at all — purely free-text `name`/`contact`. This means:
- Management looking at a lead's detail page in Pipeline has no way to see "this client has filed 2 complaints" or "this client enquired 3 times before becoming a lead" without manually cross-referencing by name in a different app.
- A complaint resolved against a client who IS a real lead doesn't show up anywhere on that lead's own record.

**Concrete fix**: add a nullable `lead_id uuid references leads(id)` to both tables (same pattern `referrals` already uses successfully), populate it at creation time via the same phone-digit-match helper already used elsewhere (`client_portal_login`'s matching logic is the established real pattern), and surface a "Complaints" / "Enquiries" count or mini-list on the lead detail page (Pipeline/Client Database) the same way Site Visits already does. This is exactly the kind of automation the user asked for — Management gets the full client picture on one screen instead of needing to separately check 3 apps.

### Referrals ↔ Leaderboard

**Already working**: `referrals.points_awarded` feeds the real Leaderboard scoring (confirmed via the existing `leaderboardLogic.ts` reference found earlier this session, Phase 7's own audit). No gap found here this batch.

---

## Summary for the master plan

Real findings to carry forward:
1. **Site Visits → Pipeline lead conversion gap** (69 unlinkable real visits) — build a "convert to lead" quick-action.
2. **Enquiries/Complaints missing `lead_id` FK entirely** — schema change + UI surface on lead detail pages, same pattern as `referrals`.
3. **Site Visit Authorization actual-cost totals → Accounting** — no confirmed fan-out; needs Accounting-batch follow-up to confirm whether this is a real gap or already handled elsewhere.
4. Minor: confirm whether `weekly_visit_forms` having no delete policy is intentional (likely yes).

No commits this batch — findings-only, no code changes were unambiguous enough to make without the parent session's review (items 1-3 are schema/UX changes, not simple bug fixes).
