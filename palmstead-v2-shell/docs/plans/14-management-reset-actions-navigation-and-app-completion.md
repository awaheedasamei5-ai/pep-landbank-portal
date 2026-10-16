# Management reset, record actions, navigation and app completion

## 1. Request, order and delivery rules

The user's 2026-10-16 instruction changes the delivery order. First provide Management with a way to clear selected test data, complete permitted Staff edit/update/delete workflows, and supply missing back controls throughout app layers. Next revisit Operations reports and complete the Operations product, including project and to-do editing/deletion/reset. Then audit and complete Accounting, its reports and every generated document. Work in verified phases, with product research, actual GitHub source adaptation, database and permission design before UI. This document coordinates that work; existing app plans remain the detailed business-rule record.

This is a broad programme, not a claim that all apps are already implemented. A sidebar entry or copied service method does not establish a working app. Every scope below needs an evidence row: source inspected, policy verified, mutation tested, role/browser verified, export inspected, commit and deployed version. Missing backend capabilities must not be covered by a decorative control. Existing Leave effective-policy history and Attendance reports remain open, deferred behind this latest instruction.

V2 only: `palmstead-v2-shell`, `rebuild`, Supabase `sbydzrlzqxcdbudjaube`, linked Vercel `palmstead-v2-shell` in `dnm-garments`. No V1 modifications or main-branch writes. Preserve other work in the shared checkout; release a verified committed snapshot if unrelated edits are in progress.

## 2. Evidence already collected and gaps to investigate

Read the existing Operations source-port/report/calendar plans and Accounting/Finance blueprints alongside current route, service and schema evidence. Prior “DONE” notes describe a point in time and are not accepted as a fresh audit. Operations project update/delete methods already exist in `src/openplane/web/services/project/project.service.ts`; the active root screen mainly exposes quick-create and state-only Overview/Schedule/Queue/Audit tabs. A method that no appropriate user can reach through the product remains a UI gap. `use-my-schedule.ts` already contains update/delete mutations; its reschedule path performs separate insert and update calls and therefore requires transaction/failure review.

Live V2 inspection confirms the `op_*` project graph, separate `op_todos`, and `schedule_items` meeting model. Project deletion cascades into states, cycles, modules, issues and related joins. Projects also reference a default state: restoration has an ordering cycle. To-dos and schedule items have recurrence/reschedule self references. `task_events.task_id` references `schedule_items` without a cascade. Meeting reset cannot be a one-table delete. Cross-kind schedule dependencies must be discovered and handled explicitly.

Operations `op_*` tables currently have broad ALL policies; row-level authorization must be read and tested before exposing additional destructive actions. Staff permissions are not inferred from buttons being hidden. The shared PageHeader has no back-control contract. A full route/dialog inventory is required, with static evidence labelled as hints until browser-tested.

## 3. Research and source adaptation register

Use the actual Plane source already ported under `src/openplane`, preserving its attribution and AGPL notices. Reuse existing service/store shapes and the shell's real components; do not add another project/task backend. Before any additional copied source, inspect the exact file, commit, licence and dependencies, record attribution, and adapt it into the existing app. A new repository clone is justified only when it supplies missing usable source. Do not clone a large incompatible backend merely to list it as a resource.

Research reviewed for this continuation:

