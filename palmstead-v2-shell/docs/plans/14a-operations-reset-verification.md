# Operations reset and recovery — verification ledger

## Story and current scope

Management opens Operations → Reset test data, selects projects/to-dos/meetings, records a reason, previews exact related-record counts, confirms with the named phrase, and can recover a completed batch. Staff cannot access any reset/history/recovery RPC. Reset does not touch other apps, auth, staff bio data, company configuration, workspace identity or stored files. This is the first slice of plan 14, not completion of the cross-app request.

`20261016055518_operations_reset_recovery.sql` and `20261016063910_operations_reset_reviewed_schema_guard.sql` were applied to V2 `sbydzrlzqxcdbudjaube` on 2026-10-16. Installing them created the guarded controls and private recovery tables; no live reset or restore was executed. Do not use a live wipe as QA. The second migration pins the reviewed schema, so a later column/constraint/automation change blocks fresh reset previews until its adapter is reviewed. Existing previews and recovery also check their own schema fingerprint.

## Reproducible isolated database checks

`scripts/qa/operations-reset.mjs` runs PostgreSQL through PGlite 0.5.10 in memory using `scripts/qa/fixtures/operations-reset-schema.sql`. The fixture reproduces the V2 Operations catalog (columns/defaults, primary/unique/check/foreign keys captured 2026-10-16), synthetic profiles/auth, and no real rows or delivery workers. Install that exact QA-only PGlite version separately, or supply its module URL through `PALMSTEAD_PGLITE_MODULE`. Run the script from V2. It never connects to Supabase. Optional `PALMSTEAD_QA_OUTPUT` saves the check results outside the repo.

55 checks passed on 2026-10-16:

- Staff, anonymous, inactive and identity-less callers denied; private rows/helpers and generation writes denied.
- Scope/reason/confirmation validation, foreign preview actor, expiry, changed-row fingerprint and schema changes rejected.
- Original recurrence IDs and all 17 project tables recovered exactly, including labels/issue self references, default-state cycle, numbering, assignments, comments, activity, attachments and saved views.
- Meeting invitations/RSVP, attachments and task events recovered; unrelated CRM schedule tasks retained; cross-kind inbound references block reset.
- Workspace/profile preservation, execution and recovery retries, generation updates and history filtering verified.
- Conflict/missing-parent recovery rolls back every insert and retains snapshots. Damaged snapshots and a 20,001-row graph rejected.
- New incoming foreign keys and application automation block the adapter pending review.
- Fresh previews also stop after any unreviewed schema change, including generated columns which generic recordset insertion cannot recover.
- Past unsent reminder suppressed on recovery; future reminder eligible. No SMS/email/push sent.

PGlite tests do not establish multi-connection lock timing, Realtime delivery, a full HTTP auth flow, or real SMS delivery. The adapter uses a transaction-wide advisory lock and deterministic table locks with a three-second lock timeout; concurrency/load verification remains a separate PostgreSQL staging exercise.

## Live V2 authorization checks

Under actual Management JWT claims and `authenticated`, the three-scope preview returned 26 related records (one project, one work item, two to-dos and associated project records), no blockers. The verification transaction was rolled back. Under the actual Adams identity, preview, history, execute and recovery calls all raised insufficient privilege; the verification transaction was rolled back. No business records changed.

Security advisors were run after installation. The three new private tables intentionally have RLS with no client policies, plus revoked raw table grants; only guarded private definers access them. This produces the informational [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) advisory. Do not add permissive policies to silence it. Existing unrelated advisories include `staff_directory`'s definer view and legacy public function grants; those require their own authorization audits, not a blanket claim that the whole database is secure.

## Browser evidence before release

Local V2 at port 3002, using the real authorized test accounts:

- Management: all scopes selectable; reason required; actual 26-record impact matches the authorized projection. Named confirmation starts disabled; an incorrect phrase remains disabled. Cancel closes without executing. Empty recovery history correctly excludes previews.
- Staff Adams: direct reset URL shows Management access required; no counts/form/history are rendered. Back to Operations returns to the app. The Staff root screen contains no Reset test data entry.
- 320×820 viewport: document width 305px; scope controls, counts and actions wrap without horizontal overflow. Light full-page and dark viewport screenshots inspected. Viewport override reset afterward.
- Production reset/recovery execution and its browser refresh notice are intentionally not exercised against real company data. Destructive database behavior is covered by the isolated graph tests; production checks are previews and denial only.

Evidence images are private local QA artifacts, not committed customer data: `operations-reset-mobile-light.png`, `operations-reset-mobile-dark.png`, `operations-reset-staff-denied.png` in the chat workspace's output/screenshots directory.

## Release state

Not deployed yet. A direct working-tree typecheck initially found generated Next dev/production route declarations out of sync after adding the Operations layout, plus an unrelated in-progress Chat component importing an unavailable ButtonProps type. An isolated committed-base build then caught two nullable closure types in the reset version boundary; both were corrected. The final reset source passed the complete Next production build and TypeScript check (87 generated pages), and its five new component/data/layout files passed focused Biome checks. The build includes a stable hidden/inert content wrapper so an already-open form remains mounted behind the reset notice until the user chooses to reload.

Chat was subsequently committed separately as `fe97779`. Its seven committed files are being added to the already-tested snapshot for another full build before release, so publishing this reset will preserve that work. Local test execution and browser verification remain distinct from production deployment. Record the exact rebuild commit/tree, deployment ID and post-deploy role checks here before marking this slice released.

## Remaining programme

Close Operations project/issue authorization and Staff mutation contracts, inventory and fix return controls across actual app layers, then complete Operations reporting/workflows and Accounting in the order in plan 14. The Operations reset adapter does not yet provide Leave/Attendance/Finance reset. Finance reset must reconcile approved payments, balances, allocations, commissions, payroll and recovery before it is exposed. Leave policy history and Attendance reports remain open from earlier phases.
