# Batch 7 findings — Home, Banner Tracking, Document Vault (final batch)

Part of the full system test sweep + cross-app sync analysis (Batches 1-7), 2026-10-30/31.

## Functional testing

Tested live as Adams (agent) and Management, full login/logout cycle verified explicitly for both
roles this batch (a prior batch had a session-switch quirk; re-confirmed clean here: Adams's own
sidebar chip read "Adams / Agent" and Management's read "Management / Manager" at every check).

### Home (`/dashboard/default`)
- Both roles: dashboard renders correctly. Total leads/Outstanding/Fully paid/Open complaints tiles,
  "Collected this month" chart, "Pipeline by stage", "By agent" breakdown all real, no NaN/negative
  values, no console errors.
- Role-scoping correct: Adams sees 34 leads (his own), Management sees 309 (company-wide). "By agent"
  correctly shows only Adams himself when he's viewing, the full ranked list for Management.
- **Minor copy bug found, not fixed (cosmetic, low priority)**: the "Pipeline by stage" card's
  subtitle reads "Real lead count per pipeline stage, company-wide." verbatim for BOTH roles, even
  though the actual numbers shown to Adams are scoped to his own 34 leads, not company-wide. The
  label is misleading for any non-manager viewer. Real fix: make the subtitle conditional on
  `isManager`, same pattern other dashboard cards in this app already use.

### Banner Tracking (`/dashboard/banners`)
- Both roles: Dashboard/Banners/Map & Routes/Reports tabs all render. "Leads generated" / "Leads from
  banners" tiles correctly show 0 for Adams and 3 for Management — **this is correct RLS-scoping
  behavior, not a bug**: all 3 real `leads.banner_id`-linked leads belong to `agent_key='company'`
  (Company Leads), which `leads_sel` RLS already restricts to manager/elias/emmanuel/elizabeth (a
  real, intentional business rule confirmed in Batch 1's findings against lead-poaching). Verified
  this hypothesis directly rather than assuming.
- **Real cross-app gap confirmed (not fixed — genuine feature addition, not a wiring bug)**: a
  banner's own detail page (`/dashboard/banners/:id`) shows only its status-update history — it has
  **zero lead-attribution display**, for either role, despite the dashboard-level aggregate knowing
  exactly how many leads came from each banner (`useLeadBannerCounts()` already returns a
  per-banner count). The link from banner → lead is real in the data (`leads.banner_id`) but
  completely invisible on the one screen (the banner's own page) where a field officer would most
  want to see "which real clients did this specific banner bring in." Concrete fix: add a "Leads
  sourced from this banner" section to the banner detail screen, querying
  `leads.where(banner_id = this banner's id)` (already proven safe/correct via the same `leadBannerCounts()`
  query pattern) and rendering name/contact/stage per lead, same list-row style already used
  elsewhere in Pipeline.

### Document Vault (`/dashboard/document-vault`)
- Both roles: real, working, genuinely cross-app. This is a **strength to highlight**, not a gap.
  As Management, the subtitle reads "Every file downloaded by the team" and the list shows real
  files auto-logged from across the system: payment receipts, site visit PDFs, pipeline exports,
  payments reports, quotations, contract-of-sale PDFs, allocation attachments, and SVA forms — each
  tagged with who downloaded it and when. As Adams, correctly scoped to "Everything you've
  downloaded from this account", same real file types, no "Downloaded by" column (redundant for a
  self-scoped view).
- **Minor gap, not fixed (low-priority UX)**: vault entries are a flat filename list with a Download
  action — no entry links back to its real source record (e.g. clicking `Receipt_RCT-000004.pdf`
  doesn't jump to that payment in Pipeline, clicking a `SiteVisit_*.pdf` doesn't jump to that visit).
  The underlying download events almost certainly carry enough context (filename convention alone
  encodes it) to backfill a real `source_type`/`source_id` and make each row a real deep link. Not a
  bug — current behavior (download the file) works — but a concrete, buildable enhancement toward
  "one connected system."

## Security

RLS checked for `banners`/`banner_status_log` (policies sound, matches earlier Phase 4 work this
session) and the real Document Vault table (confirmed it's backed by a real download-log table, not
a separate unlinked upload store — no RLS issues found, correctly scoped per-staff for SELECT,
company-wide for Management). `has_permission()` testing-phase override not re-flagged (already
documented). No new security findings this batch.

## Realtime — the single most valuable check this batch

Ran the full system-wide audit: every table in the `supabase_realtime` publication (84 tables)
cross-referenced against every table actually subscribed in
`src/webnext/features/dashboard/hooks/useDashboardRealtime.ts`. This is the 4th time this exact bug
class (table in the publication, never wired into the hook) has been found this session — found and
fixed again here.

**5 more tables found missing and fixed** (commit `5e72a61`): `achievement_definitions`,
`staff_achievements`, `attendance_exceptions`, `leave_request_logs`, `office_locations` — all
confirmed to have real frontend query consumers via `src/webnext/data/source.ts` and real query keys
(`achievementDefs`, `staffAchievements`, `attendanceExceptions`, `leaveRequestLogs`,
`officeLocations`) traced directly from the consuming hooks, not guessed.

**Deliberately left alone**, with reasons:
- `op_cycles`, `op_issue_activity`, `op_issue_assignees`, `op_issue_comments`, `op_issue_labels`,
  `op_issues`, `op_labels`, `op_modules`, `op_projects`, `op_states`, `schedule_item_attachments`,
  `schedule_item_invitees`, `task_events`, `app_data_versions` — all Operations Tracker's own
  subsystem (consumed only in `src/app/(main)/dashboard/operations/`), under active concurrent
  development this whole sweep. Same boundary already respected in Batches 3, 5, and the master
  plan's own §5.1 item 8 resolution.
- `chat_group_members`, `chat_groups`, `chat_message_reactions`, `messages` — already correctly
  wired into Chat's own dedicated realtime channel in `use-chat.ts`, not duplicated here by design
  (confirmed by reading the file directly, not assumed).
- `chat_starred_messages`, `chat_conversation_settings` — intentionally personal/per-device settings,
  correctly never wired (confirmed in Batch 5).
- `client_notifications`, `plot_requests`, `site_visit_feedback` — zero real code references
  anywhere in `src/` outside their own migration files. Genuinely dead tables, not a realtime gap.
- `role_permissions`, `contract_share_links` — already documented (Phase 3 of the master plan) as
  having no frontend cache to invalidate yet.
- `attendance_policy`, `attendance_reviews` — real consumers exist, but neither has one clean,
  unambiguous query key traceable with full confidence (unlike the 5 tables that were fixed) — given
  this session's standing caution around HR/attendance business logic, flagged for a follow-up
  session to trace and wire correctly rather than guessed at here.

## Data quality

No broken `banner_id` references found (all 3 real linked leads resolve to real banners). Document
Vault's file-type tagging (PDF/EXCEL/CSV/ATTACHMENT/BACKUP) is internally consistent with real file
extensions — no mismatches found.

## Cross-app sync mapping

1. **Home → everywhere**: already a real, working cross-app surface (leads/complaints/payments all
   genuinely live, role-scoped correctly) — the only gap is the cosmetic subtitle mislabel above, not
   a data-sync problem.
2. **Banner Tracking → Pipeline**: real data link exists (`leads.banner_id`) and is correctly
   aggregated at the dashboard level, but invisible at the banner-detail level — the one real,
   concrete, buildable gap this batch.
3. **Document Vault ← everywhere**: the strongest existing cross-app pattern found in the ENTIRE
   sweep (batches 1-7) — it already proves the system can auto-populate one app's screen from events
   happening in 7+ other apps, with zero manual staff entry. This is the pattern the user's stated
   goal ("the system relying on its own knowledge instead of manual entries") should be generalized
   from, not reinvented. Worth calling out explicitly in the master synthesis doc as the existing
   proof-of-concept for the kind of automation being asked for everywhere else.

## Summary for this batch

No critical bugs. One real fix shipped (5-table realtime gap, commit `5e72a61`). One concrete,
buildable cross-app sync gap found (banner → lead attribution, detail-page level). One minor UX
enhancement opportunity (Document Vault deep-linking). One cosmetic copy bug (Home's pipeline-by-stage
subtitle). All further detail is carried into the master synthesis document,
`docs/plans/41-complete-system-findings-and-phased-fix-plan.md`.
