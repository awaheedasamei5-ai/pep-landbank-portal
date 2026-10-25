# Site Visit Authorization — retroactive plan (palmstead-v2-shell)

Written retroactively, 2026-10-25, as part of `docs/plans/30-master-system-audit-and-unification-plan.md` Phase 9. This is the "Logistics" half of Site Visit Authorization — the other half, Site Visit Experience (feedback collection), already shipped separately as `SveManagementScreen`/`site_visit_experience_*` and is out of scope for this doc.

## 1. What it does

One cost-estimate/reconciliation form per (week, day) — vehicle rental, driver's tip, fuel, refreshment, T&T, each with an estimated and an actual figure — tied to that day's real logged `site_visits`, finalized with Management's signature once costs are reconciled.

**Staff vs Management**: viewing and saving costs is open to any signed-in staff (`useCanViewSiteVisitAuth()` returns `!!profile`); **finalizing** (locking the form with Management's signature) is a genuine manager-only business action, gated client-side in `SiteVisitAuthScreen.tsx`'s own `isManager` check, not a separate access tier.

## 2. Real database schema

`weekly_visit_forms`: `id, week_start, visit_date, vehicle_rental_est, drivers_tip_est, fuel_est, refreshment_est, tnt_est, vehicle_rental_act, drivers_tip_act, fuel_act, refreshment_act, tnt_act, status (Open|Finalized), approved_by, approved_by_name, approved_signature, finalized_at, created_at, updated_at, site_manager_name`. One row per `(week_start, visit_date)` pair, enforced by a real unique constraint (`weekly_visit_forms_week_day_key` — confirmed live, hit and correctly respected during this session's V1 data migration, which found and skipped 5 genuine V1-side duplicate rows rather than violating it).

`getOrCreate(weekStart, visitDate)` (`data/source.ts`) creates the row on first visit to a given day if it doesn't exist yet, matching V1's own `apiLoadOrCreateWeeklyVisitForm`.

**RLS** (confirmed live):
- `wvf_staff_sel`: `coalesce(my_key(),'') <> ''` — any signed-in staff can read.
- `wvf_staff_ins` / `wvf_staff_upd`: `my_role() = 'manager' OR my_key() = any(['elias','emmanuel','elizabeth'])` — **still the old pilot-scope restriction**.

**Known access-control gap, not yet fixed**: `useCanViewSiteVisitAuth()`'s own comment states the real user ask was "give all staff ... full access to the site visit authorization app," and says the RLS was opened to match — but the live `wvf_staff_ins`/`wvf_staff_upd` policies above show that didn't actually happen; they're still restricted to manager/elias/emmanuel/elizabeth. Any other staff member who reaches the save-costs or finalize action via the now-open UI will hit a real RLS rejection, not a soft "you can't do this" message. Flagged here for a follow-up fix (widen `wvf_staff_ins`/`wvf_staff_upd` to match the UI's actual access tier, or correct the UI/comment if the restriction was intentional and the comment is stale) — not fixed in this pass since it wasn't part of this session's explicit scope.

## 3. Real screens

Single screen, `SiteVisitAuthScreen.tsx`:
- A week picker (‹ current-week-label-of-7-days ›) and a day-chip row (Mon–Sun, each showing that day's real site-visit count from `useWeekSiteVisits`).
- For the selected day: the day's real `site_visits` rows (name, contact, pickup, transport — same records Site Visits logs), with reschedule/cancel actions available inline (`useCancelSiteVisit`/`useRescheduleSiteVisit`, imported from the Site Visits feature, not duplicated).
- A cost-reconciliation table (`COST_ROWS`: vehicle rental/driver's tip/fuel/refreshment/T&T), estimate + actual columns, totals computed client-side (`costTotal()`).
- A status tag (`Open`/`Finalized`) and, for a manager, a "Finalize" action that writes `approved_by`/`approved_by_name`/`approved_signature` (the real profile signature, `profile.signatureData`) and `finalized_at`.
- `useDownloadSiteVisitAuthPdf` — exports the day's authorization form as a signed PDF.

## 4. Realtime sync

Wired into `useDashboardRealtime.ts`: `weekly_visit_forms` invalidates `['weeklyVisitForm']` for every signed-in user. `site_visits` (read by this screen via `useWeekSiteVisits`) separately invalidates `['siteVisits']`/`['weekSiteVisits']`/`['siteVisitsForLead']`.

## 5. AI integration

None. No `ai-insights` call anywhere in `src/webnext/features/site-visit-auth/`.

## 6. Known gaps (not exhaustive)

- **The RLS/UI access-tier mismatch above** is the one real, concrete bug found reading this app's actual code — worth fixing before relying on "any staff" access working end-to-end.
- V1→V2 migration (closed this same Phase 9 session): 41 of 46 missing V1 forms migrated (5 were real V1-side duplicates of a day already present under a different id, correctly skipped per the unique constraint); `approved_signature` had no data to carry over on any of those 46 (all had `has_signature: false` in V1), so no binary-asset gap here unlike Banner Tracking's photos.
- `site_manager_name` is a free-text field on the form itself, not a foreign key to `profiles` — no referential integrity if a name is typo'd or a staff member is renamed later.
