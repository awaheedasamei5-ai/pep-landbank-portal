# Operations Tracker Reports — Implementation Plan

## Purpose and boundary

This plan adds the missing reporting surface to the existing Plane-derived Operations Tracker in `palmstead-v2-shell`. The deliverable is a useful, read-only report experience backed by the existing `op_*` data model. It does not expand the Plane replica into dashboards, pages, custom formulas, or general business intelligence. It does not change V1, Accounting, the V1 database, or the existing production data model.

The source-of-truth repo notes identify this as the next planned Operations slice. The existing tracker has an overview, personal schedule, work queue, audit log, project issue lists, saved filtered views, and a working shared `op_issues` schema. The top-level Analytics and Reports sidebar links are still placeholders. This plan fills that gap without adding new tables or migrations.

## Product questions the reports must answer

Management needs to know what work entered or finished in a chosen period, what remains open or overdue, which projects are blocked, how assignments compare across staff, and which individual issue rows explain the totals. Staff need a private-to-self view of assigned work and progress, with the same date/status/project filters where applicable. A report must show its date basis clearly: created date, completed date, or due date. Totals must never imply that current open work was created or completed during a selected period.

Primary reports: (1) Work summary by project and status, (2) completed work by person and period, (3) open/overdue work by assignee, (4) priority and due-date backlog, and (5) an issue register showing the rows behind the aggregate. Management gets company-wide scope and staff comparisons. Staff gets only issues assigned to the signed-in agent key; the UI must not expose a person picker or peer-comparison totals.

## Existing implementation and data facts

The Operations Tracker uses copied Plane stores/services over Supabase. Existing query patterns in `use-operations-overview.ts` join `op_issues`, `op_states`, `op_projects`, `op_issue_assignees`, and `profiles`. Issue fields include `created_at`, `completed_at`, `target_date`, `priority`, state, project, archive marker, and assignee membership. Those are sufficient for a first reporting slice. Activity history exists but does not represent a complete immutable snapshot of every historical issue state. Therefore historical status-at-date and cycle-time claims are out of scope unless accurately derivable from persisted events.

The app is single-company and the schema was already applied to the V2 Supabase project. The report is read-only; no migration, RPC, scheduled job, external service, or third-party dependency is needed. Reuse existing date utilities, Supabase client, role store, component library, charts where appropriate, and the shared PDF reporting helpers. Inspect local wrappers before use and do not alter protected UI/calendar component files.

## Domain semantics and definitions

- Open: current state group is not `completed` and not `cancelled`.
- Completed in period: `completed_at` is within the inclusive selected date range.
- Created in period: `created_at` falls within the selected range.
- Overdue: currently open, has a `target_date` earlier than today's local date. Show this as a current snapshot; do not constrain it by created date.
- Due in period: target date falls within the selected range and the issue is not completed/cancelled today.
- Workload: count of open assigned issues per person, with completed-in-period shown separately. Multi-assignee issues count once for each assigned person's workload; company-wide unique issue totals count each issue once. Label this rule in report help text.
- Unassigned: open issues with no assignee row.
- Date range: use date-only inclusive boundaries. For timestamps, convert to a half-open interval `[start at local day, day after end)` or compare ISO date-only values consistently. Avoid UTC off-by-one errors.
- Archived issues: excluded by default, with no implication that archival equals completion.

## Security and role model

Use the authenticated profile's `role` and `agent_key`, never a caller-supplied role or person key, to select report scope. Management sees company-level totals, project breakdowns, and comparisons. An agent's report dataset is filtered to rows whose `op_issue_assignees.assignee_key` matches that agent key. Staff aggregations must be calculated only after this filter. The staff UI must not render comparison controls or a list of colleagues.

The current `op_*` policies allow authenticated company members to read tracker data, so client-side scoping is necessary for this UI but is not a substitute for database authorization. This slice adds no new access path and must not widen existing RLS. Any future export/RPC/server endpoint must independently derive identity from the auth session and enforce the same scope. Never put compensation or Accounting data in Operations exports.

## Query and calculation design

Build a dedicated `use-operations-reports` query hook that fetches the bounded, required source rows and lookup data in parallel. Use explicit selected columns, check every Supabase error, and handle empty projects/states/profiles. Apply management/staff scope before aggregation and before constructing export rows. Keep calculations pure and independently understandable: filter data, derive issue facts, group, calculate totals, then format for UI/export.

Avoid fetching audit history or all company profile fields. Request only `agent_key,name` and only the fields shown or used. If the dataset approaches PostgREST row caps, switch to paginated reads or a narrowly scoped aggregate RPC in a separate reviewed phase; silently truncated reports are unacceptable. First implementation should inspect current row counts/pagination patterns and document any cap assumptions.

Filters: report type, date basis/range, project (management; staff only projects represented in their own scoped records), status group, priority, and person (management only). Provide clear/reset and useful presets (this month, last month, quarter to date, year to date). Show the active date basis and timezone interpretation beside the date controls. Preserve filters while switching report type within the session; a reload may reset unless URL state is implemented cleanly.