- [Plane work-item management](https://docs.plane.so/work-items/create-and-manage-work-items): creation, editing, lifecycle and role-dependent deletion.
- [Plane analytics](https://docs.plane.so/core-concepts/analytics): project/workspace lenses and breakdowns over inspectable work data.
- [Linear deletion and archives](https://linear.app/docs/delete-archive-issues): distinguish active, archived and recoverable deleted work; explicit restoration.
- [Linear exports](https://linear.app/docs/exporting-data): selected-view scope, project versus issue exports, stable fields and absolute event timestamps.
- [GOV.UK back links](https://design-system.service.gov.uk/components/back-link/): return to the prior page in its prior state; provide a deliberate back control for multi-page flows.
- [ERPNext immutable ledger](https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext): submitted financial corrections retain original evidence and use reversal/amendment workflows.

These sources inform behaviour, not Palmstead-specific financial rules. Accounting still needs a fresh exact-source/UI/PDF research pass against its actual current implementation before its build phase. The existing approved Midday, Bigcapital, ERPNext and Superset references are retained, with stack/licence feasibility checked per file. Pinterest may inform visual hierarchy only; it does not establish permissions, calculations, or working source code.

## 4. Inventory and acceptance ledger

Inventory every real dashboard route and nested layer, including forms, tabs, dialogs, side panels, calendars, detail views and reports. For each record type capture: create entry, edit entry, save/update path, delete/archive/cancel path, restore path, source-of-truth table/RPC, owner/manager rules, linked-record effects, history, notifications, and back/cancel behaviour. Classify the result as implemented and verified, implemented but unreachable, broken, missing, deliberately restricted, or template/not built. Never turn a template into a supposedly functioning business app just by adding controls.

For Staff, inspect own, assigned, delegated and unrelated records separately. “Can see a project” is not automatically “can delete a project.” For Management, verify actual active profile authorization on every backend entry point. Test disabled/inactive accounts and direct authenticated requests as well as UI routes. Existing realtime subscriptions, query invalidation and MobX caches must agree after create/update/delete/restore/reset.

The inventory is a release checklist. Automated import/text scanning can find likely omissions, but a back icon import or mutation function name is not proof of a working interaction. Finish each row through code tracing and browser evidence. Global navigation work must not introduce duplicate back controls where a screen already supplies one.

## 5. Database architecture for reset and recovery

Build an explicit per-app reset adapter registry. A request supplies a supported application/scope identifier, never arbitrary table names, predicates, SQL or backup JSON. No generic prefix-based truncation and no “delete every table” endpoint. The first implemented adapter is Operations, then additional apps only after their dependency and integrity audit passes. The Management interface must say exactly which scopes are supported; unfinished scopes are not presented as working reset choices.

Proposed private schema `app_reset_private` stores reset batches, protected snapshots and reset/restore audit events. A batch contains an opaque ID, app/scope version, actor auth ID, created/expiry timestamps, status, row-count summary, snapshot fingerprint and protected payload. Preview tokens expire; retained recovery snapshots have a separate lifecycle. A public invoker RPC delegates to an internally guarded fixed-search-path definer. Raw snapshots are not returned to the browser, placed in public Storage, committed to Git, or made available to Staff.

Execution locks the relevant graph, checks the preview still matches the current records, captures the recoverable state and performs the reset in one transaction. New or changed rows invalidate an old preview. A failure rolls back the whole scope. Reset events retain actor, time, reason, scope and before/after counts. Never reset auth users, profiles, biodata, permissions, company identity, app configuration, integration credentials, Storage buckets, document counters or protected audit evidence as an incidental cascade.

## 6. Operations reset graph and restoration

Treat project work, personal/delegated to-dos and meetings as separate selectable scopes with exact impact counts. Project snapshots include projects, members, states, labels, cycles, modules, module members, issues, assignees, issue labels/modules/relations/comments/links/attachment metadata/activity and saved views. Preserve the workspace. Snapshot and restore all IDs and sequence values; do not recreate approximate records with new identifiers. Restore projects with default-state pointers temporarily null, then states and the remaining graph, then restore the exact saved pointers. Restore self-referencing sets in a statement/order verified against their real constraints.

To-do reset includes recurrence parents and reschedule chains. Meeting reset includes meeting rows, invitees, attachments and task events. Inspect cross-kind `schedule_items` references before enabling execution: do not silently delete CRM/task records or rewrite an unrelated schedule item's dependencies. Either include a reviewed dependency in the impact preview or reject execution with a named, actionable dependency reason. Stored files remain private and recoverable; clearing metadata must not be misrepresented as permanent object removal.

Restoration is a first-class Management action. Validate identifiers, parent records, profile references, schema version and conflicts before inserting anything. A reused identifier or missing parent produces a clear conflict and an atomic rollback; no overwrite of newer work. Repeat reset/restore calls are idempotent or return the already-completed state. A request timeout must be recoverable by querying the batch status rather than repeating an uncertain deletion.

## 7. Reset authorization and operational limits

Derive the actor from `auth.uid()` and an active Management profile on preview, execute, list history and restore. A caller-supplied role/key is never trusted. Staff, anonymous and inactive Management cannot list snapshots, inspect company reset counts, execute or restore. Helpers have no unnecessary PUBLIC/anon grants. Set an explicit empty search path, qualify objects, constrain payload size/row count and enforce expiry/actor/scope binding. Do not rely on a client-provided session flag to bypass guards.

Avoid external effects inside a reset transaction. Existing cron/reminder workers must no longer find cleared active records, and restoration must not resend old reminders or duplicate invitations. No real SMS/email/push is sent during QA. Preserve delivery/audit history with clear unavailable-source state. Where an app has an outbox, cancellation/invalidation must be part of that adapter's reviewed transaction; an unrelated message or private chat is not automatically part of the reset.

Test datasets are selected explicitly. Do not guess that rows are tests because of a person's name, age, email, amount or date. The user requested a control they can use to prepare V2 for work; development does not itself authorize performing a live wipe. Build the control and its recovery, test destructive effects on isolated synthetic data, and verify only preview/denial on the real project.

## 8. AI touchpoints

There is no AI dependency for reset correctness, authorization, back navigation, editing or report arithmetic. Do not permit an assistant to trigger a reset, approve a payment, choose a financial reversal, or remove another person's work without the relevant ordinary application workflow. No AI guesses about employee productivity, leave eligibility, tax or financial correctness are added to this phase.

Later report assistance may summarize authorized source data into an editable draft with source links. It must preserve scope, distinguish recorded facts from interpretations, disclose missing history, and never send a document or invitation automatically. Confidential payroll, private notes, signatures and bank information are not sent to an unapproved model. Deterministic comparisons and exceptions remain useful without generated prose.

## 9. Management reset UI

Reset controls live inside the application they configure, with a clear Management-only entry and a route back to the app. Reuse the existing real shadcn Dialog/Alert/Button/Table components at the usage site. Do not alter protected primitives. A reset flow has five visible steps: select supported scope; preview affected records and retained setup; review dependencies/recovery; type the named confirmation and confirm; show completed counts with a recovery/history link. Closing or going back before confirmation changes no business records.

Use precise labels such as “Reset Operations project data” or “Reset selected test data,” not an ambiguous “Reset” beside a filter-reset icon. The preview includes child-record counts, scope boundaries, whether files remain recoverable, generated time and an expiry/changed-data message. Confirm is unavailable while loading, stale or incomplete. A server error remains visible and preserves the form. A successful action invalidates all relevant lists, reports, calendar and project stores in both role sessions.

History shows the batch actor/time/scope/counts/status and restoration outcome without exposing raw snapshots. A restore conflict is a reviewable state, not a successful toast. Mobile actions stack; long names wrap; tables scroll locally; no floating button covers the page. Dark mode uses semantic colours and the same workspace surface as the shell.

## 10. Staff edit/update/delete contracts

Every editable app gets an action matrix grounded in ownership, assignment, workflow state and current permission. Staff can edit their permitted records; completed/approved/posted states may require a supported correction flow. Management approval is not bypassed by adding a generic update button. Server validation enforces immutable ownership, protected decision fields and transaction integrity. Stale versions produce a conflict instead of overwriting another person's newer edit.

For Operations, complete project metadata/settings actions for creator/project lead/authorized manager, work-item actions for the proper project role, own comment editing/deletion, and personal/delegated to-do actions. Assignment may permit progress updates without granting deletion of the entire shared issue or project. Editing a recurring item needs explicit one-occurrence/future-series scope; rescheduling preserves a traceable original/replacement relationship and runs atomically. Deleting a referenced parent shows the dependency impact and uses the approved recovery policy.

For staff apps such as Leave, Attendance corrections, requests, expenses, enquiries and referrals, inspect the existing status model first. Draft edits/deletes, withdrawals, corrections, resubmission and Management decisions are different operations. An approved Leave request is not casually erased; a posted financial record is not quietly rewritten. Where deletion is disallowed, explain the supported correction action and make it reachable. This is functional completeness, not merely hiding an inaccessible Delete button.

## 11. Back navigation across app layers

Create a reusable, labelled back-control contract with a deterministic parent fallback for every route and an explicit prior-context return path for drill-through. Return paths must stay inside approved dashboard routes, reject external/protocol-relative targets, and strip recursive return parameters. Preserve the originating report/list filters, selected tab/calendar date, page and relevant scroll context. A direct deep link with no local trail returns to its valid parent rather than leaving the company portal.

A small app navigation trail may track known internal routes in memory. Back should return to the prior meaningful view; routine filter replacements update the current entry rather than creating dozens of Back steps. Use a deliberate navigation target and truncate the app trail on return so Back does not toggle endlessly between two pages. Never use history length alone as proof that a previous browser entry is safe. Native browser Back and Forward must continue to work.

Inventory existing controls before adding a shell fallback. Convert existing back links to the shared contract where appropriate and cover screens without controls through a route registry. Do not render two back rows. Home has no meaningless self-link. Dialogs/drawers use their own Close/Cancel/Back action with focus restoration; an unsaved form gets an honest discard choice. Reset confirmations and mutation-pending states must not be bypassed by a new Back button. Test keyboard, screen-reader label, narrow layout, fresh deep link, reload, browser Back/Forward, and filtered drill-through.

## 12. Operations reports rebuild

Audit the existing report route and selectors rather than replacing them with another unconnected dashboard. Establish a server-authorized reporting projection with explicit completeness/pagination; current client-only Staff filtering is not a private reporting boundary. Management gets company/project/person dimensions; Staff gets permitted self-work data. Shared work must not duplicate the company's unique totals, and personal assignment counts must be labelled as employee-work assignments.

Reports must separately cover projects, work items, sub-items, personal/delegated to-dos, schedules/meetings/RSVP, cycles/modules, blockers/dependencies, priorities, overdue/due work, completion, assignments, unassigned work, recorded activity, archived/deleted/recovered data and data-quality exceptions. Define each denominator and date basis before charts. Meeting invitations are not attendance; current open work is not necessarily created in the selected period; current state is not historical state-at-date. Cycle time requires trustworthy recorded start/finish events; incomplete legacy history stays qualified.

Support full reports plus selected-section, filtered-register and comparison exports. Compare previous equal periods and prior year with zero-base handling and exact bounds. Drill from every aggregate to the source register/record. Persist scope in validated URLs. Keep personal/team/project reporting pages distinct enough for ordinary users to find their work, without a single endless page of charts. Reuse actual Plane and shell source with transparent adaptation notes.

## 13. Operations missing-product audit

Evaluate the app as a daily company workspace: project creation/settings/membership/ownership; issues and sub-issues; searchable list/board/calendar; task editing and progress; comments and attachments; cycles/modules/views; deadlines and dependencies; escalation and handover; recurring work; meetings and invites; RSVP/change/cancel; reminders and notification delivery; activity history; archive/trash/recovery; workspace settings; permission/error/loading/empty and reconnect states.

Investigate copied methods still calling Django `/api/workspaces/...` endpoints before surfacing their controls. No control should call an absent backend. Verify project creation and its default states as one transaction, atomic work-item numbering, non-destructive label/state removal, actual ordering persistence, and consistent caches after edits. Keep issue dates, timed to-dos and meetings as distinct authoritative sources even when shown in one calendar. A Google-like calendar requires honest timezone, series, guests and reminder semantics; do not claim Google/Outlook sync or device delivery without an actual configured and tested integration.

Prioritize the user's concrete gaps over decorative expansion: edit/update/delete projects and entered work, reliable return navigation, clean-state reset/recovery and comprehensive reports. Add other missing product capabilities through named slices after their backend and permission contracts exist. Each slice has Management and Staff tests against the same synthetic scenario and a read-only live review where production effects would be inappropriate.

## 14. Accounting audit and correction architecture

Review Overview, Payments, Expenses, Commission, Calculator, Payroll, Settings, Reports and all generated documents as separate workflows. Reconcile receipts and approved payments with lead balances and allocations. Preserve the existing single commission formula and distinguish automated earned commission from a manual what-if calculation. Payroll run lines are frozen period records; editing a payee or salary component must not rewrite an already signed run. Manual deductions are not a statutory Ghana tax engine.

Audit create/correct/resubmit/approve/decline/cancel/refund/delete permissions and transactional effects. Drafts may be editable or deletable according to role; approved/posted records need traceable correction/reversal rules. Receipt/share-link validity, uploaded proofs, allocations, reminders, audit rows, client balances and commission must stay consistent. A Finance reset adapter is blocked until these dependencies and the full restore/reconciliation path are proven. It must not leave a deleted test payment feeding totals, the exact failure documented in the earlier Finance plan.

Assess chart of accounts, general ledger, payable/receivable aging, bank reconciliation, period controls, opening balances and export requirements as real gaps. Deliver through separate schemas and reviewed migration phases where required. Do not label collected cash less selected payments/expenses as a statutory P&L, balance sheet or complete cash-flow statement when accrual/ledger data is absent. Research current Ghana-specific payroll/tax requirements from primary authorities before implementing calculations; do not invent rates.

## 15. Report and PDF document contracts

Use one source-of-truth selector/projection per report for screen, CSV and PDF. Every export identifies company, document type, role/privacy scope, period/date basis, exact filters, comparison bounds, generation time, completeness, units/currency and definitions. Full pack and section exports must contain exactly the labelled scope. Numeric values remain numeric in CSV; unsafe text is neutralized; quoting/newlines/Unicode and zero/negative values are tested. Large datasets are paginated or refused as incomplete, never silently truncated.

Operations PDFs need an executive context, project/person/work summary, prior-period comparison, actionable exceptions, inspectable register, schedule/RSVP sections and recorded-change qualifications. Accounting reports need grouped statements, right-aligned money, clear subtotals/reconciliation, status/period basis, unpaid/outstanding versus collected/paid distinctions, section ledgers and comparisons. Payroll registers/payslips are private. Bank instruction letters contain paying account, beneficiaries, accounts, amounts, total and authorized signatory; internal commission rates/caps/client calculations stay out of bank-facing letters, preserving the user's explicit earlier correction.

Use the real logo losslessly, established letterhead, consistent A4 orientation, readable typography, whitespace, repeated identity/table headers, confidentiality and Page X of Y. Keep a heading with its first row, group totals and signatories sensibly, prevent clipped tables/signatures and empty orphan continuations. Inspect every page of representative long, empty, filtered, comparison, portrait and landscape outputs through rendered images, plus downloaded real-account documents. Text extraction or a successful download alone is not visual verification.

## 16. Phases, tests and release gates

### First reset implementation contract (2026-10-16)

The fixed Operations scope keys are `projects`, `todos` and `meetings`. The adapter includes 17 project tables, the separate to-do table and four meeting tables. It rejects new unreviewed incoming foreign keys or application triggers, cross-kind meeting references and a workspace count other than one. Preview expires after 15 minutes; execution rechecks an exact canonical payload and schema fingerprint under bounded graph locks. Snapshots are captured only during execution. Confirmation phrases are `RESET OPERATIONS` and `RESTORE OPERATIONS`. Only the preview's active Management actor may execute it; any currently active Manager may restore a completed batch. Repeated completed operations return their recorded status. No client supplies backup data or SQL.

Restore is an atomic insertion with original IDs, never an upsert. Conflicting identifiers, missing parents or schema changes reject the entire restoration. Business fields are restored; past-due unsent to-do SMS and meeting push markers are marked suppressed at restoration, so recovery cannot trigger catch-up messages. Future reminders remain eligible. Files remain in Storage. A public, read-only Operations generation marker contains no record payload. Open Operations sessions detect a reset/restore on reconnect/focus or realtime and block stale work behind a reload notice, including MobX-backed screens. The reset flow explicitly explains that open Operations screens will need a reload. This avoids silently allowing edits to cleared records or discarding an unsaved form without a visible explanation.

Source review: Plane `apps/web/components/project/delete-project-modal.tsx`, blob `10787fcef23fa4ce379e49b50e4806e3d0d10964` (AGPL-3.0-only), provides its typed project-name/phrase, pending, cancel and error pattern. Palmstead uses its existing licensed shell dialogs and a server-bound impact preview/recovery flow rather than copying incompatible Propel dependencies. This is behaviour/reference adaptation; no additional Plane code has been copied for reset.

Live inspection found no non-internal triggers on the Operations graph. `op_projects_all` and `op_issues_all` currently permit every profile with a non-null key; this is an open authorization defect, not a feature to reproduce. Close it in the Staff action/security slice before adding new project deletion controls. Existing direct to-do and schedule update policies also need immutable-ownership/state review. The reset RPC itself independently requires a fresh active Management profile.

**Phase A — inventory and design:** complete route/layer/action matrix, real schema/FK/trigger/worker graph, current product research, exact reusable source and licence register, then save app-specific contracts. Static audit results remain provisional. This phase is in progress; new reset/CRUD/navigation functionality is not delivered yet.

**Phase B — reset and action security:** implement protected preview/snapshot/reset/restore contracts for the reviewed Operations scopes, ownership/state guards and atomic mutations. Prove anonymous/Staff/inactive/foreign-token/expired/stale/replayed calls fail, and every failure leaves records unchanged. Test graph restoration, reused identifiers, self references, schema mismatch, concurrent edits, timeouts and generated counters. Run destructive scenarios only against isolated synthetic data. On V2 verify Management preview and Staff denial without executing a reset.

**Phase C — UI actions and return navigation:** expose the reviewed Management reset flow and permitted Staff editing/deletion/correction controls, implement the shared return contract and close missing layers in the inventory. Verify all relevant caches and role sessions update consistently. Check desktop/tablet/320–390px, light/dark, long values, keyboard, unsaved changes, pending/error and reconnect cases. Do not declare every app covered until every inventory row has been exercised.

**Phase D — Operations reports and completion:** finish the report contracts in section 12, then close the workflow gaps in section 13, preserving existing functional source. PDFs get full and section/filtered/comparison QA. Workload counts are not employee performance ratings.

**Phase E — Accounting:** perform its fresh end-to-end audit, execute reviewed correction/reset integrity work, then reporting and all PDFs with appropriate private/internal/bank-facing variants. Expand missing accounting foundations through separately verified phases.

**Release gate for each slice:** clean typecheck/production build, relevant pure and isolated database tests, actual Management/Staff browser evidence, downloads/render review, recorded limitations, explicit app scope, Git tree verification and rebuild publication. Read DEPLOY_INSTRUCTIONS in full before each V2 deployment. Reload live roles, verify actual new content/exports, inspect bounded errors and record release IDs. A connector error is not a team-role diagnosis; use the correctly scoped authorized CLI where supported. Never claim the full programme complete on the strength of one passing screen or plan.
