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
10. Next: the other critical findings from the master spec's Section 1 not yet addressed — leave non-overlap rule, scheduled-job health/retry observability, Excel import/restore creating duplicates instead of reconciling. Also still open: idempotent-RPC review, error-contract standardization, planning the actual production cutover of the permission model (staging-only today, by design), and live-mode manager sign-in (needs a real manager `auth.users` account — account creation, out of scope here).