## User interface architecture

Add a real `/dashboard/operations/reports` route and link it from the Operations navigation group, replacing the placeholder URL. Keep the Operations project/workspace pages focused. Use the project shell's existing header, tabs/segmented controls, semantic theme tokens, charts, tables, loading/error/empty patterns, and responsive behavior.

The report page hierarchy is: page title and concise purpose; compact filter toolbar; period-over-period or scope context; a small number of high-value summary figures; one relevant chart or ranked comparison; detailed rows with sorting/pagination; export action. Avoid a wall of identical cards. The primary surface is the issue register/table, with summary and chart supporting it. On mobile, filters wrap or move into a labeled filter panel and the table remains usable through horizontal scroll or stacked row details.

Management report types include a staff comparison table with open, overdue, completed in range, and unassigned/unavailable metrics, with a drill-through that applies the selected person filter to the issue register. Provide neutral context: workload counts do not measure effort or quality. Staff sees “My work” framing and their own trend, no team ranking. The UI must not describe raw completion counts as performance ratings.

## Export design

Provide a PDF summary and CSV issue register. Both use exactly the active scope and filters. PDF includes company/app title, report name, date basis/range, applied filters, generation date, scope label, concise definitions, summary, chart/table where legible, and page numbers. CSV escapes quotes/newlines correctly, uses stable headers, UTF-8, and includes issue identifier, title, project, state, priority, assignees permitted by scope, created/due/completed dates. Do not export hidden/unfiltered rows. Empty reports still export a clear header/empty-state artifact or disable download with a clear explanation.

PDF generation reuses the existing jsPDF and shared report helpers; never add a second PDF library. Check page overflow and repeated table headers in multi-page outputs. Use safe filename dates and report title.

## Research basis and product pattern

The original OSS basis remains `makeplane/plane`; its issue-centric model is already copied into this project. Plane's official Analytics documentation describes multiple scopes (workspace/project/cycle/module), trend and breakdown views, drillable tables, and CSV export. Its dashboards are explicitly read-only lenses over live issue data. Linear's official export workflow exports the currently selected issue view and provides a defined issue-field set. Adapt those real patterns: report scope is visible, filters are explicit, aggregate views lead to inspectable rows, and exports honor the active view. Do not copy premium features or introduce Plane's incompatible Django backend.

References:
- Plane analytics: https://docs.plane.so/core-concepts/analytics
- Plane dashboards: https://docs.plane.so/dashboards
- Linear exports: https://linear.app/docs/exporting-data
- Plane source: https://github.com/makeplane/plane

## Delivery sequence

1. Confirm clean branch and no pre-existing modifications; preserve `rebuild` and do not touch `main`.
2. Inspect relevant Next.js docs, available shadcn guidance, local table/chart components, route patterns, and current issue query pagination before edits.
3. Implement scoped data query and pure aggregations; establish explicit role-derived scope first.
4. Implement report route, filters, management/staff-specific report choices, chart/table, states, and navigation link.
5. Implement CSV and branded PDF exports from the filtered, scoped dataset.
6. Validate type/build per repo instructions and interactively verify management and staff accounts. Include one existing issue in the filters and confirm it appears in both accounts only when legitimately in scope; verify staff cannot access comparison or other staff's rows. Keep tests read-only to avoid mutating real operational data.
7. Check dark mode, narrow viewport, empty results, multi-page PDF, and CSV/PDF filter parity. Record known limits, especially that historical status snapshots are not available.
8. Update this plan with actual delivered scope and any deferred work. Commit to `rebuild` only after clean verification. Push/deploy only after the final slice is reviewable and user authorization for deployment is clear.

## Acceptance criteria

- Reports is reachable in Operations navigation and deep links load directly.
- Management sees company-wide data and staff comparisons; staff sees only assigned issues and no comparison control/data.
- Current open, overdue, created-in-range, completed-in-range, and due-in-range have distinct correct definitions.
- Project/status/priority/date/person filters recompute all totals, chart, table, PDF, and CSV consistently.
- Multi-assignee issue counting is explained; company-wide unique totals do not double-count issues.
- Query failures are visible; loading, empty, and no-match states are helpful.
- CSV escaping, stable columns, and UTF-8 are correct; PDF includes context/definitions and paginates without clipping.
- No schema changes, no V1 access, no test-data writes, no generic decorative tile grid, and no fixed floating controls.
- Management and staff verification completes without console errors or cross-role leakage.

## Deliberate follow-on work

Saved report definitions, scheduled delivery, custom formulas, historical as-of snapshots, throughput/cycle-time analytics, arbitrary date grouping, organization-specific performance targets, and dashboards are not part of this read-only first reports slice. Each needs real user requirements and, in some cases, additional audit/event data or backend aggregation. Accounting remains a separate app and its existing reports are not duplicated here.
