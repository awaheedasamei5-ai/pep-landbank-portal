# Operations Tracker Reports: comparison and analytics completion plan

**Status:** research and implementation plan, 2026-10-22  
**App:** V2 Operations Tracker only  
**Related contract:** `docs/plans/06-operations-reports-plan.md`

## 1. Objective and decision

Complete the Operations report experience so management can select a report section, filter the included work, compare meaningful periods and staff workloads, inspect the records behind each result, and export exactly that scope to a professional PDF or CSV. Staff must be able to report on their own assigned work and compare their own periods without seeing colleagues or management controls.

The existing `/dashboard/operations/reports` route is a useful first report register, not a complete analytics system. It already has report-type, date, project, status, priority and management assignee filters; manager/staff scoping; summary values; a workload table; CSV; and PDF. It currently lacks a previous-period/year-over-year selector and deltas, time-series visualization, clear date-basis treatment across mixed summary metrics, shareable/persistent filter state, and deep links from aggregate rows. The PDF repeats the summary/register but lacks a comparison narrative and meaningful visual trend. The page has no separate report-section navigation beyond report type. These gaps are the next implementation target.

This phase does not invent missing history. `op_issues` has current state, created/completed/due dates, assignees, projects and priorities, but no complete immutable state-change history. Therefore we can report created/completed/due counts over time and current backlog snapshots. We must not claim historical open-state, historical overdue, cycle time, lead time or throughput unless the persisted event records can prove the relevant dates and transitions. Any future history-aware report needs its own completeness contract and backend data review.

## 2. Product research and patterns to adapt

Research on 2026-10-22:

