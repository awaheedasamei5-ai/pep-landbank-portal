# Master System Audit & Unification Plan

Real user request, 2026-10-25, verbatim scope: "scan through the entire system, analyze the entire codebase... test all the apps... attack the system with full force like a hacker... check for app to app syncs... check if all the missing/unfinished requirements for each app... draft a full scale plan... think about all the syncs we can put in to connect all the apps to each other... security architecture, technology stack, data architecture, third party services, design system, ai integration and intelligence, quality and testing, full feature roadmap... start executing and building/fixing/upgrading everything... look at backend of v1, and copy the data [for] banner tracking, company leads, site visit authorization, site visit, and the staff pipelines."

This document consolidates three parallel deep-dive audits (full app inventory, adversarial security review, cross-app sync review) plus direct database comparison between V1 (`lrahgcnftetnyxunaljs`, real production) and V2 (`sbydzrlzqxcdbudjaube`, the active deliverable), and lays out the phased execution that follows from them.

---

## 1. Executive summary — what's actually true right now

- **35 real sidebar apps.** 31 built, 4 explicitly `NOT_BUILT_YET` (Staff Report, Notifications, Team Roster, System Health).
- **No app is a total stub**, but 4 of the 5 apps named for V1 data migration (Banner Tracking, Site Visit Authorization, Site Visits, Master/Staff Pipeline) have **zero plan docs**, violating this repo's own mandatory process. Only Company Leads is properly documented.
- **One real Critical vulnerability** (stored XSS in Memorandum) and **one real High vulnerability** (predictable default client-portal PIN) exist right now, independent of anything this session changed — both are concrete, scoped, fixable in hours, not architectural.
- **The `has_permission()` testing-phase override** (made earlier this session, at explicit user request) has a real, now fully-mapped blast radius: mainly payments/allocations/contracts cross-agent visibility and mutation. Backups, payroll, and the permission tables themselves were independently confirmed still locked to manager-only regardless of the override.
- **V1→V2 data migration is partially done, not finished, and was never actually verified before now**: leads are 70% migrated (99/141, with IDs preserved — confirms a real prior migration pass happened, just stopped partway), banners are ~15% migrated (9/62), and site_visits/weekly_visit_forms show the same partial pattern (counts below). This is a real, previously-unverified gap.
- **Real-time infrastructure is centralized and genuinely working** (one hook, `useDashboardRealtime`, subscribed app-wide), not the scattered mess it could have been — but it has not grown to cover several features built after it, most importantly `activity_log` (the shared Call Log this session built across three apps).
- **27 orphaned demo-template routes** (kanban, crm, invoice, mail, etc.) are still live, buildable, and reachable by any authenticated user since there is no `middleware.ts` — only a single client/server `AuthGate` wraps the dashboard layout.
- **32 files still use emoji icons**, violating the project's own standing rule, most concentrated in exactly the apps that weren't touched this session (Allocations, Leave, SVE, the rest of Pipeline).

---

## 2. Security architecture

### 2.1 Findings, ranked (full detail from the adversarial audit fork)

