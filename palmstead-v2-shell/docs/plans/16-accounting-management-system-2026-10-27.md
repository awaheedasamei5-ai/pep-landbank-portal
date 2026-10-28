# Accounting management system — governing plan

## 28 October 2026 implementation note — budgets and requests

The current slice adds annual department/category budget drafts with revision numbers, separate Head of Finance activation, an active plan per scope, and a Staff request register. Management configures department membership, approvers and named direct-to-Finance exceptions. Request drafts are editable with a revision check. Submission routes departmental requests to a different HOD and approved exceptions directly to Finance. HOD forward/return/reject and Finance approve/return/reject are server-authorized; every transition records actor, timestamp, note and request snapshot. Final approval captures the precise budget revision, actor and time. An approved departmental request counts as a **commitment**, with a lock and hard budget limit. It is never called paid or deducted from a bank/cash vault. Legacy `fund_requests` and `expenses` remain untouched and are not silently reclassified. Database rollback-only checks passed for the chain, self-approval denial, over-budget rejection, direct-route authorization, approval snapshots and unrelated Staff isolation; they left no QA records. A preview browser journey confirmed Adams draft → HOD queue → Finance queue → Management approval → GHS 25 committed against a GHS 100 QA plan. The temporary fixture was then fully removed and all new finance data tables returned to zero rows. Production release remains to be verified.

Still required before this programme is complete: actual expense and payment settlement links, private attachments, project/task and recipient fields, monthly budget distribution, configurable threshold and exception policy, full searchable/paginated registers, PDFs/reports and vendor/payroll/transport work. The new budget screen displays committed and remaining only to Management or approvers who can see the underlying requests; all actual/paid figures await canonical settlement records. Do not enter real budgets or roles as a test fixture.

Status: research and architecture approved for phased implementation; **not a claim that the features below are already built**. Written 27 October 2026. This plan supersedes the limited scope in `04-finance-app-plan.md` and `05-accounting-app-blueprint.md` for future Accounting work. Do not use older “done” labels as evidence for the new requirements.

## 1. Product boundary and existing assets

Palmstead V2 is the only implementation target: Next.js 16 dashboard on the `rebuild` branch, V2 Supabase project `sbydzrlzqxcdbudjaube`, Vercel project `palmstead-v2-shell`. Never change V1 `main` or its database. The current `/dashboard/finance` has Overview, client Payments, Installments, Expenses, Commission, Payroll, Reports, Settings. Its useful assets include the existing approved client-payment flow, receipt links, PDF primitives, payroll salary-component snapshots, and the application's profile/permission system. Preserve working flows while replacing the shallow finance model.

The current schema has `profiles.department`, `fund_requests`, `expenses`, `expense_categories.monthly_budget`, `payments`, `payroll_staff`, `payroll_salary_components`, `payroll_runs` and `payroll_run_lines`. `fund_requests` has a single status/decision and no department route, and `expenses` has one Management decision. There are no dedicated vault, vendor, transport or department-budget tables. At the start of this plan V2 had eight active profiles and zero payroll payees. The bank-instruction sample is an A4 company-letterhead document with a dated bank addressee, instruction paragraph, beneficiary account/bank/amount table, total, and CEO signature. It contains real private payroll and banking data; do not commit its content or copy bank numbers into fixtures.

### Accounting truth model

Keep four distinct concepts, with separate timestamps and audit trails:

1. **Plan:** approved department budget and revisions. It does not hold cash.
2. **Commitment:** approved spending request or purchase order against the plan. It reserves available budget, not a bank balance.
3. **Obligation:** verified supplier bill, payroll liability or reimbursable employee claim. It is due but may be unpaid.
4. **Movement:** confirmed bank/cash deposit, internal transfer, disbursement or receipt, backed by evidence and reconciled to a statement/cash count. Only this changes the vault's book balance.

A request marked approved must never appear as paid. A bank-to-cash transfer must decrease bank and increase cash by the same amount, and must not increase expense. A vendor invoice and its later payment must not be counted twice as expense. Financial corrections use a reversal/new posting, never silent deletion of posted history. Currency starts with GHS; schema should carry a currency column and explicit exchange-rate support before multi-currency is exposed.

## 2. Research and reuse decision

