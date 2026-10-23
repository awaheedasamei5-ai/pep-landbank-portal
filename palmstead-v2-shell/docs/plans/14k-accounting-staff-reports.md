# Accounting Phase K — Staff reports

## Goal

Make the Accounting Reports section useful to Staff while preserving the existing Management report builder. Staff can run and download Payments, Expenses, and Commission reports for their own records. Staff do not get the company summary or payroll register in this phase.

## Product and source research

- ERPNext's [Accounting Reports guide](https://docs.frappe.io/erpnext/accounting-reports) starts from the user's question, separates transaction-detail reports from financial statements, and expects filters to preserve exact scope.
- Supabase's [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security) explains why every user's row access must be enforced in the database, not only hidden in the UI.
- The V2 schema inspection on 2026-10-23 found: Payments `SELECT` is own `agent_key` or Management; Expenses `SELECT` is own `logged_by` or Management; Commission's definer RPC narrows non-Management calls to the active user's key; Payroll tables currently have Management-only policies.
- These reports use the already-ported V2 Accounting code and existing branded PDF builders. No additional repository source is needed for this slice.

## Scope and behavior

- Give Staff a “My reports” builder with Payments, Expenses, and Commission sections, quick ranges, custom date bounds, live preview, and section-specific PDF download.
- Keep Management's existing summary, payment, expense, commission, and payroll sections.
- Select only company name and logo for Staff PDFs; never request company bank details for the Staff reporting view.
- Keep payroll and the cross-section company summary unavailable to Staff until separately reviewed and proven safe.
- Scope report query caches by signed-in profile and role so a prior Management query cannot be reused after an account switch.
- Show loading and access/query errors explicitly; do not create an empty PDF after failed data access.

## Verification gates

- Staff role: own payment rows only, own expense rows only, own commission result only; no payroll or summary option; no other staff names or amounts in UI/PDF.
- Management role: confirm all original report sections and download actions remain available.
- Download and inspect the three Staff PDFs for date scope, company identity, approved/status totals, and no bank instructions or other staff records.
- Verify profile switching does not reuse Management report caches; check narrow mobile layout and errors.
- Run build and role tests, deploy only after the exact Git-connected preview is READY and the current deployment instructions are followed.

## Current state

The role-specific builder, limited company-config selection, error states, and identity-scoped report caches are on the isolated preview branch `codex/accounting-staff-reports-20261023`; Vercel reports its deployment READY at `https://palmstead-v2-shell-git-codex-accounting-sta-b5953f-dnm-garments.vercel.app`. On that exact preview, Staff signed in as Adams and saw only Payments, Expenses, and Commission, with own-record scoping and no payroll/summary option. Management signed in and retained Financial summary plus all five original report sections. The Staff Commission and Management Summary PDF actions were invoked; the browser-download UI prevented direct inspection of the saved artifacts, so PDF visual/content QA remains open. No business records were changed. `npx tsc -b --pretty false` passes. A local Turbopack build is blocked by the worktree's external `node_modules` junction; the Vercel preview build itself is READY.

### 2026-10-23 Accounting Staff reports PDF correction

- Generated an isolated synthetic 90-row Staff Payments PDF using the current builder. The three-page A4 output contains all 90 rows, correct approved total (GHS 103,600.00), distinct page 1/3 through 3/3 footers, and no replacement glyphs in extracted text. Rendered pages 1–3 and visually inspected the first, continuation, and final pages.
- Fixed punctuation that jsPDF's default fonts did not render reliably; removed the redundant “No entries” line before total-only Overall/Net rows; added guarded page breaks and continuation headings to the shared ledger section so large groups cannot run into the footer.
- TypeScript passes. The preview branch's Vercel CI reported success for this PDF correction; latest live file-download inspection is still open because the Vercel connector denies the team scope and the attached browser-control session timed out. This remains preview-only and must not be called a completed production release.