| Severity | Finding | Where | Fix complexity |
|---|---|---|---|
| **Critical** | Stored XSS: `memo.bodyHtml` rendered via `dangerouslySetInnerHTML` with no sanitizer, at write or read | `memo-view.tsx:150`, `data/source.ts:4837` | Low — apply the same allowlist sanitizer Operations comments already use |
| **High** | Client portal self-provisions on first login with a universal hardcoded default PIN (`'1122'`), no forced change gate | `client_portal_login` RPC | Low-Medium — force PIN change or OTP before data access |
| **High (documented, scoped)** | `has_permission()` testing-phase override — exact blast radius: payments UPDATE/DELETE (no ownership check, but real approve/decline paths have their own independent manager guard), allocation requests cross-agent, contract generation for any lead, payments/site-visits visible cross-agent. Backups/payroll/permission tables confirmed untouched. | `has_permission()` function + `contract_requests_upd` policy | Already an intentional, user-approved, documented, reversible decision — not a bug to fix, a state to revert later per §9 |
| Medium | `payments.uploadProof()` has no ownership check (can overwrite any payment's receipt proof) | `data/source.ts` ~2060 | Low |
| Medium | Open CORS (`*`) on public edge functions | several edge functions | Low, defense-in-depth only |
| Low (confirmed safe, recorded so it isn't re-flagged) | Storage buckets, SQL injection surface, secrets-in-source, `process-allocation-sms`'s auth pattern | — | — |

### 2.2 Remediation plan, phased

- **Phase 1 (this session, immediate)**: fix the Critical XSS and the High default-PIN issue. Both are small, contained, and should not wait behind the rest of this plan.
- **Phase 2**: add the ownership check to `payments.uploadProof()`.
- **Phase 3 (deferred to the user's own stated next step)**: build the real Settings/permissions UI, then revert `has_permission()` to its real role-based body (preserved verbatim in the migration's own comment) and the `contract_requests_upd`/`useCanFulfilContracts()` widening.
- **Phase 4**: delete the 27 orphaned demo-template routes (`academy`, `ecommerce`, `kanban`, `crm`, `invoice`, `file-manager`, `calendar`, `infrastructure`, `logistics`, `mail`, `patient-monitoring`, `productivity`, `roles`, `tasks`, `users`, and others) — closes a real reachable-dead-code surface and shrinks the bundle.
- **Phase 5**: tighten CORS on public edge functions to the real production origin.

### 2.3 Security architecture going forward

- **Defense in depth, not RLS-only**: this audit confirmed every sensitive RPC (`approve_payment`, `restore_backup`, `generate_payroll_run`) already carries its own independent role check inside the function body, which is exactly why the `has_permission()` override didn't compromise those paths. **Standing rule going forward: every new sensitive RPC must carry its own internal role/ownership guard, never rely on RLS alone** — RLS is the outer layer, the RPC is the real gate.
- **Sanitize at every `dangerouslySetInnerHTML` sink**, no exceptions — audit every future rich-text feature against the Memorandum finding before shipping.
- **No default/predictable credentials, ever** — the client-portal PIN finding is the pattern to never repeat.

---

## 3. Technology stack (current, confirmed)

- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui (`radix-nova` style).
- **Backend**: Supabase (Postgres 17, Auth, Storage, Realtime, Edge Functions on Deno).
- **Data fetching**: TanStack Query, with one centralized realtime-to-cache-invalidation bridge (`useDashboardRealtime`).
- **Charts**: Recharts + shadcn's `chart.tsx` wrapper.
- **PDF generation**: jsPDF, used client-side across Contracts/Receipts/Reports.
- **AI**: Groq (free tier, OpenAI-compatible) via one shared `ai-insights` edge function, kind-discriminated per feature.
- **SMS**: Arkesel (confirmed live, real sends, real cost — treat with care).
- **Hosting**: Vercel (`dnm-garments` scope), production alias `palmstead-v2-shell.vercel.app`.
- **No `middleware.ts`** — route protection is entirely the client/server `AuthGate` component. This is a real architectural gap (§2.1, the 27 orphaned routes) worth a `middleware.ts` addition in a later phase for defense-in-depth route gating, not just UI-level hiding.

No new third-party service is being proposed in this plan — the existing stack is sufficient for every app's own requirements found in this audit. Where a gap exists (e.g. route-level auth), the fix is architectural within the current stack, not a new dependency.

---

## 4. Data architecture

### 4.1 Real V1 vs V2 table/row comparison (confirmed via direct SQL against both live projects, not estimates)

| Table (V1 name = V2 name) | V1 real rows | V2 real rows | Status |
|---|---|---|---|
| `leads` | 141 | 274 (173 `agent_key='company'`) | **Partially migrated — 99/141 V1 IDs present in V2 (same UUIDs, confirming a real prior migration pass), 2 soft-deleted, 40 genuinely missing.** V2's extra 133 rows are organically created in V2 since. |
| `banners` | 62 | 9 | **Mostly NOT migrated — V2 has only the first 9 (by name match: LO80-84, LO11/12/24). ~53 real banners missing.** |
| `banner_status_log` | 92 | 18 | Same pattern — tied to the missing banners above. |
| `site_visits` | 82 | 26 | **Mostly NOT migrated** — same partial pattern as banners, not yet row-diffed in this pass (see Phase 6 task list). |
| `weekly_visit_forms` (= Site Visit Authorization) | 59 | 20 | **Mostly NOT migrated** — same pattern, not yet row-diffed. |
| `plots` | 415 | 417 | Effectively fully migrated (2-row difference is organic V2 growth). |
| `allocation_requests` | 8 | 181 | V2 vastly exceeds V1 — organically grown in V2, no migration needed. |
| `payments` | 18 | — | Not migrated at all as far as this pass checked (V1 has 18 real payment rows) — flagged for the same gap-check treatment as site_visits/weekly_visit_forms, since a client's real payment history matters for continuity. |
| `contracts` | 6 | — | Same — not yet checked, flagged. |
| `profiles` (staff) | 7 | 8 | Effectively synced (V2 has one more, a test/added account). |

### 4.2 V1→V2 migration plan for the 5 named apps

Real, concrete, column-level migration — not a guess. V2's schema is a superset of V1's for every one of these tables (confirmed via `information_schema.columns` on both sides: V2 has equal-or-more columns, same names, for `leads`/`banners`/`banner_status_log`/`site_visits`/`weekly_visit_forms`/`plots`/`allocation_requests`/`profiles`), which means every migration here is a straightforward `INSERT ... SELECT` with an explicit column list, not a reshape.

**Migration order (dependency-driven)**:
1. **Leads (Staff Pipelines / Company Leads)** — fill the 40 missing V1 leads (exact ID list already captured, see §4.3) via direct insert preserving the real V1 `id`, so every other table that references `lead_id` (site_visits, payments, contracts, activity_log) keeps working against the same foreign key once those are migrated too. **Do this first.**
2. **Banners + banner_status_log** — the real Banner Tracking data, migrated together (status log rows reference `banner_id`, so banners must land first within this pair). ~53 banners, ~74 status-log rows.
3. **Site Visits** — real client visit history, referencing `lead_id` (now safe since step 1 landed every lead first).
4. **Weekly Visit Forms (Site Visit Authorization)** — the real weekly cost-authorization forms.
5. **Payments** (not originally named by the user, but a real gap found during this audit directly affecting lead continuity — a staff member's real payment history for a migrated lead would otherwise look empty). Flagged as an addition to the user's own list, pending confirmation before executing (see §9, this is the one item in this plan that touches money records and gets an explicit go/no-go check rather than silent execution).
6. **Contracts** (same reasoning as payments — flagged, same explicit-confirmation treatment).

**Real execution mechanics, every step**:
- Read every row from V1 (already demonstrated above — full column selects work cleanly).
- Insert into V2 preserving the real V1 `id` (so no new orphaned/duplicate records, and any future V1 reference stays resolvable).
- Never touch V1 — read-only, every step, no exceptions.
- Verify row-for-row count after each insert (`select count(*)` on both sides, confirm the V2 count increased by exactly the number of new rows inserted).
- Staff `agent_key` values are already shared vocabulary between V1 and V2 (`adams`, `elias`, `elizabeth`, `emmanuel`, `company`, etc. — confirmed identical in both projects' real data above), so no agent-key remapping is needed.
- After each table's migration, spot-check 2-3 real migrated records live in the V2 UI (as a real staff/Management account) to confirm the data renders correctly in its real app, not just that the row exists in Postgres.

### 4.3 Exact gap list captured (ready to execute, no further investigation needed)

The 40 missing V1 lead IDs are already enumerated (captured in this session's own working notes); banners/site_visits/weekly_visit_forms need one more row-level diff pass each (same technique as leads: pull both ID lists, `left join`, filter nulls) before executing — this is Phase 6's first task, not a re-audit.

---

## 5. Cross-app sync plan — "one system," concretely

### 5.1 Real-time publication gaps, ranked (full detail from the sync audit fork)

1. **`activity_log`** — not in the realtime publication, not subscribed anywhere. This is the exact shared Call Log table this session built across Company Leads/Pipeline/Client Database — the single highest-value fix, since it's the feature most recently built specifically to unify these apps.
2. **`profiles`** — staff changes never propagate live (Directory, assignment pickers, Chat).
3. **`announcements`/`announcement_comments`** — a broadcast feature with zero realtime.
4. **`leaderboard_scores`/`leaderboard_score_history`** — a competitive feature that should feel live.
5. **`role_permissions`** missing while its sibling `staff_permission_overrides` is present — directly relevant to the eventual `has_permission()` revert (a permission change should propagate live).
6. **`contract_share_links`/`contract_approvals`/`contract_fields`** — this session's own new Contract-of-Sale infrastructure never added, unlike its older siblings.
7. **`chat_status_updates`/`chat_status_views`** — presence feature absent while other chat tables are present.
8. Several newer Operations tables (`op_todos` family) absent while the older `op_issues` family is present.
9. A likely-duplicate table pair (`sve_day_reports` in the publication vs `site_visit_experience_day_reports` not) worth confirming as genuine duplicates or a legacy leftover before deciding what to do with each.

**The fix is concentrated**: all of these extend the single existing `useDashboardRealtime` hook — this is not "build five new realtime systems," it's "add six more tables to the one real, working hook."

### 5.2 Other cross-app consistency work

- No evidence of duplicate/drifting KPI logic between apps — confirmed Company Leads/Pipeline/Client Database all read the same real tables via the same shared `useEngagementDashboard`/`useEngagementAnalytics` hooks built this session. This is a real strength to preserve, not a gap.
- `approve_payment` is a genuinely well-fanned-out RPC (updates payment status, lead balance/stage, activity_log, in-app message, audit event, and — at threshold — an allocation request and SMS, all in one transaction). `confirm_allocation` and contract-generation RPCs were not traced line-by-line in this pass — Phase 7 task.
- The new Contract-of-Sale client SMS (`useSendContractToClient.ts`) notifies the client but not Management — every other money-adjacent action in the app echoes to an internal party; this one should too, for consistency.

---

## 6. Third-party services

- **Supabase** (`sbydzrlzqxcdbudjaube`) — Postgres/Auth/Storage/Realtime/Edge Functions. No change proposed; the platform already covers every real requirement found in this audit.
- **Arkesel SMS** — confirmed live, real cost, real delivery. No new provider needed; the one real gap (§5.2, contract-SMS not echoing to Management) is a usage pattern fix, not a provider change.
- **Groq (AI)** — free tier, already wired via the shared `ai-insights` edge function. Sufficient for every AI touchpoint found in this audit (KYC completeness, consistency scans, attendance pattern detection, smart insights, etc.) — no new AI provider needed.
- **Vercel** (`dnm-garments` scope) — hosting/deploy, working as intended.

---

## 7. Design system

- **Established and real**: shadcn `radix-nova` style, Tailwind v4 semantic tokens, lucide-react icons, the `animate`/`impeccable` skill suite already wired into this repo's own hooks.
- **The one real, repeatable violation found**: 32 files still use emoji instead of lucide-react (full list captured by the inventory fork; worst offenders: `AllocationRequestsScreen.tsx` with 9, SVE screens with 6 each, `LeaveScreen.tsx` with 5, the rest of `PipelineDetailScreen.tsx`/`PipelineListScreen.tsx` with 5 each not yet touched by this session's own partial pass). **Phase 8 task: sweep every remaining file, same mechanical swap already proven safe this session on Company Leads/Pipeline-list/Client-database-list.**
- No new design system or component library is being proposed — the existing one is sound and simply needs this one standing violation closed out everywhere it still exists.

---

## 8. AI integration and intelligence

- **Current real state**: one shared `ai-insights` edge function, kind-discriminated, covering KYC completeness notes, contract consistency scans, attendance pattern-based praise/warning drafts, Smart Insights' cross-app digest, and Analytics' narration layer.
- **No AI gap found that needs a new capability** — every app that plausibly benefits from an AI touchpoint already has one, per the inventory audit (Smart Insights v2, Analytics v2, Leaderboard, Attendance, Contracts).
- **One real opportunity surfaced by this audit**: the Call Log `activity_log` unification (§5.1 #1) is also the natural foundation for a future cross-app "what happened today" AI digest spanning calls + visits + payments in one narrated summary — flagged as a genuine future enhancement, not built in this plan (scope discipline: this plan fixes real gaps, it doesn't invent new features beyond what the audit found missing).

---

## 9. Quality and testing

- **Established, working discipline** (this session's own track record): typecheck (`npx tsc -b`) + production build clean before every commit, live verification against real SQL cross-checks and real staff/Management accounts, test data created and cleaned up afterward, never left in production.
- **Real gap found**: there is no automated test suite (`AGENTS.md` states this explicitly) — every verification this session and historically has been manual live-testing. This is a known, accepted tradeoff for this project's pace, not treated as a defect to fix in this plan (the user has never asked for automated tests; adding a testing framework unprompted would be scope creep).
- **This plan's own QA standard, carried through every phase below**: real SQL verification before and after every data change, live UI verification as both a staff and Management account for every app touched, typecheck + build clean, commit message states exactly what was verified.

---

## 10. Full feature roadmap (from the inventory audit, prioritized)

### Done and solid (no action needed)
Home, Client Database, Plot Inventory, Enquiries, Referrals, Complaints, Directory, Staff Hub (and its 4 sub-apps), Memorandum, Accounting, Contract of Sale, Quotation, Notes, Announcements, Chat, Smart Insights, Data Check, Document Vault, My Portfolio, Analytics, Leaderboard (phases 1-3).

### Done but genuinely incomplete per their own owning session's notes (not this plan's to silently claim fixed)
- **Operations Tracker** — reports programme and remaining mutation/security contracts still open per `docs/CONTINUE_HERE.md`'s own latest entries (a different, concurrent session's active work — this plan does not duplicate or interfere with it).
- **Leave** — reports and effective-policy-history reconstruction still open (same, concurrent session's own stated next step).
- **Attendance** — reporting still open (same).

### Done but undocumented (this plan's own real gap to close)
Banner Tracking, Site Visit Authorization, Site Visits, Master/Staff Pipeline — all functionally real and shipped, none has the mandatory `docs/plans/*.md` this project's own process requires. **Phase 9: write the retroactive plan doc for each**, covering what's actually built (not a re-design), so the project's own documented-process rule is actually honored.

### Not built
Staff Report, Notifications, Team Roster, System Health — all explicitly `NOT_BUILT_YET` in the sidebar. Not in scope for this plan (the user's request was audit + sync + the 5 named apps' data, not new-feature construction) — recorded here for completeness, not scheduled.

### Settings / permissions UI
Explicitly `NOT_BUILT_YET`, and directly relevant to §2.2 Phase 3 (the `has_permission()` revert depends on it existing). Not built in this plan (the user's own stated plan is to build it themselves next) — this plan's job is to leave the system in a state where that's straightforward: a honest `role_permissions`/`staff_permission_overrides` table is already the right foundation, nothing architectural blocks building the UI on top of it whenever that happens.

---

## 11. Phased execution order (this plan's own work, in the order it actually happens)

1. **Phase 1 — Critical/High security fixes.** Memorandum XSS sanitizer, client-portal default-PIN forced-change gate. Immediate, independent of everything else. **DONE 2026-10-25** — `memo-view.tsx` now sanitizes through `safeOperationCommentHtml()`; `client_portal_login` RPC rewritten to mint a random 6-digit PIN delivered by real SMS on first match instead of granting a session on a hardcoded `'1122'`. Committed `ffc0283`.
2. **Phase 2 — Medium security fix.** `payments.uploadProof()` ownership check. **DONE 2026-10-25** — added an independent role guard (manager or `'elias'`, mirroring the real `payments_ins`/`payments_upd` RLS) since `has_permission()` is temporarily forced `true` for the testing phase. Committed `d0fe5ed`.
3. **Phase 3 — Realtime sync.** Extend `useDashboardRealtime` + the `supabase_realtime` publication with the 6 ranked gaps from §5.1, starting with `activity_log`. **DONE 2026-10-25** — 12 tables added to the publication (`activity_log`, `profiles`, `announcements`, `announcement_comments`, `leaderboard_scores`, `leaderboard_score_history`, `role_permissions`, `contract_share_links`, `contract_approvals`, `contract_fields`, `chat_status_updates`, `chat_status_views`); 10 wired into the client bridge (`role_permissions`/`contract_share_links` have no frontend cache to invalidate yet, left in the publication for future use). Committed `bfa47ea`.
4. **Phase 4 — V1→V2 data migration**, in the dependency order from §4.2: leads gap-fill (40 rows) → banners + banner_status_log → site_visits → weekly_visit_forms. Payments/contracts flagged for an explicit go/no-go check with the user before executing (money records). **DONE 2026-10-25** — banners migrated first (54 rows, metadata only — `image` base64 blobs deliberately deferred, see below) so the 2 leads referencing banner_id resolved correctly; leads +42 (316 total); site_visits +59 (85 total); weekly_visit_forms +41 of 46 candidates (5 were V1-side duplicates of a `(week_start, visit_date)` already present in V2 under a different id, correctly rejected by the real unique constraint and skipped rather than forced in). All four counts verified live in the browser as Management (Master Pipeline "309 leads company-wide", Banner Tracking "62 placed", Site Visits "85 total visits", Site Visit Authorization rendering Oct 21's 4 migrated entries) with zero console errors. **Known gap, not closed**: banner `image` (base64 field photos) and weekly_visit_forms `approved_signature` left null for the migrated rows — re-attaching binary photo/signature assets from V1 is a separate, lower-priority follow-up (bulk base64 transfer through the SQL tool is impractical; ~10MB+ of combined blob data). `banner_status_log` also migrated (+75 rows, 18→93; same `images` base64 gap as banners, same reason). `payments`/`contracts` migration intentionally not attempted (money/legal records, requires the explicit go/no-go this plan flagged).
5. **Phase 5 — Orphaned route cleanup.** Delete the 27 demo-template routes. **DONE 2026-10-25** — re-verified with a dedicated fork (grepped the whole `src/` tree for real inbound links, not filename pattern-matching): the real count was 16, not 27 (the original estimate over-counted). Deleted `academy`, `crm`, `ecommerce`, `file-manager`, `infrastructure`, `invoice`, `kanban`, `logistics`, `mail`, `patient-monitoring`, `productivity`, `roles`, `tasks`, `users`, `calendar` (its own demo page — `src/components/calendar/` and `mini-event-calendar.tsx`, the real live shared calendar used in Operations, untouched), `profile` (dead `/dashboard/profile` entry also removed from `portal-navigation.ts`'s route registry). Deliberately kept: `commission` (fully real, wired to Finance, just removed from the sidebar 2026-10-23 — would have been wrongly deleted by name-pattern matching alone) and `notice-board`/`polls`/`staff-complaints`/`team-feedback` (real `_components` screens genuinely imported into Staff Hub; only their redundant standalone route wrapper might be prunable, left alone pending a narrower follow-up pass). Verified live as Management: a deleted route (`/dashboard/academy`) now renders the app's own real "Page not found" screen instead of demo content; Staff Hub (depends on the 4 kept components) still renders correctly. `npx tsc -b` clean. Committed `e58e961`.
6. **Phase 6 — Row-level diff pass** for site_visits/weekly_visit_forms/payments/contracts (same technique proven on leads), completing §4.3. **DONE 2026-10-25** — site_visits/weekly_visit_forms diffs were already completed as part of Phase 4's own migration. For payments/contracts (money/legal records originally flagged for an explicit go/no-go, not part of the user's original 5-app list), the user confirmed "yes, migrate them too" when asked directly. Payments: 4 of 18 V1 rows were missing (14 already present under matching ids) — migrated, all referencing lead_ids already confirmed present in V2. Contracts: 5 of 6 V1 rows were missing — migrated, same lead_id verification. No binary assets involved in either table.
   - **Separate bug found and fixed during this verification, user-confirmed**: 30 of Elias's 44 Master Pipeline leads had `grand_total`/`unit_price`/`plot_type`/etc. zeroed or nulled in V2 despite V1 having real deal data — a pre-existing bug from an earlier bulk import (created_at `2026-07-23 14:18:40`), not something this session caused. User instruction: "Add all the leads but dont add the payment data to it." Restored all non-payment fields from V1 for all 30 (plot_type, no_plots, unit_price, discount, net_total, payment_plan, grand_total, site_visit, priority, next_action, notes, tags, deposit_target, lead_source where applicable) — `amt_paid`/`balance` deliberately left untouched, exactly as instructed. 18 of the 30 had real nonzero V1 pricing and are now corrected (e.g. "Rejoice" GHS 0 → GHS 7,500, verified live); the other 12 genuinely have GHS 0 in V1 itself (not a bug, left as-is). **Known anomaly flagged, not resolved**: lead id `137882e4-0de9-4d31-9d25-a3a8b59a6248` is named "Mad. Esther" in V2 but V1's same id holds "Isaac Cudjoe"'s deal data (4 plots, GHS 204,000) — restored the pricing fields only, left V2's existing name untouched since it may be a legitimate post-migration correction; worth a manual look by the user. Same underlying bulk-import bug plausibly affects other agents too (only Elias's batch was checked this session) — a full agent-by-agent sweep is a reasonable follow-up, not yet done.
7. **Phase 7 — RPC fan-out trace** for `confirm_allocation` and contract-generation, completing §5.2's open item. **DONE 2026-10-25** — read `confirm_allocation`'s full body: updates `allocation_requests` + `plots` inside the same transaction, records a real audit event, and the client-side caller (`useAllocationRequests.ts`) already sends a real client SMS on success. No fan-out gap found. Contract generation (no dedicated RPC -- client-orchestrated via `useSendContractToClient.ts`): writes `contracts` + `contract_share_links`, marks `contract_requests` fulfilled when applicable, sends client SMS. The one real gap is the already-known missing Management echo, unchanged scope for Phase 10.
8. **Phase 8 — Design system sweep.** Remaining 32 emoji-icon files.
9. **Phase 9 — Retroactive plan docs** for Banner Tracking, Site Visit Authorization, Site Visits, Master/Staff Pipeline.
10. **Phase 10 — Contract-SMS Management echo**, closing the one notification gap from §5.2.

Phases 1-2 (security) execute first and immediately, since they're live vulnerabilities. Phase 3-4 (sync + data) are the heart of "connect the apps into one system" and "preserve V1 data," the user's two most explicit asks. Phases 5-10 round out the audit's remaining findings in descending priority. Every phase gets the QA standard from §9 before being called done — no shallow "done" claims, per this project's own standing rule.
