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

## 4. Role / permission-record system — GENUINE gap, matches the spec's ask

`profiles.role` is a bare `text` column — no enum, no check constraint, no FK to a roles table. `tool_access` and `unlocked_skins` are ad hoc `jsonb` blobs on `profiles`, not a real permission-record model. No dedicated roles/permissions table exists anywhere in the schema (`information_schema` search for `%role%`/`%permission%` table names returns nothing). This is real, unbuilt Phase 1 work — the spec is right about this one.

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

## Next actions (in order)

1. ~~Port `audit_events` + `record_audit_event` to staging~~ — done (migration `p0_port_audit_events_to_staging`).
2. ~~Wire `web-next`'s `DataSource` to `audit_events`/`backups` and build the System Health + Audit Log + Backup & Restore screens~~ — done, verified live in demo mode.
3. ~~First pgTAP suite~~ — done (§9): `run_rls_foundation_tests()` (13/13, schema/policy shape) + `run_rls_authenticated_tests()` (4/4, real manager-vs-agent RLS behavior via the existing `webnexttestuser` test account).
4. Continue Phase 1: role/permission-record table design (real gap, §4), idempotent-RPC review, error-contract standardization. Live-mode manager sign-in through the real login screen is still unexercised — needs a real manager `auth.users` account, which is account creation (out of scope here) rather than a schema task.