- [ERPNext Payment Entry](https://docs.frappe.io/erpnext/payment-entry), [Accounting Entries](https://docs.frappe.io/erpnext/accounting-entries) and [Bank Reconciliation](https://docs.frappe.io/erpnext/bank-reconciliation) establish separate payment, ledger and reconciliation documents. Adapt those flows into Palmstead's Postgres transactions; do not import Frappe/Python runtime.
- [ERPNext Budget](https://docs.frappe.io/erpnext/budget), [Budget Variance Report](https://docs.frappe.io/erpnext/budget-variance-report), and [Budget Revision](https://docs.frappe.io/erpnext/budget-revision) distinguish budget control, actual spending, and versioned amendment.
- [ERPNext Workflows](https://docs.frappe.io/erpnext/workflows) supports role-based multi-stage transitions and approval conditions; use an explicit transition table and server-side authorization instead of client-only status buttons.
- [Frappe HR Payroll Entry](https://docs.frappe.io/hr/payroll-entry) and [bank entry](https://docs.frappe.io/hr/payroll-articles/make-bank-entry-from-payroll-entry) separate salary generation/signoff from bank settlement. The existing Palmstead run/line snapshot is a base, but its `paid` state needs an evidenced bank movement.
- [Bigcapital](https://github.com/bigcapitalhq/bigcapital) is the most relevant open-source double-entry/reporting reference and has an AGPL-3.0 license. Its backend and frontend are a separate stack. **Do not copy AGPL source into this proprietary/custom V2 shell without license review.** Its chart-of-accounts, bills, payments and reports are architectural references.
- [ERPNext accounts source](https://github.com/frappe/erpnext/blob/develop/erpnext/accounts/README.md) shows general-ledger and payment-ledger structure; Frappe is also a workflow reference rather than a literal merge candidate.
- The already-forked shadcn dashboard shell and existing Palmstead `finance-v1` chart/table components are the directly portable UI code. Preserve provenance of any new third-party source and its license in this plan before copying it.

## 3. Navigation and information architecture

The Accounting home should answer, at a glance, “How much cash is available, what is committed, what is due, what needs my decision, and what changed?” Use a cash-position strip, approval inbox, due-payment list, budget variance chart and ledger preview. Every number drills to the exact filtered register. Desktop gives a compact left section rail or logical tabs; mobile uses short section navigation and stacked summary rows, with tables scrollable inside their own containers. The same theme tokens as the dashboard shell apply to every panel; no detached white canvas or fixed overlay over content.

Recommended page layers, not one long screen:

| Layer | Management/Finance | Head of department | Staff |
|---|---|---|---|
| Home | cash, commitments, payables, decisions, exceptions | department budget, request inbox | my requests, reimbursements, transport |
| Vaults | bank/cash registers, transfers, reconciliation, count sheets | read-only department allocation where granted | no company balances |
| Budgets | department plans, revisions, forecasts, variance | own department budget and commitments | request available context without sensitive totals where policy allows |
| Requests | all queues, approval timeline, exceptions | screen routed departmental requests | create/track/amend own draft requests |
| Vendors | vendor directory, bills, payment batches, receipt evidence | view project-linked obligations if granted | no general vendor ledger |
| Expenses | post-payment expense register and claims | department expenses | own claims and attachments |
| Payroll | roster, components, runs, restricted bank instructions | no salary register by default | own issued payslip only after release |
| Transport | roster, monthly targets, weekly allocation calendar, issue/payment history | own department summary only if granted | own weekly allocation/history |
| Client receipts | existing sales payment/receipt flow | only existing sales permissions | existing sales permissions |
| Reports | financial statements, comparisons and drill-through | own department budget/spend | own requests, expenses and transport |
| Settings | permission assignments, approval routes, vaults, departments, categories, payment policy | delegated departmental approver settings only if granted | personal preferences only |

Each register has search, status/date/department filters, saved URL state, totals from server-filtered rows, export scope preview, and detail page with timeline, evidence and Back link. Mobile detail pages must retain a clear return path. Empty/error/loading states must explain the next allowed action. On every page, amount labels disclose whether they mean approved, committed, posted, paid, or reconciled.

## 4. Identity, organizations and permissions

`profiles` is the staff identity source. A new active profile should become selectable in all staff-linked modules automatically. Payroll and transport rosters should create placeholder links for active staff, but **never fabricate bank details, salary, monthly allowance or eligibility**. Inactive staff stay in historical documents and cease appearing in new runs. Existing manually entered non-staff payees remain separate.

Create an explicit `finance_departments` catalog with stable IDs and a migration map from `profiles.department` text. Assign staff to a department with effective dates; do not reinterpret a historical request after someone transfers. Create `finance_role_assignments` with `actor_key`, scope (company/department/vault), role (finance_head, finance_operator, department_head, budget_owner, payroll_admin, auditor), effective dates, grantor, reason, and audit. UI may configure assignments, but every read and transition checks active server-side role and scope. No security decision from editable user metadata or browser state. Emergency admin override requires a reason and explicit journal entry. Management role alone does not imply payroll bank-detail access unless deliberately retained by policy; initial V2 compatibility may keep Management payroll access until assignment is configured.

Permission matrix (final policy in server functions/RLS, not just UI):

| Action | Staff | Department head | Finance operator | Finance head | Payroll admin | Auditor |
|---|---:|---:|---:|---:|---:|---:|
| Create own draft request | yes | yes | yes | yes | yes | no |
| Screen department request | no | scoped | no | exception | no | no |
| Approve finance request | no | no | no | yes | no | no |
| Enter payment evidence | no | no | assigned | yes | restricted payroll path | no |
| Confirm/reconcile bank movement | no | no | separate assigned role | yes | no | read only |
| View vendor bank details | no | no | limited | yes | no | masked unless audit grant |
| View all salary/bank details | no | no | no | policy-granted only | yes | scoped read only |
| Edit settings/role chain | no | no | no | yes with audit | no | read only |

Separate creator, departmental screener, final approver and payment recorder when staff count permits; self-approval is denied by default. If a small team cannot separate all duties, show a named exception approved by a higher role, and audit it. Privileged actions require fresh server identity; use RLS plus guarded RPCs/route handlers. Private document storage uses short-lived signed URLs and per-object authorization. Do not place receipt bytes or bank numbers in browser logs, public tables or open PDF links.

## 5. Vault and general-ledger foundation

Bank vault and cash vault are **accounts**, not freely editable number fields. Bank vault can fund cash vault through an internal transfer. Each vault has an owner/custodian, account type, currency, opening balance evidence, status and visibility policy. A vault register shows opening + confirmed inflows - confirmed outflows = closing book balance. A cash count is separate evidence; the difference is an exception until investigated. The company may have multiple bank and cash accounts. Department cash allocations are sub-ledger budget envelopes or assigned cash floats; they must not duplicate the physical cash balance.

Create private finance schema or locked public tables for `finance_accounts`, `finance_transactions`, `finance_postings`, `finance_periods`, `finance_reconciliations`, `finance_reconciliation_lines`, and `finance_attachments`. Every posted transaction has immutable balanced debit/credit lines, idempotency key, effective/posting timestamps, source document type/id, actor, and reversal link. Unique source keys prevent double-posting. `numeric(18,2)` or integer minor units, never JS floating-point for authoritative totals. Posting happens in one DB transaction with row locks and balance/invariant checks. Draft can be edited; posted can only be reversed by a privileged user with reason, then reissued. A closed period blocks new backdated posts absent a controlled reopening action.

Do not retrospectively fabricate bank openings from the current client `payments` or `expenses`: inventory and reconcile their legacy records first. Mark pre-ledger historical data as imported/unreconciled and carry an explicit opening-balance document. Client receipts post once to bank/cash and receivables only after existing approval; legacy totals need source reconciliation to avoid counting them twice. A budget transfer changes plan allocations, not bank cash. A bank-to-cash transfer posts two balance-sheet sides, not an expense.

## 6. Department budgets and request lifecycle

Budget setup: period, department, expense category/project/task, approved amount, available/committed/actual, revision chain, approvers and thresholds. A department can have an annual plan distributed monthly/quarterly. Final approval snapshots amount, scope and policy version. Over-budget warning or hard stop is configurable; exceptions record who approved and why. Forecast is actual + open commitments + proposed requests, with different visual treatment.

Request input: purpose, amount, category, department or direct-to-finance route, project/task reference, needed-by date, payee/recipient, supporting attachments, requester, and funding vault preference. Validate positive amount, dates, allowed category, file type/size and available policy before submission. Drafts are editable by requester. After submission an amendment creates a version and resubmits; earlier decision history survives.

Canonical states: `draft → submitted → hod_review → finance_review → approved → payment_preparation → paid → reconciled`, with `returned`, `rejected`, `cancelled`, `partially_paid` branches. A request with no department route goes `submitted → finance_review`; policy defines eligible direct-route categories/people, not an arbitrary staff checkbox. HOD may recommend/return/reject but cannot mark paid. Finance head approves or rejects, may approve a smaller amount, select vault and set conditions; payment operator records actual payment reference, amount and proof. Partial payment creates separate payment movements and remaining obligation. Every transition writes an append-only event with actor, timestamp, prior/next state, comment, approval authority and snapshot of relevant policy. Notifications point to the exact record and do not imply approval by merely opening it.

The existing `fund_requests` and `expenses` should be mapped with migration-safe links, not replaced by blind copying or destructive rewrites. An old `approved` expense does not prove bank settlement. Its receipt/evidence fields are inputs to a migration/reconciliation queue, not proof of a new vault debit. Existing pending fund requests keep their original identity; new workflows start from a dated cutover.

## 7. External vendors and accounts payable

### 2026-10-28 vendor implementation boundary

**Release state:** The directory and bill review register shipped to V2 production in #52 (`79b8ea0`). It supports drafts, submission, independent Finance decisions, case-insensitive vendor invoice uniqueness and append-only decisions. Its bill approval does not post a liability or record a payment. Exact preview and production checks passed for Management and Adams, and named QA data was removed.

**Next settlement design gate:** Expand `finance_vault_journals` and its two-line balancing rules for a vendor obligation (expense debit, accounts-payable credit) posted atomically with bill approval, then for each confirmed part-payment (accounts-payable debit, source bank/cash vault credit). Keep a unique bill→obligation link and payment idempotency key. Lock the bill and source vault in stable order; reject payment exceeding the bill's unpaid balance or the vault's book balance. A reversal must create opposite lines and restore the outstanding amount without editing posted rows. Require a private PDF/JPEG payment-proof object and bank/cash reference before recording settlement; do not treat a typed reference or a bill approval as bank verification. Pair every payment with actor, effective date, posting time, source vault, evidence and an audit event. Render due/overdue buckets from approved bill amounts minus unreversed payments. Guard upload/download with Storage RLS, a private bucket and short-lived links. Test partial, exact, duplicate, concurrent, overdraft, overpayment, role, reversal and attachment-access cases before release. [ERPNext Accounts Payable](https://docs.frappe.io/erpnext/accounts-receivable-and-payable) defines due-date aging from outstanding amounts; [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) and [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) establish the private attachment pattern. Do not copy ERPNext source or expose service keys in the browser.

ERPNext's [Purchase Invoice](https://docs.frappe.io/erpnext/purchase-invoice) and [Payment Entry](https://docs.frappe.io/erpnext/payment-entry) distinguish the vendor's invoice date/reference, approval/posting, outstanding amount, and separate partial settlement. The open [ERPNext Purchase Invoice source](https://github.com/frappe/erpnext/blob/develop/erpnext/accounts/doctype/purchase_invoice/purchase_invoice.py) informed field and duplicate-reference checks; its Python implementation is not copied into this Next.js/Supabase codebase. The first Palmstead vendor slice establishes a role-scoped directory and draft→submitted→Finance approved/rejected bill register, with creator/approver separation and immutable event snapshots. An approved bill is expressly **not paid** and is not yet posted to the vault ledger. Private evidence uploads, verified vendor bank details, payments/partial payments, ledger liability/cash entries, and payable aging are later gates; no UI may imply these have happened. Never infer a vendor payment from a bill approval.

Vendor directory: legal/trading name, contact, tax registration where applicable, bank details stored with restricted visibility, default expense category, active status, duplicate-match hints, change history. Vendor onboarding/change to bank details needs a second-person check where possible. Vendor invoices/bills have vendor reference, invoice date, due date, PO/project/department, line items, attachments, approval, partial-payment capacity, taxes entered/validated as applicable. A duplicate key across vendor + invoice number + amount/date prevents accidental double payment but offers a reviewed exception.

This flow is distinct from staff requests. A bill creates an obligation after verification; scheduled payment is prepared by finance, approved by the authorized finance role, then marked paid only with bank/cash evidence. Attach JPEG/PDF receipt to the payment and, separately, invoice evidence to the bill. The payment register must link each part-payment to the bill and vault posting. Show aging by due date and vendor; reminders for upcoming/overdue bills can be introduced after notification preference and duplicate suppression are in place.

## 8. Payroll and transportation

### Payroll

Staff roster auto-links from active `profiles`. Finance/Payroll admin fills confidential salary components, effective dates, payment method and verified bank details. Unknown salary remains blank and cannot be silently interpreted as zero pay. Generate a monthly immutable run snapshot; validate missing accounts, duplicate payees, negative net, inactive staff, overlapping effective dates and unusual changes against prior month. A separate reviewer signs off. `signed_off` means approved for payment, **not paid**. Create a payment batch from the signed run, reserve the bank vault, then record actual bank reference and posting. Only after settlement mark lines paid and issue staff payslips. Bank rejection/partial batch needs explicit exception and retry, not another full run.

The supplied September sample is a **bank instruction letter**, not a staff payslip or full payroll audit report. Its layout should remain recognizably formal: company letterhead and authentic logo, date, bank branch/addressee, subject, debit account (masked in app preview, complete only on restricted export), numbered beneficiary/bank/account/net amount table, total, charges instruction and authorized signature. Add generated reference, approved run ID/period, approval/signature timestamp, page x/y, currency, and a confidential footer. Validate sum of displayed rows against approved run net and bank batch amount. PDF must page gracefully and never split a payee row. Staff payslip is separate, with earnings/deductions, net, period and no other staff details. General reports redact individual salary unless user has payroll scope.

### Transportation

Transportation is its own finance layer, not a salary component by default. Finance sets each staff member's **monthly transport target** in a versioned effective-date setting. A month has 4 or 5 configured payout weeks based on a published company rule (for example Monday-start weeks that contain a payout date); settings must preview the exact payout dates before generation. Generate allocations in pesewas with `sum(weekly amounts) = monthly target` for each eligible staff member. Deterministic seeded allocation produces varied weekly values within configurable min/max and fairness bounds; regenerate only draft months, and do not change issued/paid weeks. If positive target and multiple weeks make variation mathematically impossible at cent precision or bounds conflict, show an explicit validation error rather than break the total. The last-week remainder is calculated from exact minor units; run both sum and variation checks. Across months, rotate seed/order to avoid a fixed pattern. Allow a permitted override with reason and an automatic redistribution of the remaining unissued weeks preserving the month total. Track scheduled, approved, paid, failed and reversed separately, with bank/cash vault source and payment proof.

Staff sees only their allocation and payment history; Management sees roster, monthly target vs scheduled/paid, weekly distribution, exceptions and PDF/CSV exports. A future hire is auto-present but has **unset** target until finance configures it; a leaver stays in history. Mid-month join/leave/proration requires an explicit policy choice, recorded on the run. Do not make transport an automatic taxable salary item without an approved payroll/tax policy.

## 9. Reports and export contract

Reports use the same canonical postings/workflow events as the registers, not independent client-side arithmetic. The report builder selects section, date basis (request/submission/approval/payment/posting), period, department, vault, vendor, staff, category/project, status, and comparison period. The summary always displays active filters and data freshness. Predefined reports: cash position and movement, bank/cash reconciliation, income/expense/P&L, budget vs committed vs actual vs paid, request funnel/turnaround/aging, vendor spend and payable aging, payroll run variance/headcount, transportation target vs paid, client collections/receivables, and exception/audit register. Management charts include monthly trends, stacked category mix, waterfall from opening to closing cash, budget variance, vendor concentration and due buckets. Charts are paired with numeric tables and accessible text summaries. Drill-through from chart segment to exact source transactions.

Every export has a scoped preview and section-only PDF/CSV as well as full pack. Server applies the exact same role filters to preview and export. Long reports paginate; no row truncation hidden behind a chart. PDF design: company identity/logo, report title, period, scope/filter summary, currency, generation timestamp/time zone, prepared-by, confidentiality level, executive narrative with definitions, charts with labels, grouped detail tables, totals/reconciliation and approval/audit appendix when relevant. A bank instruction is a restricted letter, not the same format as an internal management report. Payment receipt references only the actual payment; a request approval PDF says “approved” but not “paid.” Download access and event are logged. Sensitive bank fields are masked in routine reports and shown only on explicitly authorized bank-instruction exports.

## 10. Data, API and security implementation rules

Use server-side transactional functions for submit/decide/post/transfer/reverse. Every mutating request carries expected version and idempotency key; stale writes fail visibly. Lock account/budget rows in stable order for concurrent approvals and transfers. DB constraints enforce nonnegative money, unique external references where appropriate, balanced postings, valid state transitions and immutable posted rows. Keep `SECURITY DEFINER` routines in a private schema with fixed `search_path`, explicit `auth.uid()`/profile verification and narrowly granted invoker wrappers; revoke default PUBLIC execute. Exposed tables have RLS with row and action scope, and bank/compensation data live in private or tightly RLS-gated tables. Use private Storage buckets with object path bound to record/actor, signed links and malware/type/size checks. Logs and audit records store IDs and actions, not raw receipt bytes or full account numbers.

Reconcile rather than overwrite. Bank import (CSV first) stores statement hash, account, source row, date, amount/reference; deduplicate by statement+row fingerprint. Match posted entries, surface unresolved lines, record clearance and signed period close. A balance is labeled “book” until reconciled. Realtime invalidation updates dashboards after a committed action, but correctness never depends on websocket delivery. Background reminders use durable outbox/idempotency and quiet retry with delivery status; no SMS or payment automation fires merely because a draft was created.

## 11. Phased delivery and acceptance gates

Each phase is reviewed in local/type checks, V2 rollback-only database authorization checks, Management and Staff browser flows, mobile light/dark, exact Vercel preview, then merged to `rebuild` and verified at the production alias. Use a named test fixture, clean it and confirm zero retained test business records. Do not send real SMS or initiate a real bank payment in tests.

1. **Foundation:** staff roster synchronization, role/dept catalog and Finance settings shell. Verify new/renamed/inactive profile behavior, blank bank/salary, historical identities and role denial. This is the first implementation slice.
2. **Vault ledger:** bank/cash account setup, opening evidence, immutable balanced postings, internal transfer and balance/reversal. Verify concurrent transfers, insufficient-funds policy, and double-submit idempotency.
3. **Budgets and requests:** department setup, versioned budgets, direct-route policy, HOD/finance chain, actor separation, commitment accounting, detailed timeline and PDFs. Verify all transition branches with role fixtures.
4. **Vendor payables:** directory, invoice/receipt documents, duplicate screening, approval, partial/full payment and aging. Verify vendor-bank-change authorization and private attachment access.
5. **Payroll:** roster linkage, salary/run review, bank batch and settlement, staff payslip, sample-shaped bank instruction letter, exceptions and restricted exports. Compare PDF totals against immutable run and vault posting.
6. **Transportation:** monthly targets, weekly variable allocation algorithm, overrides, payout workflow and PDF/CSV. Verify exact cent totals for 4/5 weeks, no identical weekly schedule when feasible, join/leave policy and rescheduling after partial payment.
7. **Reports/reconciliation:** all section filters, comparisons, charts, complete PDF packs, CSV, statement matching, period close. Reconcile cash and expenses to source postings and catch any discrepancy before release.
8. **Cross-app and hardening:** client receipts/allocations/pipeline share canonical transaction IDs; operations project costs bind to approved requests/vendor bills; role matrix review, backup/restore rehearsal, monitoring and migration of legacy finance rows with reconciliation signoff.

Release notes must say what each phase actually includes; never mark the whole system complete after a single phase. No production data reset is implied by this plan. Management will set role holders, vault openings, actual salaries, staff transport targets, approval thresholds and the treatment of Ghana payroll taxes before those money flows go live.

## 12. Immediate gap register

| Gap | Current state | Required control |
|---|---|---|
| Payroll roster | no linked payees despite active profiles | auto-link active profile, blank financial fields, manager-only roster |
| Department chain | one-step `fund_requests` and `expenses` | HOD screening plus Finance final approval and audited exception route |
| Vaults | absent | balanced bank/cash account movements and reconciliation |
| Vendor payments | absent | separate AP directory/bill/payment evidence lifecycle |
| Budget | category monthly amount only | versioned department/project/category plan and variance |
| Transport | absent | per-staff monthly targets and varying exact-sum weekly schedule |
| Payroll settlement | generated/signoff/paid labels without vault link | signed run → bank batch → actual evidence/posting → paid |
| Reports | section/date exports but no canonical ledger | complete scoped analytics, comparisons, drill-down and reconciled PDFs |
| Attachments | legacy base64 on expense/request rows | private object storage, access audit and immutable evidence links |
