# Master / Staff Pipeline — retroactive plan (palmstead-v2-shell)

Written retroactively, 2026-10-25, as part of `docs/plans/30-master-system-audit-and-unification-plan.md` Phase 9. The single largest app in this shell — covers Master Spec Section 4 in full, plus everything built on top of `leads` since (engagement dashboards, Contract of Sale, Call Log, Analytics).

## 1. What it does, Staff vs Management

Both roles see the **same route and the same component** (`PipelineListScreen.tsx`), which branches internally on `profile.role === 'manager'`:

- **Staff ("My Pipeline")**: their own leads only (`agent_key = my_key()`), a real KPI strip, the 7-stage funnel, 8-dimension filters, per-lead actions (edit, assign, log a call, archive). No bulk delete anywhere — deliberately not offered.
- **Management ("Master Pipeline")**: every lead company-wide, the same screen with company-scoped KPIs/filters, an "All staff" picker, CSV/Excel export (`useDownloadMasterPipeline`), and the Company-wide Engagement dashboard panel (see below).

A lead can also carry `agent_key = 'company'` — the real Company Leads dataset (173+ rows, a separate bulk-imported prospect list, not tied to one agent) — rendered through the same `leads` table and the same detail screens, distinguished only by that sentinel key.

## 2. Real database schema

`leads`: `id, agent_key, name, contact, date_added, stage, plot_type, no_plots, unit_price, discount, net_total, payment_plan, grand_total, site_visit, priority, amt_paid, balance, next_action, notes, created_at, tags, deposit_target, doc_stage, doc_stage_updated_at, lead_source, banner_id, address, kyc (jsonb), version, last_modified_by, last_modified_at, deleted_at, deleted_by, deleted_by_name, deletion_reason, next_action_date, assigned_agent_key`.

**RLS** (confirmed live):
- `leads_sel`: `(agent_key = my_key() OR my_role() = 'manager' OR my_key() = any(['elias','emmanuel','elizabeth'])) AND (deleted_at is null OR my_role() = 'manager')`.
- `leads_ins`: own-agent or the elias/emmanuel/elizabeth/manager allowlist, **plus** a real money guard — `amt_paid` must be null/0 unless the inserter is on that same allowlist or a manager (a plain agent cannot create a lead that's already marked as partially paid).
- `leads_upd` / `leads_upd_company`: same allowlist shape, with a dedicated policy for the `agent_key = 'company'` rows (Company Leads) restricted to manager/elias/emmanuel/elizabeth even though any agent can *read* them.
- `leads_del`: `agent_key = my_key() OR my_role() = 'manager'`.
- `leads_client_sel`: the real client-portal self-service read (contact-digits + name match), same mechanism as Site Visits'.

`payments` (`lead_id` FK, no DB constraint) and `contracts` (`lead_id` FK, `not null`) hang off a lead; `activity_log` (call log entries) and `site_visits` (via `lead_id`) do too.

## 3. Real screens

- **`PipelineListScreen.tsx`** — the KPI strip (pipeline value, collected, outstanding, fully paid, site visits, high priority, allocation ready), stage-funnel chips (`STAGE_FUNNEL_ORDER`), an 8-dimension filter panel, CSV export, a dense desktop table / stacked mobile cards (CSS-toggled, one data-fetch path), and — the newest addition (this session's own earlier work, 2026-10-25) — an `EngagementDashboardPanel` (Dashboard/Analytics/Call Log, shared with Client Database and Company Leads via the generalized `shared/hooks/useEngagement*` hooks) above the lead table.
- **`PipelineDetailScreen.tsx`** (via `PipelineClientScreen.tsx`, `/dashboard/pipeline/[id]`) — the single-lead deep view, composed of exported section components: `ClientSection`, `LeadDetailsSection`, `PlotPricingSection`, `DepositScheduleSection`, `AllocationEligibilitySection`, `FollowUpSection`, `ActivitySection`, `AuditTrailSection`, `DocumentationSection`, `DangerZoneSection`, `SiteVisitsSection`, `PaymentHistorySection`, plus `ContractStatusSection` (shared with Company Leads/Client Database) for the real Contract of Sale tab.
- **`AddLeadScreen.tsx`** — new-lead intake, matching V1's own field set.
- **`ArchivedLeadsScreen.tsx`**, **`PipelineAnalyticsScreen.tsx`**, **`PipelineCallLogScreen.tsx`** — role-aware wrappers around the shared engagement components (My/Master framing per `profile.role`).
- `StaffPipelineImportCard.tsx` / `PipelineImportCard.tsx` — bulk import paths (staff's own pipeline vs Management's company-wide import).

## 4. Realtime sync

`leads` is one of the three tables in `useDashboardRealtime.ts`'s original filtered/unfiltered split (manager gets unfiltered, agent gets `agent_key=eq.${myKey}` filtered), invalidating a long real list: `pipelineSummary`, `todayStreak`, `myCommission`, `managerOverview`, `companyCommission`, `leadsAll`, `reportsLeads`, `leaderboard`, `leads`, `lead`, `leadsArchived`, `paymentsPending`, `paymentsNeedsCorrection`, `activityForLead`, `auditForLead`, `leadBannerCounts`. `payments` and `activity_log` (the latter added this session, Phase 3) separately invalidate their own keys, including the newer `scopedActivityAll`/`companyWideActivity` the shared engagement dashboards read.

## 5. AI integration

One real capability: `useFollowUpDraft()` (`kind: 'follow_up_draft'` on the shared `ai-insights` edge function, added 2026-09-04) — an explicit "draft a follow-up message" tap on a lead, not an auto-firing suggestion. Sends redacted context only: stage, days-since-contact, percent paid, priority, next action, and `notes` passed through `redactPII()` (strips phone-number- and email-shaped text); the client's real name is never sent — the model writes around a `{ClientName}` placeholder, filled back in locally after the response returns.

## 6. Known gaps (found reading the real code this session, not exhaustive)

- **Pre-existing pricing-data bug, found and partially fixed this session** (`docs/plans/30-...` Phase 6 follow-up): 30 of Elias's 44 leads had `grand_total`/`unit_price`/etc. zeroed out from an earlier bulk import despite V1 having real values; 18 were restored from V1 (the other 12 genuinely are GHS 0 in V1 too). **Not yet checked**: whether the same bulk-import bug affects any other agent's leads — only Elias's was audited this session.
- One specific anomaly left open: lead id `137882e4-0de9-4d31-9d25-a3a8b59a6248` is named "Mad. Esther" in V2 but V1's same id holds "Isaac Cudjoe"'s deal (4 plots, GHS 204,000) — pricing fields were restored, the name was deliberately left untouched since it might be a legitimate post-migration correction. Worth a manual look.
- `leads.amt_paid`/`balance` are independently-maintained snapshot columns, **not** a live derivation of `sum(payments)` — confirmed by comparing V1's own leads vs payments data directly (e.g. a lead with `amt_paid = 19123` has two real approved payments of 19123 each in its own `payments` rows, summing to 38246). This is a V1-inherited design, not a bug this session introduced, but any future work that assumes "outstanding balance = grand_total − sum(approved payments)" will get a different number than the lead's own stored `balance` field for leads with this kind of ledger/snapshot divergence.