- Plane Analytics offers workspace/project/cycle/module scopes, issue state breakdowns, created-versus-resolved trends, configurable measure/slice/segment analysis, and CSV export. Its dashboards recompute from current work and pair charts with issue tables. We adapt the visible scope, drillable breakdowns, and data table, but do not copy unavailable Pro modules or Plane's backend. [Plane Analytics](https://docs.plane.so/core-concepts/analytics) and [Plane dashboards](https://docs.plane.so/dashboards).
- Linear Insights lets a user define a measure, slice and optional segment; shows a graph plus a corresponding table; offers explicit time grouping and CSV export. Its issue exports retain stable identifiers and useful lifecycle/project fields. We adapt scoped filters, defined measures, graph/table parity and robust exports. [Linear Insights](https://linear.app/docs/insights) and [Linear export fields](https://linear.app/docs/exporting-data).
- Asana dashboards distinguish project, portfolio and organization-wide audiences and recommend dashboards for progress, workload and blockers. We adapt audience scope and a small number of useful charts rather than a freeform dashboard builder. [Asana reporting dashboards](https://help.asana.com/s/article/reporting-with-dashboards).

Design decision: build a focused Operations Reports workspace with report sections (Overview, Trends, Workload, Register), a persistent shared filter model, and a small stable set of charts and ranked tables. Use semantic theme colors and the existing table/chart components. Avoid generic metric-tile walls. The register remains the evidence behind the analytics.

## 3. Roles, data scope and privacy

### Management

- Manager can select company, project and staff scope; compare selected staff or retain a company roll-up.
- Every staff comparison shows assigned workload and delivery counts with definitions. Counts are volume signals, not quality, productivity or effort scores.
- Multi-assignee issues count once in company-wide unique issue totals and once for each assigned person in per-person workload. Label this everywhere the comparison is exported.

### Staff

- Derive identity from the signed-in profile and filter assignment rows to the current agent key before loading issues, aggregating, rendering, or exporting.
- Staff receives personal time comparison and personal trend only. No person selector, colleague labels, team ranking, or cross-staff data in UI, PDF, CSV, query caches or URL parameters.
- Existing broad `op_*` read policies are not treated as authorization for reports. If the report backend changes, enforce identity server-side and review RLS independently.

## 4. Definitions and comparison rules

- **Created:** `created_at` falls in the selected date interval.
- **Completed:** `completed_at` falls in the selected date interval.
- **Due:** `target_date` falls in the selected date interval.
- **Current open:** present state group is neither completed nor cancelled. This is a snapshot and ignores report date selection.
- **Overdue now:** currently open with due date before the organization's current local date. This is a snapshot and ignores comparison period.
- **Unassigned now:** currently open with no assignee row. This is a snapshot.
- **Period comparison:** compare the selected inclusive date interval with the immediately preceding interval of equal length; optionally offer same interval previous year when calendar-valid. Show both dates, absolute difference and percentage difference. When prior value is zero, show “New” or an absolute change; never divide by zero or show an infinite percentage.
- **Trend:** daily for ranges up to 31 days, weekly up to 120 days, monthly beyond that. Plot created and completed counts as separate series. Never infer historical status from current status.
- **Filter interaction:** project/status/priority/person filters apply to the event cohorts (created/completed/due). Current snapshot measures remain labeled “now” and must not be described as belonging to the selected historical period. Report type switches preserve the other filters.
- **Boundary behavior:** use date-only inclusive ranges and explicit local timezone semantics; timestamp comparisons use half-open intervals or an identical normalized date-only method. Add tests for daylight changes, timezone offsets, leap years, empty values and prior-year dates.

## 5. Query and calculation architecture

The existing report loader paginates assignments/issues/lookups in batches of 1,000. Preserve completeness handling and explicit selected columns. Refactor pure calculations out of the screen into route-local helpers so date grouping, comparison windows, aggregation and export shaping are independently testable.

Proposed files:

- `_components/operations-report-model.ts`: validated filter shape, date windows, report definitions, pure metrics and trend/comparison builders.
- `_components/use-operations-reports.ts`: identity-scoped query and lookup loading; no caller-provided role or agent key is trusted for access.
- `_components/operations-reports-screen.tsx`: compose the report sections and filters; keep presentation logic out of the data loader.
- `_components/operations-reports-charts.tsx`: one created/resolved trend and a status/priority distribution using existing installed chart library/components.
- `_components/operations-reports-export.ts`: CSV/PDF formatters using existing jsPDF/autotable and `pdfReport` helpers.

Do not add a new dependency or schema migration for first implementation. Keep management and staff query keys distinct and ensure a user change invalidates prior-scope cached data. Watch PostgREST page caps and preserve full pagination; do not silently truncate. The client-side scope is a UX safeguard only and must match database access policy.

## 6. Page architecture and interaction details

1. Header: “Operations reports”, audience-aware explanation, selected scope, generated/as-of context, PDF and CSV actions.
2. Report sections: Overview; Trends; Workload (manager only; for staff, Personal progress); Register. Use tabs/segmented controls with direct links or query-state restoration.
3. Filter panel: report/event metric, date range and presets, project, status, priority, manager-only staff selector, comparison mode, reset and active-filter summary. On mobile this becomes an expandable labeled filter panel; controls wrap without overlapping the work area.
4. Comparison summary: current and previous range displayed side by side with absolute and safe percentage change; label the event measure and filters used.
5. Trend chart: created vs completed by adaptive time bucket; accessible chart description/table equivalent and no misleading interpolated history.
6. Workload: manager-only table with open now, overdue now, created in period, completed in period, due in period and change against previous period. A staff row selection drills into the register with filters preserved.
7. Register: rows explain all totals; stable sort and paging if needed; issue/project/state/priority/assignee/date fields; clear no-data and loading/error states.
8. URL: serialize only validated non-sensitive filters (type, dates, project ID, state, priority, comparison mode, manager staff key) so reload/back preserves the report. Staff URL values cannot expand data scope; ignore person keys for staff.

## 7. PDF and CSV specification

PDF uses the existing branded header/footer and A4 portrait/landscape only when the register requires it. Page one includes title, company/app identity, scope, as-of timestamp, exact current and comparison periods, filters, metric definitions, compact period comparison and a legible trend graphic or table. Following pages contain staff comparison (management only) and a complete issue register, with repeated table headers, stable identifiers, page number/total and filter context. Prevent orphan section headings and clip/overflow; long names and titles wrap. Empty reports still show the selected scope, filters and “no matching records”.

CSV contains the exact filtered register with stable headers and UTF-8 BOM. Include issue identifier, title, project, state, priority, allowed assignees, created, due and completed dates. Add report scope and filter metadata either in a documented preamble or a separate summary export; do not make the rows unparsable. For comparison, expose a section summary sheet/file or clearly named columns with current/prior counts and delta. Escape commas, quotes, and line breaks. Management exports may include selected staff names; Staff exports only “You”. PDF and CSV must derive from the same filtered issue cohort as the on-screen table.

## 8. Implementation phases and gates

### Phase A — inspect and specify

- Re-read `docs/CONTINUE_HERE.md`, `AGENTS.md`, this plan and plan 06.
- Inspect the full current report screen, route/navigation and existing chart/PDF wrappers. Verify current V2 issue/state/assignment schema and count limits.
- Confirm current uncommitted/remote `rebuild` state using GitHub APIs; preserve later commits.
- Acceptance: written gap list and no changes to V1 or unrelated features.

### Phase B — pure report model

- Extract filter and date-range logic, define snapshot versus event metrics, build previous-period/year-ago windows and adaptive trends.
- Add fixtures for range boundaries, empty/zero comparison, multi-assignee counting, issue uniqueness and Staff scoping.
- Acceptance: deterministic outputs, no fake history or performance scoring.

### Phase C — interactive analytics UI

- Add sections, URL state, presets, comparison selector/deltas, chart/table parity, management workload drill-through and personal staff view.
- Add responsive and theme behavior with existing components.
- Acceptance: filters affect chart, metrics, table, PDF and CSV identically; Staff never sees colleague dimensions.

### Phase D — exports

- Implement PDF comparison, definitions, chart/table, complete registers and pagination; CSV summary plus register with stable columns.
- Generate synthetic variants: multi-page company, one staff, empty, no prior period, zero baseline, multi-assignee and long text. Render every page and inspect at reading size.
- Acceptance: no clipped/orphan content, correct scope/period/filters and no colleague data in Staff exports.

### Phase E — verification and release

- Typecheck/build, pure model tests, local browser role checks, Management and Staff route checks, 320/390/768/desktop viewport and dark/light themes, compare downloaded files to UI, verify console/network errors.
- Use only existing business rows for read-only live QA; synthetic data must be isolated and rolled back. Never send reminders or mutate real work for report verification.
- Read `docs/DEPLOY_INSTRUCTIONS.md` in full; deploy only from the verified V2 stage; hard-refresh live and repeat role checks; record deployment ID and limitations.

## 9. Acceptance checklist

- Management and staff report scopes differ correctly; staff cannot gain peer data via URL or cache reuse.
- Created/completed/due periods and current snapshots remain semantically distinct.
- Prior-window dates are explicit and deltas handle zero denominators.
- Report sections and detailed filters are navigable, responsive and preserved in URL/back navigation.
- Trend chart is backed by actual created/completed dates and an accessible data equivalent.
- Management can compare staff counts and drill into filtered evidence; personal view includes no comparison to colleagues.
- PDF/CSV precisely match on-screen scope and filters and include their definitions/date basis.
- Build/typecheck and role/browser/export checks pass; changes are on `rebuild`; V2 deployment and live hard-refresh are confirmed before release is called done.

## 10. Explicitly deferred

Saved scheduled report deliveries; capacity planning; custom formula/chart builders; historical status snapshots; true cycle/lead-time metrics; arbitrary baselines and forecasting; app-wide general BI; any Accounting/Leave reports; or third-party messaging. These require additional business rules, history or delivery infrastructure and separate plans.

## 11. Progress record — 2026-10-22

- Phase A is complete: reviewed the existing report screen and plan, identified that the current page already has filterable register exports and manager workload counts, and documented the missing period comparison/trend semantics. Research basis above checked against current official Plane, Linear and Asana documentation.
- Phase B is implemented in `operations-report-model.ts`: inclusive previous-period ranges, previous-year ranges with leap-day clamping, safe percentage change for a zero baseline, date normalization, and adaptive day/week/month trend buckets. Nine focused Node tests pass, including URL round trips, invalid/duplicate values, Staff dimension denial, month-end buckets and current-open-state regressions.
- Phase C has a first implementation: compare-with control, date-bucketed created/completed line chart, period deltas, server-provided initial query state (avoiding client/server hydration mismatch), URL-persisted validated filters and comparison mode, browser Back restoration, and issue-reference drill-through links that preserve the report return context. Staff scope remains personal. Date presets and report-section selection remain open.
- Phase D is partial: the report PDF includes a period comparison table; separate summary CSV and filtered register CSV are provided. The PDF trend graphic, all synthetic page-layout variants, visual PDF inspection and CSV/PDF parity verification remain open. Corrected Open Work to use the same currently-open cohort as its register and labeled overdue/open values as current snapshots.
- Phase E is partial: Latest `npx tsc -b`, nine pure-model tests, and Biome lint passed. A local dev server could not start because the process launcher failed to create its security environment. Both default Turbopack and explicit Webpack production-build attempts stalled without a completion result. Production Staff route was inspected before deployment and still serves the prior version, so it does not verify the new comparison/export work. Local browser export verification and Management/Staff role checks of this slice have not been completed. This slice is on `rebuild` but is not approved to call live or complete.
- Source was published sequentially to `rebuild`: report screen commit `6dc2dd0c423f91ec144a450d407a837621998ded`; plan/progress record commit `801b272549f9df5cd59362f705ada244e0592c5d`.
- The latest report URL source is on `rebuild`: model commit `211f3d74d52aa1da210fc7c953842d7282785413`, screen commit `69607c57ff3cb864be4486d9ea34b10649a477a6`, URL tests commit `bd567a98c869ecd4e66051042e3391fdb5decd3f`, and SSR-safe filter hydration commits `b76e50f16f38deade15bf025a902646bffb652b1` and page-prop commit `332902dbaa02be10757b3c6fdf29c4edb28a0ecc`.
- V2 deployment is independently blocked by Vercel team authorization: the connector returns a 403 for `dnm-garments` and recommends `authorize_team_access`, which is not exposed in the currently available Vercel tools; the CLI device approval remains unavailable. Resume deployment after the team scope is authorized; read `docs/DEPLOY_INSTRUCTIONS.md`, use the exact checked V2 stage, and verify Management and Staff after a hard refresh.

