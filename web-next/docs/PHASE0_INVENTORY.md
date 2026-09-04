# Phase 0 — Freeze & Inventory

Executed per the Master Rebuild Specification, Section 26 ("Implementation
order — do not skip the sequence"). This is a living document: update it as
Phase 0/1 work lands rather than creating a second copy.

Two Supabase projects exist:
- **production** `lrahgcnftetnyxunaljs` — the real app (`index.html`), real data. Read-only for this rebuild unless a change is explicitly approved turn-by-turn.
- **staging** `sbydzrlzqxcdbudjaube` — full write access, backs `web-next`'s live mode and this rebuild's testing.

Recurring finding across this whole session: **staging lags production's real
schema.** Several "missing" things the master spec's own audit flagged are
not actually missing — they exist on production and were never ported to
staging. That drift is now the primary lens for everything below: for each
piece of Phase 1-required infrastructure, the question is "does this already
exist on production and just need porting + wiring," not "does this need to
be designed from scratch."

## 1. Audit / event trail — mostly EXISTS, needs porting + wiring

Production has a real, actively-written audit log:

- **`audit_events`** table: `id, created_at, category, event_type, severity, actor_key, actor_name, entity_type, entity_id, summary, detail jsonb, source`. RLS: `SELECT` restricted to `my_role()='manager'`, **no INSERT policy at all** — the table is written exclusively through a SECURITY DEFINER RPC (RLS-enabled with only a SELECT policy denies all direct client writes; only the function, running as its owner, can write).
- **`record_audit_event(category, event_type, severity, entity_type, entity_id, summary, detail)`** RPC — the sole write path. Validates `category in ('audit','integrity','error','cron')`, stamps `actor_key`/`actor_name` from the caller's own session server-side (never trusts a client-supplied actor).
- Client helpers in `index.html`: `logAudit(...)` (narrow set of sensitive call sites — e.g. `config.changed`) and `logClientError(...)` (wired to `window.onerror`/`unhandledrejection`, 60s dedupe per error signature so a render loop can't flood the log).
- A daily **`scheduled-integrity-check`** Edge Function (cron, 8am) writes `category='integrity'` findings.
- A Management-only **Audit Log screen** (`auditLogHtml()`, `index.html:21743`) browses `audit_events` with category/critical filters.
- Real data on production right now: 26 events since 2026-08-22 — 14 integrity findings, 9 client errors, 2 payment deletions, 1 payment edit.

**Gap (closed 2026-09-03):** `audit_events` and `record_audit_event` did not exist on staging. Ported via migration `p0_port_audit_events_to_staging` — identical schema, RLS (manager-only SELECT, zero INSERT policies), and RPC now live on staging.
**Remaining gap:** no equivalent exists in `web-next` — no table access, no `logAudit`-style helper, no screen.

**Phase 0/1 action:** add `DataSource.audit.log(...)` to `web-next`'s data layer; port the Audit Log screen; keep the existing narrow, deliberate call-site policy rather than a blanket instrumentation sweep.

## 2. Backup & Restore — EXISTS, production-grade, needs porting + wiring

- **`create_backup(trigger, by, by_name)`**: snapshots 25 real business tables (`leads`, `plots`, `payments`, `enquiries`, `complaints`, `site_visits`, `activity_log`, `allocation_requests`, `target_selections`, `tasks`, `task_events`, `feedback`, `feedback_comments`, `quotation_requests`, `sms_log`, `client_portal_access`, `payment_reminders_log`, `client_notifications`, `plot_requests`, `weekly_visit_forms`, `leave_requests`, `memos`, `pricing_history`, `contracts`, `contract_requests`, `allowed_emails`, `app_config`, `profiles`) into one JSONB blob, SHA-256 checksummed, stored in `public.backups`, auto-pruned to the most recent 30.
- Runs automatically via **pg_cron** at 6am/2pm/10pm (`backup-6am`/`backup-2pm`/`backup-10pm`), plus a manual "Backup now" button in `index.html` (`apiCreateBackupNow`).
- **`restore_backup(backup_id, by, by_name)`**: manager-only (`raise exception` otherwise), **automatically takes a pre-restore safety snapshot before restoring** (so a bad restore is itself recoverable), deletes+repopulates all 26 tables from the stored snapshot, and logs the restore to both `activity_log` and `audit_events` as a `critical`-severity event carrying both the restored-from ID and the safety-snapshot ID.
- Real data: 30 backups on file, oldest 2026-08-24, newest today — the retention pruning is confirmed working (count never exceeds 30).

**Correction:** an earlier combined-statement query against staging returned a false negative for `public.backups`. Re-checked directly — the table is fully live on staging too, 30 real rows, correct schema. No staging drift here after all; the only real gap was in `web-next`.

**Gap (closed 2026-09-03):** no `web-next` UI existed. Built (System Health + Backup & Restore screens, see below).

**Correction (caught by the pgTAP suite in §9, not manual inspection):** `backups` has exactly **one** RLS policy (`backups_sel`, manager-only SELECT), identical on both projects — not zero as first assumed here by analogy with `audit_events`. This is the *correct* shape (a manager reads the list straight through RLS; only `create_backup`/`restore_backup`, both SECURITY DEFINER, can write) — the first assumption was simply never checked directly. Left as a worked example of why §9 exists.

## 3. Domain-specific log tables — NOT a gap, already real and already portable

`task_events`, `activity_log` (this is the CRM contact-log, not a generic audit trail — `agent_key/client/action/detail/note/method/follow`), `attendance_log`, `banner_status_log`, `payment_reminders_log`, `pricing_history`, `receipt_log`, `sms_log` — all exist on **both** production and staging already, each with real, correctly-scoped INSERT+SELECT (and in `attendance_log`'s case, UPDATE/DELETE) RLS policies. The master spec's framing of "missing event tables" does not apply to these; they're mature and already usable as-is. No action needed here beyond `web-next` wiring individual screens to them as those screens get built (already underway for several).

## 4. Role / permission-record system — GENUINE gap, now scaffolded (staging only)

`profiles.role` is a bare `text` column — no enum, no check constraint, no FK to a roles table. `tool_access` and `unlocked_skins` are ad hoc `jsonb` blobs on `profiles`, not a real permission-record model. No dedicated roles/permissions table exists anywhere in the schema. Confirmed by reading every real per-staff RLS allowlist across the app: `elias` can log/edit/delete payments (`payments_ins/upd/del`); `elizabeth` can generate contracts (`contracts_ins`); `elias`+`emmanuel` manage plot allocations (`alloc_ins/upd`); `elias`+`emmanuel`+`elizabeth` get cross-staff back-office visibility on payments/contracts/site visits (`payments_sel`/`contracts_sel`/`site_visits_sel`/`site_visits_del`) — four real, hardcoded staff-key arrays baked directly into policy text, not a real model.

**Built 2026-09-03 (staging only, additive, zero existing RLS touched):** `permissions` (a real catalog: `payments.manage`, `contracts.generate`, `allocations.manage`, `ops.view_all`), `role_permissions`, `staff_permission_overrides` (seeded to replicate the four real grants above exactly), and `has_permission(key) returns boolean` (SECURITY DEFINER: `true` for any manager, else looks up the caller's own `staff_permission_overrides` row). All three new tables are manager-only-SELECT RLS, matching `audit_events`'s "read via RLS, write via nothing yet" shape (no permission-management UI/RPC built yet — a real admin screen for granting/revoking is separate follow-up work, not done here).

`tests.run_permission_model_parity_tests()` (8/8 passing) proves `has_permission()` agrees byte-for-byte with the real hardcoded checks for every real staff key (`elias`, `emmanuel`, `elizabeth`, and a plain agent) via direct JWT-claim impersonation of their real profile rows — no data mutation needed, since those three keys already exist as real profiles. This is the safety property that makes a future cutover low-risk.

**All four cutovers done 2026-09-03 (staging only)** — every real hardcoded staff-key array this session found is now gone, replaced one policy group at a time, each verified against the *actual* protected table (not just `has_permission()` in isolation) before moving to the next:

| Grant | Policies cut over | Real behavioral test | Result |
|---|---|---|---|
| `payments.manage` | `payments_ins`/`upd`/`del` | `run_payments_cutover_behavior_tests` — throwaway lead+payment, elias inserts, emmanuel throws `42501` | 2/2, zero leftover fixture data |
| `contracts.generate` | `contracts_ins` | `run_contracts_cutover_behavior_tests` — elizabeth inserts, elias throws `42501`; cleanup via `RESET ROLE` since contracts has no DELETE policy at all (immutable by design) | 2/2, zero leftover |
| `allocations.manage` | `alloc_ins`/`sel`/`upd` | `run_allocations_cutover_behavior_tests` — emmanuel inserts a request for another agent, elizabeth is denied the same | 2/2, zero leftover |
| `ops.view_all` | `payments_sel`/`contracts_sel`/`site_visits_sel`/`site_visits_del` | `run_ops_view_all_cutover_behavior_tests` — real existing data (9 of `adams`'s real payments): elizabeth sees all 9, a plain agent sees 0 | 2/2, zero side effects (read-only, no fixtures needed) |

Every own-row clause (`agent_key = my_key()`) and every unrelated clause (contracts_sel's client-contact-match subclause) was preserved verbatim — confirmed by diffing the rewritten `pg_policies.qual`/`with_check` text against the originals before running each test. `my_role()='manager'` was dropped from each OR-chain since `has_permission()` already returns `true` for any manager internally — not a behavior change, just no-longer-needed redundant text. Total: **33/33 pgTAP assertions passing** across all 6 suites (`run_rls_foundation_tests` 13, `run_rls_authenticated_tests` 4, `run_permission_model_parity_tests` 8, and the four cutover suites above at 2 each).

**`role_permissions` wired in + management RPCs added (2026-09-03):** the table existed since the first migration but `has_permission()` never actually queried it — caught before any UI got built on top of the gap. Fixed: staff override wins when one exists, else falls back to the caller's role default, else `false`. Two new manager-only, audit-logged RPCs: `set_permission_override(staff_key, permission_key, granted)` and `clear_permission_override(staff_key, permission_key)` — the real write path a future admin screen will call (direct table writes stay blocked, same shape as `audit_events`/`backups`). `tests.run_permission_management_rpc_tests()` (6/6) proves the role-default fallback, that a non-manager is rejected (`throws_ok`), that granting/clearing actually changes `has_permission()`'s answer — checked as a plain agent, deliberately demoted from the manager impersonation needed to call the RPCs so the manager bypass can't confound the result — and that every action lands in `audit_events`. **Running total: 39/39 pgTAP assertions across 7 suites.**

**Deliberately not done here:** porting any of this to production — staging-only until a real cutover is planned and approved turn-by-turn (matches the standing production-write rule). Also not done: `web-next` UI/DataSource wiring for the permission model (next item below).

## 5. pgTAP — GENUINE gap, matches the spec's ask

`pg_extension` on production has `pgcrypto`, `pg_cron`, `pg_net` — no `pgtap`. It needs to be enabled and a real test suite written from nothing; this is not a porting task.

## 6. Route inventory — `web-next` (`router.tsx`, current)

Two public routes (`/visit-feedback/:token`, `/receipt/:token`) + `/login` +
33 authenticated routes under `/app`. Already ported: Home/Mgr dashboards,
Sales Desk (pipeline, plots, clients, site visits + SVE, referrals,
enquiries, complaints, company leads, allocations), Office Desk (My Day,
attendance, memos, Log Payment, contracts + generator, quotation +
technical, leave, notes, banners, expenses, site visit auth, staff report),
chat, More, Data Check, Smart Insights, Document Vault, Leaderboard,
Manager Pipeline, Commission (both views), Settings, Team Roster, Reports,
Analytics, Insights Hub.

**Not yet ported (confirmed against `index.html`):**
- System Health screen (`systemHealthHtml`, `index.html:21683`)
- Audit Log screen (`auditLogHtml`, `index.html:21743`)
- Backup & Restore screen (manual backup trigger + restore flow, `index.html:21442-21630`)
- Portfolio/Achievements (in progress on disk, uncommitted — see below)

These three admin screens are the natural home for the ported audit/backup infrastructure above, and are real Phase 0/1-adjacent work (the spec explicitly wants health checks as a Phase 0 deliverable).

## 7. Migration naming convention (adopted going forward)

This session has informally used `add_<description>` / `fix_<description>`
snake_case names via `apply_migration`. Formalizing it: **`<phase>_<verb>_<description>`**,
e.g. `p1_add_roles_table`, `p1_port_audit_events_to_staging`, `p0_port_backups_table_to_staging`.
The phase prefix makes `list_migrations` output self-documenting against this
spec's own phase numbering without needing to cross-reference this file for
every entry.

## 8. Open item carried over

Uncommitted, unshipped Portfolio/Achievements screen work exists on disk
(`web-next/src/features/portfolio/`, `types/domain.ts`, `data/mappers.ts`,
`data/source.ts`, `data/demo/store.ts` additions) from before the pivot to
this specification. Per the spec's own Phase 0 instruction to halt new
feature work until the foundation is in place, this stays uncommitted and
unshipped until Phase 1 is far enough along to justify returning to it.

## 9. pgTAP — first real suite live (staging only)

`pgtap` extension enabled on staging; `tests.run_rls_foundation_tests()`
(migration `p1_add_pgtap_rls_foundation_suite`, corrected by
`p1_fix_pgtap_backups_policy_assertion` + `p1_restore_backup_rpc_checks_in_pgtap_suite`)
runs 13 assertions — table existence, RLS-enabled, exact policy count,
manager-scoping, and SECURITY DEFINER status — for `audit_events` and
`backups`. Deliberately schema/policy-shape assertions only, not simulated
authenticated requests (that needs `request.jwt.claims` impersonation of a
real user, out of scope for this first pass). Run it with:

```sql
select * from tests.run_rls_foundation_tests();
```

All 13 currently pass. This immediately proved its worth: the first draft
wrongly assumed `backups` had zero RLS policies (by analogy with
`audit_events`, never checked directly) — the suite caught it as a failing
test before it reached this document as a wrong claim left uncorrected. Not
applied to production (matches the standing rule: staging is where schema
changes are made and tested; production stays read-only for this rebuild).

**Real finding along the way:** staging's `profiles` table currently has
**zero manager-role rows** — all 4 real profiles (`elizabeth`, `emmanuel`,
`elias`, `webnexttestuser`) are `role='agent'`. `profiles.id` has a hard FK
to `auth.users`, so a synthetic unlinked profile row for pgTAP impersonation
is impossible without creating a real Supabase Auth user — tried first,
confirmed impossible, not worked around by creating one (out of scope for
this rebuild, matches the standing account-creation boundary).

**Closed 2026-09-03, without creating any account:** `tests.run_rls_authenticated_tests()`
reuses the one real, dedicated live-mode test account (`webnexttestuser`,
real `auth.users` row) and toggles its `role` transiently for the duration
of the test (always restored afterward, including on a failed assertion,
via `exception when others`) to actually simulate both a manager and an
agent request via `set_config('request.jwt.claim.sub', ...)`. 4/4 passing:
proves audit_events/backups RLS genuinely filters to zero rows for an
agent and genuinely returns rows for a manager — the behavioral proof
`run_rls_foundation_tests()`'s policy-shape assertions can't provide on
their own. Live-mode manager sign-in through the real login screen is a
separate, still-open gap — this only proves the RLS itself is correct.

## 10. Pipeline deletion mismatch — FIXED (flagged critical in the master spec)

The master spec's Section 1 named this a critical, fix-before-feature-work
item: legacy soft-deletes a lead via `deleted_at` (`apiDeleteLead()`,
index.html:4622-4629, with a real, well-reasoned comment: a hard DELETE
would cascade and destroy `allocation_requests`/`target_selections`/
`payment_reminders_log`/`client_notifications` history via real `ON DELETE
CASCADE`, and orphan `payments` via `ON DELETE SET NULL`) — confirmed live
on production, all four cascade rules real. `web-next`'s `leads.remove()`
was doing a genuine hard `DELETE`, meaning every lead deletion in live mode
would have silently destroyed that linked history.

**Fixed 2026-09-03:** ported `leads.deleted_at` to staging (it didn't
exist there either); updated `leads_sel`/`leads_client_sel` to filter
`deleted_at IS NULL`, matching production exactly; `leads.remove()` (live)
now does `UPDATE ... SET deleted_at = now()`; demo mode's `remove()` sets
`deletedAt` instead of splicing the array, and `listForAgent`/`listAll`/
`get`/`listCompany` all now exclude soft-deleted rows (matching what real
RLS does automatically in live mode). `tests.run_leads_soft_delete_tests()`
(4/4) proves the row and its linked `allocation_requests` row both survive
a soft-delete intact — the actual property that matters, not just that the
column got set. Verified live in demo mode end to end (deleted a real
seeded lead via Pipeline Detail's danger zone, confirmed it vanished from
the list, confirmed via `localStorage` inspection that the record survives
with `deletedAt` set rather than being removed).

**Bonus, found and fixed along the way:** `leads_upd` had no explicit
`WITH CHECK` (implicit fallback to its `USING` clause) — given the master
spec's own separate finding ("RLS needs explicit tests... Supabase
recommends... explicit UPDATE USING + WITH CHECK"), added one explicitly
(identical to `USING`, so no behavior change, just no longer implicit).

**Real bug found and fixed as a direct consequence of finally exercising
this path live:** `useLead`'s query function could resolve to `undefined`
(a lead that's been soft-deleted, or any not-found case) — React Query
disallows this ("Query data cannot be undefined"). `PipelineDetailScreen`
already had a `!lead` guard, but the console error fired regardless. Fixed
by coercing to `null` in both `useLead` branches (`web-next/src/features/
pipeline/hooks/useLead.ts`). This exact bug was equally reachable under the
*old* hard-DELETE behavior — it had just never been exercised by an actual
delete-then-refetch before now.

**Unrelated, unresolved curiosity, documented rather than silently
dropped:** during testing, a plain `UPDATE leads SET deleted_at = ...`
issued from *inside* a plpgsql function (under `authenticated`+JWT
impersonation) consistently failed with a spurious RLS violation on
staging, while the identical statement as a top-level query — and updates
to every other column, and the identical pattern on every other table —
worked every time. Ruled out: triggers, multi-policy OR-combination,
implicit-vs-explicit `WITH CHECK`, table ownership/FORCE RLS, table- and
column-level grants, check constraints, `now()` vs a literal value, and
same-transaction-as-insert timing. `tests.run_leads_soft_delete_tests()`
works around it (the row's `deleted_at` is set in an unrestricted context,
sidestepping the anomaly, since the property actually being tested — the
`leads_sel` filter — doesn't depend on how the update happened). The real
application code path (a genuine top-level authenticated request via the
Supabase client, not nested plpgsql) is unaffected and independently
verified working, both via direct SQL and live in the browser. Worth a
fresh-session recheck if it resurfaces elsewhere.

## 11. Site-visit day logic — FIXED (flagged critical in the master spec)

Both `web-next` and legacy's own `SVE_ALLOWED_DAYS` restricted bookable
site-visit days to Tue/Wed/Fri/Sun (`[2,3,5,0]`) — the master spec's
Section 1 named this outdated: the real, current business schedule is
every day of the week, Monday–Saturday 9:00am and Sunday 12:00pm.
`web-next`'s only real enforcement point was `ALLOWED_DAYS` in
`siteVisitAuthLogic.ts` (feeding Site Visit Authorization's day-chip
picker) — updated to all 7 days. The per-day time distinction (9am vs
Sunday's 12pm) isn't modeled or enforced anywhere in this app (no existing
UI shows a specific visit time — `AddSiteVisitScreen`'s "Visit time" field
is free text) and stays out of scope here; this fix corrects which days
are bookable, not what time on those days.

**Real bug found and fixed along the way, in legacy too:** `weekFridayIso`
(and the week-visits query built on it, `useWeekSiteVisits` /
`apiLoadSiteVisitsForWeek`) cut the week off at Friday — meaning a real
Sunday site visit's costs could never be reconciled in this form even
under the *old* schedule (Sunday was already an allowed day). Since
Saturday is now also bookable, this bug would have hidden two real days'
worth of visits instead of one. Renamed to `weekEndIso` (Monday+6, the
real Sunday) and both the query and `weekRangeLabel`'s displayed range
extended to match. Not ported to legacy (out of scope — `index.html` is
frozen for this rebuild), but worth flagging to whoever eventually touches
that code path.

Verified live in demo mode: all 7 day-chips render; a real seeded Monday
visit (previously invisible — Monday was never a valid day under the old
schedule) now shows correctly; Saturday and Sunday both load their (empty)
cost-reconciliation form without error; `npm run build`/`tsc` clean.

## 12. Leave non-overlap rule — FIXED (flagged critical in the master spec)

`leaveConflictDatesFromOthers` used to also block the working day
immediately before/after a colleague's leave dates, so nobody could pick a
day adjacent to theirs either (`web-next/src/features/leave/lib/
leaveLogic.ts`, ported faithfully from `index.html`'s own calendar engine
at the time). The master spec's Section 1 named the real, requested rule:
non-overlap only — if one person returns Tuesday, another may start
Wednesday. Fixed by removing the `nextWorkingDayIso`/`prevWorkingDayIso`
additions entirely; the conflict set is now just each colleague's raw
`dates`. Those two now-unused helpers were removed from `shared/lib/
ghanaHolidays.ts` rather than left dead. Not ported to legacy (frozen for
this rebuild) — worth flagging to whoever eventually touches that code
path.

Verified by direct code review (the fix is a two-line removal, easy to
confirm by reading) plus `tsc`/`npm run build` clean and the Leave screen
smoke-tested live with zero new console errors — a convenient future-dated
two-colleague adjacency scenario doesn't exist in the current demo seed
data (the only seeded cross-staff leave conflict is in the past), so the
exact boundary case wasn't independently reproduced live this pass.

## 13. Pipeline Excel import — BUILT (flagged critical in the master spec, "creates duplicates instead of reconciling")

`web-next` had no import path at all yet (`pipelineTemplateExcel.ts`'s own
comment used to say so explicitly) — the real risk wasn't a live defect in
today's code, it was that building an import feature the naive way (fetch
once, always insert) would reintroduce the exact bug legacy's own
`importPipelineExcel` already fixed on its side. Confirmed both legacy's
import and `restore_backup` already reconcile/clear-before-reinsert
correctly — the gap was purely "doesn't exist yet in `web-next`."

Faithful port of `resolveImportColumns`/`scanImportFile`/
`importPipelineExcel` (index.html:20196-20450) — `pipelineImportLogic.ts`
(pure column-resolution + name+contact→Lead ID→name-only reconciliation,
always against a fresh fetch), `usePipelineImport.ts` (scan/commit
mutations), `PipelineImportCard.tsx` (inline card in Reports, manager-only/
company-wide, next to the existing Master Pipeline export). Ported
`import_batches` to staging for the audit trail; added `LeadUpdate.priority`
(existing `Lead` field, no write path before now); exported `pricingFor`/
`interestFor` from `quotationLogic.ts` for reuse; fixed
`pipelineTemplateExcel.ts`'s export to read real `priority`/`siteVisit`
values now that they round-trip.

**Two real bugs caught before/via live testing, not just code review:**
(1) `payments.create({status:'approved'})` independently re-reads and bumps
the lead's `amt_paid`/`stage` itself — had to run BEFORE the authoritative
per-row patch, not after, or the file's explicit stage would be silently
overwritten by auto-derivation. (2) `computeLeadQuotationTotals(config,
lead)` treats ANY non-null `lead.grandTotal` (0 included — the field isn't
nullable) as an already-decided override and returns it unchanged instead
of recomputing; the first live test produced `grandTotal: 0` on every
imported row. Fixed by computing net/grand directly rather than routing
through that function.

Verified live in demo mode end-to-end: exported the real Master Pipeline
workbook via the app's own download, edited it with a real ExcelJS edit
(bumped an existing lead's discount+stage, added one brand-new row), fed it
through the actual file input. Scan: 1 new/9 existing/0 skipped. Commit: 1
added/1 updated/8 unchanged, correct fresh net/grand totals, zero
duplicates. Re-uploading the exact same exported file a second time — the
specific property this fix is about — came back 0 added/0 updated/10
unchanged, lead count and every name's row count unchanged. `tsc`/build/
lint all clean.

**Correction, same day:** this entire design was wrong — it loaded and
populated `public/pipeline-template.xlsx` (the real uploaded reference
workbook), exactly what the master spec's Section 5 explicitly forbids:
*"Do not use the supplied reference workbook as the live interchange
schema... its formulas, dashboards, manual conventions and inconsistent
fields are not a safe synchronization protocol."* Caught by the user, not
by re-reading the spec first — a real process failure worth naming
plainly rather than glossing over. Rebuilt from scratch per spec 5.1/5.2:
`pipelineCanonicalWorkbook.ts` generates the whole workbook in code (no
file loaded) with the four named sheets (LEADS the only two-way one,
PAYMENTS/ALLOCATIONS reference-only, INSTRUCTIONS) plus a hidden
`_METADATA` sheet (export ID, exported_at/by, schema version, checksum);
`pipelineImportLogic.ts`'s matching order flipped to Lead-ID-first per
spec (previously name+contact-first with ID as fallback — backwards);
added a genuine Needs Review bucket for ambiguous/unresolvable rows,
duplicate-Lead-ID-in-file blocking, possibly-deleted detection with an
explicit opt-in archive (never automatic), and field-level batch audit.
Payments confirmed fully locked with the user directly (no
correction/reversal path at all, overriding the spec's own suggestion of
one) — verified live by deliberately sneaking an Amount Paid edit through
an otherwise-valid row and confirming it was silently ignored. Two more
real bugs caught live during this rebuild: `'company'` (Company Leads'
real, non-staff `agent_key`) isn't returned by `staff.listAll()`, so
every untouched Company Leads row was wrongly flagged Invalid on
re-upload until added explicitly; and the row reader's original
stop-after-5-blank-rows heuristic silently dropped any new row placed
in the ~50-row range the dropdowns are deliberately extended into for
exactly that purpose. Full re-verification (one file covering every
path: normal update, payment-lock bypass attempt, Staff Key reassignment
via `leads.assign()`, an invalid row, a duplicate ID, a deleted-then-
archived row, a brand-new insert) matched expectations exactly; a second
re-export/re-import round-trip came back fully idempotent (0 new/0
updated). Deleted `pipeline-template.xlsx` and `pipelineTemplateExcel.ts`
— nothing loads a template file anywhere in this app any more.

## 14. Scheduled-job observability — MOSTLY DONE (flagged critical in the master spec)

Spec Section 1's "Scheduled job gap" + Section 3.5's System Health
checklist ("scheduled jobs", "last successful report", "retry counts,
last error"). Before building anything, checked real deployed state
first (the lesson from §13's correction) rather than assuming from this
doc's own stale account: production already has real, substantial
monitoring for 3 of 4 non-backup jobs — `daily-reminders`,
`daily-management-report`, and `scheduled-integrity-check` all already
log `category='cron'` audit events on crash, and `daily-management-report`
additionally writes a full `report_archive` row (date, generation/email
status, checksum, error_detail, retry_count) on every run. `web-next`
just never read any of it.

Ported `report_archive` to staging. Added `DataSource.reportArchive
.list()` (manager-only SELECT RLS, service-role-only write, same shape
as `audit_events`/`backups`). `useSystemHealth.ts` now also reads the
existing `cron` audit category and computes health per job by matching
known job slugs against recent critical `cron.failed` summaries (no live
`pg_cron.job` read — that schema isn't PostgREST-exposed; cadences are
hand-maintained constants, same treatment `backupOverdue` already gives
its own cadence). `SystemHealthScreen` gained a Scheduled Jobs list
(per-job Healthy/Failing + real failure text) and a Last Report row.

**Still open:** `send-todo-alarms` (the per-minute to-do-push job) is the
one real job with zero crash observability — the fix (add the same
`category='cron'` logging the other 3 already use) is written but held
for a separate turn; this pass's production-deploy question was
specifically declined for now, so staging/web-next work went ahead
without it. No "retry" or "dead-letter" automation was built — these are
simple re-runnable trigger-and-done jobs, not a queue-consumer with
discrete messages to requeue, so a literal dead-letter queue would be
the wrong shape; a manual "run now" action from System Health is the
practical equivalent and hasn't been built yet either.

**Real bug caught live, unrelated to the task itself:** `data/demo/
seed.ts` hardcoded a stale `version: 40` literal, completely
disconnected from `data/demo/store.ts`'s `DEMO_VERSION` (long since
bumped to 44) — the reseed guard could never match, so every demo-mode
page reload silently wiped and reseeded all demo data. Fixed by having
`demoLoad()` stamp the real version onto a freshly seeded object itself.
Verified by injecting a fake failure scenario and confirming it survived
a real reload (proving the fix, not just the absence of the old symptom).

## 15. Error contract — DONE (Master Rebuild Spec Section 3.4)

"No raw Postgres/Supabase error may be shown to staff. Translate known
errors into plain English." Untouched in `web-next` until now (legacy
`index.html` got its own equivalent sweep earlier this session).

`shared/lib/friendlyError.ts` — same real-error categories as legacy's
`friendlyErr()` (RLS violation, unique/foreign-key/not-null constraint,
expired session, network failure, timeout), adapted for Supabase-js's
actual `PostgrestError` shape (`.code`, not just a bare string). Swept
every `e instanceof Error ? e.message : 'fallback'` catch-block pattern
found across the app — 9 screens, 15 call sites (`AllocationRequestsScreen`,
`BannerTrackingScreen`, `ExpensesScreen`, `PipelineImportCard`,
`usePipelineImport.ts`, `PipelineDetailScreen`, `PlotInventoryScreen`,
`SveFeedbackScreen`, `ReferralsScreen`, `SiteVisitAuthScreen`) — plus the
one remaining `mutation.error instanceof Error ? ... : ...` render
pattern, to go through it instead.

**Real regression caught and fixed, same class as legacy's own sweep hit
first:** several call sites in the pipeline-import flow already throw
hand-written, already-clean messages (e.g. "This file was exported from
an older/newer version of the workbook... please re-export a fresh
copy."). An outer `friendlyError()` call doesn't recognize hand-written
text as a known raw-error shape, so without a fix it would silently
replace those messages with the generic fallback — a real loss of
useful, specific text. Added `friendlyErrorObj()` (marks an `Error` as
pre-approved for display) and converted `usePipelineImport.ts`'s 5 real
`throw new Error(...)` sites to it, matching legacy's `throwFriendly()`
fix exactly.

Checked, not assumed, that the hooks feeding the 9 fixed screens don't
carry the same regression risk — confirmed clean for all of them; the
one hand-crafted throw found nearby (`useReceipt.ts`'s "Config not
loaded yet") doesn't flow through any of the new `friendlyError()` calls
at all (that call site has no try/catch yet at all — a separate,
pre-existing gap, left alone rather than expanding scope).

Verified live: `friendlyError()` unit-checked directly for every
category plus the friendly-marker passthrough; then a real UI trigger
(uploaded an `.xlsx` with no LEADS sheet to Reports' pipeline import)
confirmed the exact hand-written message renders unmangled end-to-end,
not just in isolation. `tsc`/build/lint all clean.

## Next actions (in order)

1. ~~Port `audit_events` + `record_audit_event` to staging~~ — done (migration `p0_port_audit_events_to_staging`).
2. ~~Wire `web-next`'s `DataSource` to `audit_events`/`backups` and build the System Health + Audit Log + Backup & Restore screens~~ — done, verified live in demo mode.
3. ~~First pgTAP suite~~ — done (§9): `run_rls_foundation_tests()` (13/13, schema/policy shape) + `run_rls_authenticated_tests()` (4/4, real manager-vs-agent RLS behavior via the existing `webnexttestuser` test account).
4. ~~Permission-record model~~ — done (§4), staging only, additive: `permissions`/`role_permissions`/`staff_permission_overrides` + `has_permission()`, proven to agree with every real hardcoded grant (`run_permission_model_parity_tests()`, 8/8).
5. ~~All four RLS cutovers~~ — done (§4): `payments.manage`, `contracts.generate`, `allocations.manage`, `ops.view_all` — every real hardcoded staff-key array this session found is gone from RLS policy text.
6. ~~`role_permissions` wired in + management RPCs~~ — done (§4): `set_permission_override`/`clear_permission_override`, 39/39 pgTAP assertions across 7 suites.
7. ~~Permissions admin screen~~ — done: `/app/mgr/health/permissions`, a grant/revoke matrix over the real permission catalog, calling `set_permission_override`/`clear_permission_override` in live mode. Verified live in demo mode (matrix matches the real 7 seeded grants exactly; a grant→revoke round-trip updates immediately; zero console errors).
8. ~~Pipeline deletion mismatch~~ — done (§10): `leads.remove()` is a real soft delete in both demo and live mode now, matching legacy and preventing real FK-cascade data loss. 43/43 pgTAP assertions across 8 suites.
9. ~~Site-visit day logic~~ — done (§11): all 7 days bookable, week-range query bug (Friday cutoff hiding weekend visits) fixed alongside it.
10. ~~Leave non-overlap rule~~ — done (§12): adjacent-day blocking removed, pure overlap only.
11. ~~Excel import creates duplicates instead of reconciling~~ — done (§13): built the import feature `web-next` never had, ported legacy's already-correct reconciliation logic rather than reintroducing the bug naively.
12. ~~Scheduled-job observability~~ — mostly done (§14): Scheduled Jobs panel + last-report row built and wired to real data. `send-todo-alarms`'s crash-logging fix is written but not yet deployed to production (held pending a separate approved turn).
13. ~~Error-contract standardization~~ — done (§15): `friendlyError()` swept across every raw-error-display site found (9 screens, 15 call sites, plus one mutation-render pattern); a real regression (hand-written messages getting mangled by the new sweep) caught and fixed the same way legacy's own sweep fixed it.
14. Next: a manual "run now" action for a failing scheduled job, idempotent-RPC review (spec 3.1's "all destructive/financial/permission changes are idempotent" — not yet audited in `web-next`), planning the actual production cutover of the permission model (staging-only today, by design), live-mode manager sign-in (needs a real manager `auth.users` account — account creation, out of scope here), and deploying the `send-todo-alarms` observability fix to production whenever approved.

**Standing rule, stated explicitly by the user 2026-09-04:** nothing on `rebuild` merges into `main`/production until asked, separate from and narrower than the general "continue with V2" autonomy grant — applies to the `send-todo-alarms` deploy above too.

## 16. Phase 9 (PWA parity) + Phase 7 (SMS) — both fully shipped 2026-09-04

Closes both remaining Blueprint phases short of the cutover gate (Phase 12).

**Phase 9 — Public surfaces & PWA parity (5/5):**
- Service worker (`public/sw.js`) — app-shell cache-first for static same-origin assets only; every Supabase/API call passes straight through, deliberately never cached (caching stale business data would violate the same error-contract principle Section 15 fixed).
- Push notifications — ported legacy's real, working Web Push flow (`shared/lib/webPush.ts`: real VAPID key, `subscribeWebPush()`) plus a new `DataSource.pushSubscriptions.save()` writing to the real `push_subscriptions` table (RLS already live on staging, no migration needed). The send side (`send-push`/`send-todo-alarms` Edge Functions) already worked in production — this closes the missing receive half.
- Offline mutation queue — TanStack Query v5's default `networkMode` already pauses/resumes mutations while offline; added `@tanstack/react-query-persist-client` so that survives a reload too, plus a visible offline/syncing banner (`OfflineBanner.tsx`).
- Public stats widget — reused the real `public-stats` Edge Function (live on production since 2026-08-29 for the external homepage widget), ported to staging along with the `profiles.widget_token` column it needs, and added `/stats` (company-wide) + `/stats/:token` (personalized) public routes.

**Phase 7 — SMS, the last item (6/6 now):** added `DataSource.sms.send()` (real Arkesel `send-sms` proxy + `sms_log`, both already live) and wired it into payment thank-you, leave decided, complaint submitted, site visit requested, and SVE invite send — matching `index.html`'s own `apiSendSms` call sites. Caught a real bug on the way in: the SVE "Send invite" button only ever wrote the invite row and stamped it sent — nothing ever actually sent the client a link until this pass.

Verified live in demo mode across every flow above (zero console errors); `tsc`/build/lint all clean.

## 17. `leaderboard_rows()` date-range bug — partially fixed 2026-09-04 (staging only)

Verified live (Open Decision #06 from the Blueprint): the RPC's `p_from`/`p_to` params only ever scoped `deals_closed_year` — every other column (`site_visits`, `tasks_completed`/`avg_task_days`, `todos_completed`, `days_attended`/`on_time_days`) silently used a fixed trailing-90-day window regardless of the year selected, so the Leaderboard's year picker never actually changed most of the ranking inputs.

**Fixed** (migration `p1_fix_leaderboard_rows_date_scoping`, staging only): every one of those CTEs now scopes by the real column already on its own table (`site_visits.visit_date`, `schedule_items.completed_at`/`item_date`, `attendance_log.work_date`). Verified directly against the RPC: 2026 range returns real non-zero `site_visits`; an empty year (2020) correctly returns 0 across the board — previously both would have shown identical all-time counts.

**Deliberately NOT fixed — `total_collected`:** while investigating, found `sum(payments.amount where status='approved')` per agent diverges substantially from `sum(leads.amt_paid)` per agent (the column this metric actually uses) — not a rounding difference, roughly double for some agents on this project. Bundling an unverified swap of this column's data source into the same fix would risk trading one wrong number for a different wrong one on a metric that's commission-adjacent. Left exactly as it was (still unscoped by date, still `leads.amt_paid`) pending a real investigation into why those two ever diverge — flagged to the user directly rather than silently deciding either way.

**Ported to production 2026-09-04**, with the user's explicit go-ahead: same migration, live on both projects now, verified directly against production too (2026 range returns real non-zero `site_visits`; 2020 correctly returns 0 across every staff member).

**`total_collected` investigated further, still deliberately untouched — and the earlier "reasonable default" withdrawn.** Traced the `sum(payments.amount) ≠ sum(leads.amt_paid)` divergence down to specific leads on **production** (not a staging-only artifact): `adams` has 4 leads where `payments` holds exactly **two** approved rows of the identical amount for the same lead while `leads.amt_paid` only reflects one of them (Mr. Callistus: `amt_paid` 35,286.68 vs. two payments summing to 70,573.36 — the same 2x pattern on all 4); `elias` has one lead with a real orphaned/unlinked payment and one payment recorded at 51,499.99 against a lead whose `amt_paid` is only 11,499.99. This is a real, pre-existing payment-ledger inconsistency on production, not a scoping or rounding difference — switching `total_collected` to a payments-table sum would double-count the duplicates and make the commission-adjacent Leaderboard figure actively worse for at least two agents. Left exactly as-is (`leads.amt_paid`, unscoped). Needs the business owner to look at these specific leads/payments and decide which number is real before anything here changes — a job for a human, not a default.

## 18. Task Board — new feature, Master Spec Section 10.1 (2026-09-04)

Neither `index.html` nor `web-next` had anything beyond My Day's same-day todo checklist. Built the Task Board view specifically (one of six named views in 10.1 — Week/Month Calendar, Team Schedule, Timeline not built) on top of real, previously-unused `schedule_items` columns (`kind='task'`, `category`, `priority`, `assigned_to`/`assigned_by`, `due_date`). To Do/In Progress/Done/Cancelled columns, task creation, status changes, and manager reassignment (attributed). Deliberately not built: dependencies (Blocked by/Blocking — no schema for it today), recurrence UI, meetings. See `TaskBoardScreen.tsx`'s own header comment for the exact scope line.

**Correction, same day:** `index.html` was found to already have a real, richer task system on the same `schedule_items` table (`apiInsertTask`/`apiUpdateTaskStatus`/`mapTask`) plus its own `task_events` audit table (assigned/started/blocked/unblocked/awaiting_approval/approved/done/cancelled/reopened) and SMS+push notification on assignment — an initial grep for the literal string "Task Board" missed all of it since legacy never calls it that internally. **Constraint check, corrected:** initially reported this as a live production bug (`status='blocked'`/`'awaiting_approval'` violating `schedule_items_status_check`) based on a test run against **staging only** — that was a real mistake, not a verified production finding. Re-checked both projects directly: **production's constraint already includes `blocked`/`awaiting_approval`** (fine, no bug there); **staging's did not** (the actual gap — staging lagging production's real schema, the same recurring pattern this whole document tracks). Fixed by widening staging's constraint to match production exactly (migration `p1_widen_schedule_items_status_check`). No production change was needed or made for this one.

**Process note, same day:** discovered mid-session that `npx tsc --noEmit -p .` (used for "quick" typechecks throughout most of this session) silently checks almost nothing — the root `tsconfig.json` here is a bare project-reference shell (`"files": []`), and `-p .` without `-b` doesn't actually build the referenced projects. Every commit was still genuinely typechecked because `npm run build` (which correctly runs `tsc -b && vite build`) was also run before each one and would have caught a real error — but the standalone quick-check was giving false confidence for nothing. Going forward: use `npx tsc -b` (or just `npm run build`) for any typecheck in this repo, never the bare `-p .` form.

## 19. Attendance — real time-clock (geofence + cutoff + photo), Master Spec Section 11 (2026-09-04)

An earlier pass's own comment claimed "no shift-start-time or office-geofence-radius config exists anywhere in the schema" — wrong, confirmed live: `app_config.office_lat`/`office_lng`/`office_radius_meters`/`attendance_cutoff_time` all exist with real values (5.602694/-0.064479/297m/09:00), just never mapped into `Config`. Fixed: mapped them, and `AttendanceScreen` now computes late/off-site for real (`haversineMeters`, ported from `index.html`) and requires a reason when either is true, rather than leaving both as an optional self-report checkbox. Sign-in also now requires a real photo (device camera → resized JPEG, ported from `index.html`'s `captureSelfie()`/`resizeImageToB64`), written to the `sign_in_photo` column that existed but nothing wrote to before. Verified live: full sign-in (photo required, blocked submit until provided) → sign-out cycle, gauge and history both reflect the real write, zero console errors.

Not ported from Section 11: the 10am/7pm scheduled attendance report (SMS link + PDF) — a separate, server-side Edge Function feature, not part of this screen.

## 20. Allocation + Inventory — physical dimensions, suggestion engine, real 415-plot inventory (2026-09-04)

Master Spec Section 7. Real correction made mid-task: the plan going in assumed the 415-row Royal Palm workbook appendix (`tech_appendix.txt`) needed *importing*. Checked first — it doesn't. **The real `plots` table already holds all 415 rows live in production** (144 real allocations, real client names, block-lettered plot numbers like `A1`/`H2 A`/`C13 1/2` already matching the appendix's own numbering) — staging had 412 of the same rows (3 short, in section A). The appendix is the *original source document* that table was built from, not a separate pending dataset. Nothing was imported; everything below is enrichment of rows that already existed.

**Schema added** (staging): `plots.section`, `plots.width_ft`, `plots.length_ft`, `plots.area_sqft` (real generated column, `width_ft * length_ft`). Wired through `Plot`/`NewPlot`/`PlotUpdate`, the mapper, both `DataSource` implementations, and Plot Inventory's add/edit forms + row display (all four fields editable, matching the user's explicit "make sure they're changeable").

**Suggestion engine built** (`features/allocations/lib/suggestionEngine.ts`, Master Spec 7.4): searches `Available` inventory, prefers an exact match against the configured standard dimensions (`Config.techFullPlotLengthFt`/`WidthFt`/`techHalfPlot...` — the same reference Technical Quotation already uses), ranks a plot with real dimension data above one without, returns one complete set per multi-unit request rather than unrelated alternatives (7.4.6). Wired into Allocations' Suggest panel as an "Auto-suggest from inventory" button. Verified live against a real pending request: 3 ranked candidates, the one irregular-size plot correctly flagged "verify against the site plan."

**Dimension data filled in** (staging, all 412 real rows, per the user's explicit go-ahead to fill in both matching and non-matching plots): the appendix text extraction turned out to be a garbled PDF-table dump (merged Excel cells splitting across misaligned rows) — too unreliable to auto-parse per-plot without real risk of writing wrong data into live inventory (the master spec's own words: "not permission to silently modify the source data"). Instead of a full unreliable parse, verified directly what the extraction *could* say reliably: `width_ft`/`length_ft` = 70/100 is the real standard for the overwhelming majority (400+ of 415 rows checked), and grepped the whole file for the four irregular values the spec's own prose names (35/55/15/90) to find the exact, real exceptions — five specific plots, confirmed present in the live table under the exact same plot numbers: `C13 1/2` (55x100), `C13 2/2` (15x100 — together with C13 1/2 these sum to a standard 70ft-wide plot split unevenly), `C15` (90x100), `H2 A`/`H2 B` (35x100 each, an even split). Applied 70x100 to every plot that had no dimensions yet, then the five confirmed exceptions on top, then backfilled `section` from each plot number's own leading block letter. All values editable afterward via Plot Inventory's edit form — nothing here is permanent or unverifiable if it turns out wrong for a specific plot.

**Real, useful side effect**: block counts on the live table (A:40 on staging / 43 on production, J:29, L:29, O:7...) already diverge from *both* the original workbook counts *and* the site-plan legend counts quoted in the spec — the business has clearly added/split plots since that workbook was compiled. The Section 7.1 discrepancy table in the spec is therefore itself stale; a real Plot Data Reconciliation screen (spec's own ask, §8) would need to reconcile against the table's *current* live counts, not the workbook's — not yet built this pass.

**Not done this pass**: syncing staging's 412 rows to match production's 415 exactly (3 real rows missing, all in section A); the Plot Data Reconciliation screen itself; applying any of this to **production** (schema + dimension backfill both staging-only — a production write needs its own separate go-ahead, not yet asked).

## 21. Live-mode UI depth, closed out (2026-09-04): staff picker, PIN, password reset, real signup security fix

Ported the remaining real `index.html` sign-in features, one session:

- **Staff-picker-before-password** (`data/staffDirectoryClient.ts`) — searches the public `staff_directory` view (name/email/role only, no session needed) rather than typing an email. Verified live: real roster loads, search filters, selection flow works.
- **PIN quick-unlock** (`shared/lib/pinLock.ts`, `auth/usePinLogin.ts`) — AES-GCM key derived via PBKDF2 (150k iterations), the current session's tokens encrypted and stored device-local, toggled from More > Account. Direct port of `index.html`'s own crypto; the save-then-unlock round trip wasn't click-tested live (no real Auth credentials available in this environment) — verified by code review and a clean build instead.
- **In-app password reset** (`auth/usePasswordReset.ts`) — email → 6-digit code → new password, no redirect link (`resetPasswordForEmail`/`verifyOtp`/`updateUser`). Verified live short of actually sending a real email to a real person's inbox.

**Real security gap found and fixed** while scoping the last item (manager new-staff-invite flow): `handle_new_auth_user()` created a real `agent` profile for *any* email that called `supabase.auth.signUp()` — `allowed_emails` existed but was never actually checked, on either project. Also found `allowed_emails` had RLS enabled with **zero policies**, so Management's own invite-list screen would have been silently denied every row too. Fixed on staging (migration `p1_gate_signup_by_allowed_emails`): real manager-only RLS added, and the trigger now rejects (rolls back the whole `auth.users` insert) any sign-up whose email isn't invited, consuming the invite on success — the invite is a real one-time-use record now, unlike `index.html`'s version which never expires.

Built on top of the fix: a full Team-screen invite list (add/revoke, manager-only) and a public "join the portal" self-service signup (`auth/useJoinPortal.ts`), reached from the login screen's staff picker.

**Verified live end-to-end through the real Supabase Auth signup flow** (not simulated): an uninvited test email was cleanly rejected with a real, friendly error and left zero orphan rows in either `auth.users` or `profiles`; a real invited test email successfully created a profile and consumed its invite row. Both test accounts were deleted after verification — staging carries no leftover test data from this.

**Not done**: porting the trigger/RLS fix to **production**, which currently still runs the old, unrestricted-signup behavior — needs its own explicit go-ahead given how security-sensitive this change is (user declined for now, 2026-09-04 — staging-only stands). Manager new-staff-invite flow is otherwise fully closed; live-mode UI depth as a whole has nothing left open that blocks Phase 12.

## 22. AI layer — third real `kind`, and a confirmed live blocker (2026-09-04)

Added `manager_daily_briefing` to the shared `ai-insights` Edge Function (Groq) — a real 2-3 sentence company-wide summary on Manager Home, fed by the same KPIs already computed for the dashboard (leads, pipeline value, outstanding, complaints, collected trend, top agent). Same fail-silent client pattern as the two existing kinds (streak coaching, colleague availability).

**Confirmed directly against the deployed function (curl, real payload)**: all three `kind` branches are correctly implemented, but **`GROQ_API_KEY` is not actually set on staging** — every one of them currently returns `"AI insights are not configured on the server yet"`. This isn't new; it's the same gap the Blueprint's open-decision #01 already named ("Groq is live and working, but only once the user's own key is pasted into the Edge Function's secret") — this pass just confirmed it's still unset and affects all three kinds, not only the new one. Nothing to fix code-side; needs the user to paste a real Groq key into the `ai-insights` function's secrets (staging first) before any of the three AI lines will actually show up in the app.

## 23. AI layer goes live, then expands to 8 real `kind`s across 6 apps (2026-09-05/06)

**Key confirmed live.** The user supplied a real Groq API key; after two real deploy bugs found and fixed (`llama-3.3-70b-versatile` retired from the account — swapped to `openai/gpt-oss-120b`, confirmed via `/v1/models`; the gpt-oss family is a reasoning model that silently burns its whole `max_tokens` budget on an invisible `reasoning` field and returns empty `content` unless `reasoning_effort:"low"` is set — confirmed live via raw Groq call showing 198/200 tokens spent on reasoning), all three existing kinds were verified genuinely working end-to-end in the running app for the first time.

**User feedback, direct**: "ive been looking at your demo and so far i can say am not impressed" — three narrow insight lines fell far short of the ask ("AI powers every single app," a real per-person companion, an AI-powered greeting screen, 300+ feature ideas). Response, same session:

- **Ideation deliverable**: published [The Intelligence Layer](https://claude.ai/code/artifact/e749a73e-7178-44a7-8834-5e60420ae598) — 328 concrete, non-generic AI ideas mapped across all 18 apps in the system, each grounded in a real screen/table, organized against Section 22's own safe-use list and do-not-delegate guardrails (never payment approval, plot allocation, permissions, attendance classification, leave conflicts, or a financial total).
- **Five new real `kind`s shipped and verified live the same session** (bringing the total to 8):
  - `login_greeting` — the sign-in screen's welcome line is now AI-authored (day-of-week/time-of-day aware), replacing static text. No session exists yet at this screen, so context is deliberately non-personal (no name, no company data).
  - `companion_qa` — a real per-agent "ask your companion" panel on Home, three fixed questions (`next_action`/`month_progress`/`pipeline_health`, never free text) answered from that agent's own real Smart Insights counts, collected trend, and forecast. Verified live as the demo agent: all three answers correctly cited his real 144k pipeline, 24k→60k collected trend, and 88k forecast.
  - `follow_up_draft` — Pipeline's Follow-up section gets an "AI: Draft a follow-up message" button, grounded in a lead's real stage/days-since-contact/pct-paid/notes. Two real privacy backstops beyond never sending the client's name: a new `redactPII()` helper (`shared/lib/redact.ts`) strips phone-number- and email-shaped runs out of notes before they leave the client, and the model writes around a `{ClientName}` placeholder filled in client-side afterward.
  - `data_check_summary` — Data Check narrates its scan as plain English instead of raw rows, from aggregate issue-category counts only (never a `leadName`).
  - `memo_draft` — Compose Memo gets a "Quick brief → Expand" flow that fills the existing editable Message field, directly Section 22's "generate draft company news/memo text for human approval"; the human-review requirement is structural here, not just a prompt instruction, since Compose Memo has no auto-send path.

**Privacy discipline held across all five**: every new kind was checked against Section 22 before being written — aggregate counts and the *staff* member's own name travel to the model; a client's name, phone, or payment detail never does (with `redactPII()` as a technical backstop on the two kinds that touch real free-text notes).

**Not done this pass**: the other ~320 ideas in the published roadmap are exactly that — a roadmap, not a backlog that's been worked through. No payment-approval-queue screen exists yet in `web-next` to hang a Payments AI kind off of (a real gap independent of AI). System Health doesn't yet show AI-provider status (Blueprint-tracked, spec line 217, still open).

## 24. AI layer keeps expanding: 12 real kinds across 9 apps (2026-09-06, same push)

Continued straight through from #23 without stopping, per the user's explicit "continue" — four more real kinds, each verified live in the browser (not just curl) before committing:

- `leave_letter_draft` — Leave gets an "AI: Draft a leave letter" button once at least one date is picked, filling the existing Reason textarea from the real day count/date range plus whatever the staff member typed (redacted first). Verified live: selecting 11 September 2026 as Elias produced "requesting a one-day leave on 11 September 2026."
- `task_description_draft` — Task Board's new-task form gets an "AI: Draft a description" button once a title is typed, expanding it into one grounded sentence from the title/category/priority alone (no redaction needed — nothing but the creator's own picks ever crosses the wire).
- `expense_justification_draft` — Expenses' fund-request form gets an "AI: Polish into a justification" button once both an amount and a purpose note exist. The prompt explicitly forbids the model from touching or recalculating the amount — that stays the requester's own number, approval stays fully Management's, matching the "financial totals"/"final payment approval" guardrails.
- `commission_explainer` — My Commission gets an auto-loading one-line AI explainer of the real month-over-month total (same always-there pattern as streak coaching). Real privacy note: the screen displays each row's actual `clientName` (e.g. "Kwame Asante") to the agent, but the AI request only ever carries the agent's own name and aggregate totals — a client's identity was never needed to explain a number and never sent.

All four follow the same two established patterns from #23: a mutation-based "tap to draft, fills an existing editable field" shape for anything that produces text a human will send (memo/leave/expense/task), and an auto-loading query shape for anything that's pure narration of already-computed numbers (commission). `redactPII()` continues to be applied everywhere real free-text staff input reaches the model.

Total real, live `kind`s as of this push: `streak_coaching`, `colleague_availability`, `manager_daily_briefing`, `login_greeting`, `companion_qa`, `follow_up_draft`, `data_check_summary`, `memo_draft`, `leave_letter_draft`, `task_description_draft`, `expense_justification_draft`, `commission_explainer` — 12 across Login, Home, Pipeline, Data Check, Memos, Leave, Task Board, Expenses, and Commission.

Blueprint artifact republished (same URL) with Phase 11's AI paragraph, Open Decision #01, and the Phase 7 Smart Insights roadmap line all updated to match — no longer describes the AI key or the companion as still-open.

## 25. System Health closes its named AI gap, 13th real kind (2026-09-06, same push)

Two more additions, both verified live as Management:

- **`health_check` fast path** on `ai-insights` — reports whether `GROQ_API_KEY` is configured without spending a real Groq call (a status check, not content generation). Surfaced as a new "AI provider (Groq)" row in System Health's Scheduled Jobs list — directly closes Master Spec line 217's explicitly named gap ("Admin System Health page: ...AI [provider status]"), open since Phase 11 first shipped and tracked in the Blueprint's own §08 note.
- **`system_health_summary`**, 13th real content kind — one-sentence narration of the real health snapshot (critical events, failing jobs, report/backup status). Purely operational aggregates, zero client or staff personal data. First pass echoed a raw JSON field name back verbatim ("criticalCount = 1") instead of natural prose — tightened the prompt to explicitly forbid that, verified live the second pass reads naturally ("One critical audit event requires attention, while all scheduled jobs, the daily report and backups are on schedule and healthy").

Total real, live `kind`s: 13, across 10 apps (adds System Health to the #24 list).

## 26. Pivot to the Master Rebuild Specification — Phase 1 (Data + security foundation) (2026-09-06)

New governing document supplied: `Palmstead_Master_Rebuild_Specification_COMPLETE.pdf` (59 pages + two technical appendices — the full 415-row Royal Palm inventory and an app-by-app rebuild matrix). Read in full. Per the user's explicit choice, work now follows the spec's own mandated sequence (Section 26, "do not skip the sequence") rather than a feature-priority order: Phase 0 (freeze/inventory) → **Phase 1 (data + security foundation, this entry)** → Phase 2 (Pipeline+Payments) → ... → Phase 7 (Management/Dashboard) → Phase 8 (Home/Staff UX) → Phase 9 (Gamification+AI, already substantially done per §22-25) → Phase 10 (hardening).

**Two audit passes** (both read-only, evidence-based, against the real live databases rather than the PDF's static analysis) found the PDF's "critical technical findings" were mostly already fixed in earlier sessions: `leads.deleted_at` soft-delete ✓, `staff_streaks` table ✓, `send-todo-alarms` cron ✓, site-visit allowed-days (all 7 days) ✓, leave conflict rule (no adjacency bug) ✓ — all confirmed already correct on both projects, contradicting the PDF's stale analysis. Real, unfixed gaps found and closed this pass:

- **RLS `WITH CHECK` pairing** — 41 of 45 (staging) / 41 of 46 (production) UPDATE policies had `USING` but no `WITH CHECK` — a real privilege-escalation surface, the same shape as the known referrals-table bug in memory. Fixed on **both projects** (production done with explicit user go-ahead) via `ALTER POLICY ... WITH CHECK (...)`, mirroring each policy's own `USING` clause except `memos_upd`, whose `WITH CHECK` deliberately drops the `status='draft'` condition so a sender's own draft→sent transition isn't blocked. Verified 0 remaining on both.
- **Real audit trail** — `approve_payment`, `decline_payment`, `confirm_allocation`, and `restore_backup` previously wrote only to `activity_log` (a different, CRM-contact-log table) and never to `audit_events`, which had exactly 2 rows in its entire history before this (both `permission_override.*`). All four now call `record_audit_event()` and return the audit id in their response — closes Section 3.1's "every business-critical write returns an operation/audit ID."
- **Error contract** (Section 3.4) — `friendlyError()` only matched a handful of raw shapes; RPC-raised business messages (e.g. "Only Management can approve a payment") fell through to a generic "Something went wrong," silently discarding the specific reason. Added check-constraint/invalid-input codes, a curated map of short internal RPC codes (`not_authorized`, `amt_paid_locked`, etc.), and a pass-through for hand-authored sentence-shaped messages. Fixed 4 real call sites still rendering `error.message` raw (LoginScreen ×3, BackupsScreen restore).
- **Real live bug found and fixed**: `LogPaymentScreen`'s approve/decline/create-payment mutations had **zero error handling** — a rejected payment decision or a failed submission showed the user nothing at all, in the single most sensitive flow in the app given its own prior payment-integrity incident. Now surfaces a real message on every path.
- **System Health** (Section 3.5) — added the 4 of 9 named checks that were missing: database connectivity, Realtime status, SMS provider status, email provider status (new `useInfraStatus.ts`, all real live probes — a round-trip query, an actual Realtime channel subscription, `sms_log`/`report_archive` recent-failure rates). Removed 2 phantom "scheduled job" entries (`daily-reminders`, `scheduled-integrity-check`) that matched no deployed function or `cron.job` row and would always render "Healthy" for jobs that don't exist — a real "no dead controls" violation (Section 24.3). Wired `run_monthly_commission_check()` to report its own failures to `audit_events('cron')`, since that category had zero rows ever, meaning the job-health signal was unconditionally "Healthy" regardless of reality.
- **Optimistic concurrency** — the one error class from Section 3.4 with no implementation at all: `leads.version` existed and was trigger-maintained, but nothing ever sent it back or checked it. Added `Lead.version` (read) / `LeadUpdate.expectedVersion` (opt-in), wired into all three PipelineDetail edit sections. Verified live (normal save still works) and directly against staging (the exact filtered-UPDATE query correctly matches 0 rows on a stale version, correctly succeeds on the real current one).

**Deliberately deferred, not silently dropped** (explicit user instruction: work out fully on staging, never merge to production without a separate ask):
- **Permission-model migration** — staging has the spec's relational `permissions`/`role_permissions`/`staff_permission_overrides` tables + RPCs (Section 3.2); production still runs the old `profiles.tool_access` jsonb blob and has none of the three tables/RPCs. Staging-only per explicit instruction — production stays untouched until separately requested.
- **pgTAP suite exists but isn't version-controlled** — 39+ real assertions across 9 suites run live on staging (`tests.run_rls_foundation_tests` etc.), confirmed passing, but they exist only as database functions — no `supabase/migrations/` or `supabase/tests/` directory in the repo at all, not in CI, not on production. Real follow-up: export as versioned `.sql` files.
- **Referral integrity bug still open** — the WITH CHECK fix closes row-ownership escalation but does **not** fix the actual known bug (RLS allows a direct UPDATE to bypass the safe `clear_referral()` RPC's business-rule checks) — that needs a different fix (likely revoking direct column-level UPDATE on referral status, or a trigger), not yet built.
- **Realtime coverage gap** — 11 tables are in the `supabase_realtime` publication with no client-side subscription at all (`referrals`, `contract_requests`, `memos`, `banners`, etc.) — matches the known "needs logout to refresh" area already in memory. Only `messages`/`schedule_items`/`leads`/`payments`/`leave_requests` are actually subscribed to live.
- **Backup/restore is still a whole-database snapshot**, not the staff-scoped/event-sourced design Section 14 asks for — that work is scoped to Phase 7 (Management), not Phase 1, so intentionally not touched yet.
- **send-todo-alarms Edge Function** has no failure-reporting wired in yet (only the SQL-based `monthly-commission-check` job does) — would need editing the deployed Deno function, not done this pass.

## 27. Phase 2 (Pipeline + Payments) — full requirements audit, real fixes shipped (2026-09-06)

A 63-point requirements audit against Master Spec Sections 4-6 (My Pipeline, Excel Import/Export, Payments/Log Payment & Approval) found the desktop pipeline UI itself is largely unbuilt (no table/filters/KPI-strip/bulk-actions — still a simplified mobile-card list) and surfaced two real, live financial-integrity bugs alongside a long tail of smaller gaps. Fixed this pass, all verified live:

- **`amt_paid` fabrication bug (the single highest-risk finding)** — `AddLeadScreen`'s "Amount already paid" field wrote `leads.amt_paid` directly on creation with zero corresponding Payment row: any agent could inflate the pipeline's collected total from nothing, no ledger, no approval, no audit trail — a direct violation of Section 4.4. `leads.create()` (both DataSource implementations) now always inserts `amt_paid=0`; `useCreateLead` chains a real `payments.create()` call for any opening deposit through the exact same pending/auto-approve rule Log Payment uses, and the field is hidden entirely from anyone who isn't manager/'elias' (real `payments_ins` RLS means no one else could legitimately create the payment row anyway). A failed deposit doesn't discard the lead — the screen shows a clear message and a direct link to log it manually.
- **`approve_payment` RPC never recalculated `stage`** — fixed to mirror the client-side `deriveStageFromPayment()` thresholds exactly; the other approval path (manager self-approve) already had this right.
- **Payment approval safeguards** (Section 6) — balance before/after preview on Log Payment, a required overpayment-confirmation checkbox before an over-balance amount can submit, a two-step "Confirm approve" (previously one click), decline reason changed from optional to enforced-required, and `PendingPaymentRow` now shows the logging staff's name/method/current+proposed balance (4 of 9 required fields were missing).
- **Delete-reason persistence + Management archive view** — the danger-zone UI already asked why a lead was being deleted but discarded the answer entirely; `leads_sel` RLS filtered out archived leads even for Management, so there was no way to ever see one. Added `deleted_by`/`deleted_by_name`/`deletion_reason` columns, expanded the reason set to the spec's exact five (Wrong data / Duplicate lead / Client cancelled-refund / Client requested removal / Other with enforced free text), fixed RLS so Management specifically can see `deleted_at IS NOT NULL` rows, and built a new manager-only Archived Leads screen with one-tap restore. Verified live end to end: archive → visible to Management with real reason + archiver name → restore → back in the agent's active pipeline.
- **Import "Conflicts" bucket** — was computed at commit time (`isStaleConflict`) but never shown in the preview the user actually reviews before confirming; `scanImportRows` now detects the same condition and surfaces a real Conflicts KPI + explanation.

**Real remaining punch list** (most business-critical first — not yet built):
1. ~~Payments "Needs Correction" workflow doesn't exist~~ — **done 2026-09-07**, see §29.
2. **Lead record is missing entire sections** — **Site Visits, Activity timeline, Audit trail, and source/priority/assigned-staff UI all done 2026-09-07, see §30. Documents is deliberately still open** (see §30's own note — needs a larger Document Vault schema change, contracts/quotations/receipts don't write to `downloads` at all today).
3. ~~Desktop pipeline UI is largely unbuilt~~ — **done 2026-09-06/07**, see §28.
4. **Import commit is not one transaction** — a for-loop of independent REST calls with per-row catch-and-continue, not atomic.
5. **No realtime broadcast for leads/payments/imports** — only the acting session's own query cache is invalidated; other open sessions need a manual refresh.
6. ~~Lifecycle automation gaps~~ — **done 2026-09-07**, see §31: auto follow-up task on lead creation, activity-log entry on a manual stage change, and stale-lead detection now use real last-activity tracking (`leads.last_modified_at`) instead of creation date.
7. ~~Reference/receipt-number field missing from the Log Payment form itself~~ — **done 2026-09-07**, see §29.

Two items remain open on this punch list: **#4 (import transactionality)** and **#5 (realtime broadcast)** — both real, both architecturally larger (a wrapping RPC for #4; live Realtime channel subscriptions for #5), next in line.

This is real, substantial remaining work — Phase 2 is not being marked done. Continuing through this punch list before moving to Phase 3 (Allocation + Inventory) per the spec's own sequence.

## 28. Phase 2 punch list item 3 — desktop pipeline UI, done (2026-09-07)

Master Spec Section 4.1/4.2. My Pipeline had a mobile-card-only list with no desktop dense view, no filter panel beyond the stage tabs, and no bulk operations.

New `PipelineListScreen` (`pipelineListLogic.ts` for the pure logic): the real 7-metric KPI strip (pipeline value/collected/outstanding/fully paid/site visits/high priority/allocation-ready — the last reuses `getInsightLists()` rather than reimplementing the 30%+ threshold check), the stage-funnel tabs using the spec's own vocabulary (New/Discovery/Qualified/Negotiation/Closed-Won/Lost) as a second, list-specific label set (StageBadge's existing short-code display elsewhere is untouched), the full 8-dimension filter panel (priority/payment state/site-visit state/allocation-ready/source/date range/overdue-only), and bulk select → Export/Assign/Tag/Archive — no bulk delete anywhere, matching spec 4.1's explicit prohibition. One `filtered` array feeds both the new desktop `<table>` and the existing mobile card list.

Also closed the date-field half of punch-list item 6: new `leads.next_action_date` column (staging), a "Due" row + overdue red styling on Pipeline Detail's Follow-up section, `isLeadOverdue()` and the filter panel's overdue-only checkbox in `pipelineListLogic.ts`. `useAssignLead` hook added for the bulk-assign action (wraps the existing `leads.assign()` RPC-free UPDATE, already used elsewhere).

**Real CSS cascade bug caught live**: the `>=900px` media query hiding `.cardList` was placed *before* `.cardList`'s own base `display:flex` rule, so the later same-specificity base rule silently won the cascade — both the table and the card list rendered simultaneously at desktop width. Fixed by reordering.

Verified live in demo mode: bulk Tag round-tripped onto the lead's own detail page; bulk Assign moved a lead out of My Pipeline and recalculated every KPI; bulk Archive correctly gated on a required reason (Confirm stayed disabled until typed) and removed the lead from the list; the allocation-ready filter narrowed to exactly the 1 lead the KPI tile already counted. `tsc -b` clean, zero new console errors.

## 29. Phase 2 punch list items 1 + 7 — Needs-Correction workflow + payment reference number (2026-09-07)

Master Spec Section 6. Two new `payments` columns (staging): `correction_reason`, `reference_number`. Two new SECURITY DEFINER RPCs mirroring `approve_payment`/`decline_payment`'s own shape exactly (manager-role check, `for update` row lock, `activity_log` + `messages` + `record_audit_event()` writes, never a raw client UPDATE):

- `flag_payment_needs_correction(payment_id, reason)` — manager-only, reason required, only from `pending`, sets `status='needs_correction'`.
- `resubmit_payment(payment_id, amount, method, note, proof_path)` — manager or `elias` (matches `payments_ins`'s own real allowlist, so no new RLS surface opened), only from `needs_correction`, validates `amount > 0`, updates the row and resets `status='pending'` (and clears `decided_by/decided_at`) so it goes through a fresh, real approval — a resubmit can never itself become an approval bypass.

`PaymentStatus` gains `'needs_correction'`. Log Payment: manager gets a third pending-row action ("Needs correction") alongside Approve/Decline, gated behind the same required-reason-text pattern already used for Decline; a new "Needs correction" section (visible to the flagged payment's own logger, or to any manager) shows the manager's reason and a "Fix and resubmit" inline edit form (amount/method/note, prefilled). The create-payment form gets a new "Reference / transaction number" free-text field (MoMo txn ID / teller slip / cheque number) — distinct from `receiptNumber`, which stays the app's own internal number minted post-approval by `ensure_receipt_number()` — shown on the pending-row meta line so a manager can cross-check it against the real statement before approving.

Verified live end-to-end as both roles in one pass: logged GHS 5,000 for Abena Boateng as Elias with reference `MOMO-TEST-99887` → switched to Management, flagged it needing correction with a real reason → the row moved out of Pending into a new Needs Correction section showing that reason → "Fix and resubmit" corrected the amount to GHS 5,500 → resubmitted → landed back in Pending Approvals with the reference number still attached → approved → balance recalculated correctly (GHS 36,000 → GHS 30,500). `tsc -b` clean, zero new console errors at any step.

## 30. Phase 2 punch list item 2 — lead-record sections (2026-09-07)

Master Spec Section 4. Three real FK/schema gaps closed, plus UI for two real columns that already existed with no UI anywhere:

- **Site Visits section** — `site_visits.lead_id` (new column, staging) replaces what was a total absence of any link between a visit and a lead. Historical rows backfilled by an exact name+contact match (3/3 matched); new visits link explicitly via a picker instead of relying on fuzzy matching going forward. `AddSiteVisitScreen` now reads `?leadId=&name=&contact=` from Pipeline Detail's new "Log a visit" link and prefills/links accordingly; on save it returns to the lead instead of the generic Site Visits list.
- **Activity timeline section** — `activity_log.lead_id` (new column, staging), same backfill treatment (69/74 historical rows matched by name; 5 unmatched, real orphans not force-linked). The four payment RPCs (`approve_payment`/`decline_payment`/`flag_payment_needs_correction`/`resubmit_payment`) now set it explicitly on every new write, so new activity is never dependent on fuzzy matching at all.
- **Audit trail section**, manager-only (matches `audit_events`' own RLS) — merges `entity_type='lead'` events with `entity_type='payment'` events for that lead's own payments. Real, previously-nonexistent gap closed alongside this: `leads.remove()`/`restore()` (both demo and live) now write `lead.archived`/`lead.restored` audit events — before this pass, archiving or restoring a lead was invisible to the audit trail entirely despite being exactly the kind of reason-required, sensitive write §26 already required audit coverage for on the payments side.
- **Source/priority/assigned-staff UI** — real `Lead.leadSource`/`priority`/`agent` columns had zero UI anywhere (confirmed by grep, not assumed) despite already having write paths (`LeadUpdate.leadSource`/`priority`, `leads.assign()`). New "Lead details" section: read/edit for source+priority (same pattern as the existing Client section), plus a manager-only Reassign control wrapping the existing `useAssignLead` hook.

**Deliberately still open, not silently dropped**: the Documents section. Document Vault (`downloads` table) only ever logs company-wide report exports (Pipeline Excel, Staff/Management/Company reports, Commission PDF) — Contracts, Quotations, and Receipts, the actual per-lead documents a manager would want to see grouped on a lead record, don't write to `downloads` at all today. Giving a lead a real Documents section needs `downloads.lead_id` threaded through those generator screens first — a real, separate piece of work, not a quick addition to this pass.

**Real bug caught mid-verification, not by code review**: the first live check showed both new sections rendering as empty despite correctly-seeded data — traced to the exact reseed-guard trap already documented in §14's own note: an intermediate build got persisted to `localStorage` under the just-bumped `DEMO_VERSION` (49) *before* the `leadId`/`activityLog` seed edits had fully landed, so the guard's `version === DEMO_VERSION` check matched a stale snapshot and silently skipped every later reseed attempt. Fixed by clearing the stale key once; the underlying fix already shipped in §14 (stamping the real version at seed time) is not itself broken — this was a new instance of the same trap, worth remembering as a recurring hazard whenever `DEMO_VERSION` is bumped mid-edit rather than as the very last step.

Verified live end-to-end as both Elias and Management in one pass: Site Visits and Activity both showed Mercy Owusu's real seeded data; edited Source→"Referral" and Priority→"High" and both persisted; Management's Reassign control opened with the real staff list; archived Abena Boateng with a reason → a real `lead.archived` audit event appeared in `localStorage` with the correct entity id/reason → Archived Leads screen showed her with the right reason/archiver → Restored her → a `lead.restored` event followed → she reappeared in the active pipeline. `tsc -b` clean, zero console errors at any step.

## 31. Phase 2 punch list item 6 — lifecycle automation (2026-09-07)

Master Spec Section 4's lifecycle-automation gap, closed in three parts:

- **Auto follow-up task on lead creation** — `useCreateLead()` now also creates a real Task Board task (`scheduleItems.createTask`, `kind='task'`), titled "Follow up with {name}", due 3 days out, assigned to the creating agent. Fire-and-forget (never blocks or fails the lead save itself), same discipline as the opening-deposit step right next to it.
- **Activity-log entry on manual stage change** — the one place a lead's stage is changed by hand today (FollowUpSection's "Mark this lead as Lost" checkbox) now writes a real `activity_log` row (`Stage changed to Lost` / `Stage reopened from Lost`) via a new `useLogActivity()` hook, only when the value actually changed. Automatic stage recalculation from payments (`approve_payment`, `deriveStageFromPayment`) is deliberately not logged here — that's a payment-driven side effect, already covered by the payment RPCs' own `activity_log` writes (§30), not a second "manual" entry for the same event.
- **Stale-lead detection now uses real last-activity, not creation date** — `getInsightLists()`'s "going cold" check used to be `daysSince(l.date)` (creation date only), so a lead worked on yesterday but created months ago read as permanently cold, and one created recently but never touched since read as fresh. Real fix, not a new column: `leads.last_modified_at` already exists (trigger-maintained on every UPDATE, added earlier this session for optimistic concurrency) — the check now uses `lastModifiedAt ?? date` instead. Demo mode's `leads.update()`/`updateDocStage()`/payment-`approve()` now stamp `lastModifiedAt` too, so the same real signal is exercised in demo mode, not silently stuck on creation date forever.

**Real bug caught mid-verification**: the first live test of the activity-log-on-stage-change write showed the entry land correctly in `localStorage` but not appear in the UI until a full reload — `useLogActivity()`'s fire-and-forget write had no query invalidation, so `useActivityForLead`'s cache never knew to refetch. Fixed by chaining `qc.invalidateQueries({ queryKey: ['activityForLead', leadId] })` onto the write's own success, matching the invalidate-on-write pattern used everywhere else in this codebase.

**False alarm investigated and ruled out**: a "React has detected a change in the order of Hooks" console error appeared to recur across multiple `read_console_messages` calls, including at the bare login screen where `FollowUpSection` cannot even be mounted — confirmed as accumulated stale console history in a long-lived browser tab (the same artifact class already documented in this file's own testing notes), not a live bug. A fresh tab reproduced the exact same interaction with zero console errors.

Verified live end-to-end: created a lead as Elias → a real "Follow up with {name}" task appeared on Task Board, due date correct. Toggled Mark as Lost on/off → each toggle produced a real, immediately-visible Activity entry. Edited Mercy Owusu's Lead Details (bumping `lastModifiedAt`) → her "going cold" Smart Insights nudge disappeared on the next scan, while her other real nudges (30%+ ready for allocation, high-priority-no-follow-up) stayed correctly unaffected. `tsc -b` clean, zero real console errors at any step.
