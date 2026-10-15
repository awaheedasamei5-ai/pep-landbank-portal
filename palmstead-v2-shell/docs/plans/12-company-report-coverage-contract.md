# Company reporting coverage contract

2026-10-15 — standing scope from the user's latest report instruction. Status: required coverage, not an assertion these reports already exist.

## Shared contract

Every app must map each entity, workflow state, actor, date, approval, exception, document and notification to a reporting decision. A report needs summary, contributing records, comparisons where justified, actionable evidence, data-quality limitations and a readable downloadable document. One total and a download button do not complete an app's reporting.

Staff sees personal/authorized collaborative records; Management sees authorized company/employee/department/project scope. Backend authorization applies to UI and downloads. Personal reports never reveal colleagues through rankings, filters, counts, private reasons or signed documents. Company comparisons state cohorts and units; avoid treating leave, messages or activity counts as staff performance scores.

Each report declares current snapshot versus event history, date basis, inclusive period, timezone, policy version, cohort and completeness. Show unknown history as unknown. Counts, sums and ratios must reconcile to detail. No percentage with zero denominator, silently truncated export, invented budget, inferred attendance absence, or guessed employment history. UI, chart, CSV and PDF consume the same authorized calculation result.

## Coverage matrix

These are required report families to validate against actual V1/schema and approved sources when each app is built. Unsupported concepts require schema/workflow design first; they are not permission to fabricate metrics.

| App | Staff/authorized personal view | Management/company view and report details |
|---|---|---|
| Dashboard | Personal cross-app actions and dated activity with source links | Company snapshot, exceptions and cross-app reconciliation; source freshness per section |
| Operations Tracker | Assigned/created work, status, priorities, due/overdue, projects, milestones, meetings, invitations, schedule, reminders, activity | Project/task registers; created/resolved trends; bottlenecks; dependencies; workload/cohort comparisons; overdue/blocked; schedule attendance only where recorded; project history; deletion/archive evidence |
| Accounting | Own authorized earnings/commission/payment statements | Payments, expenses, commission, payroll and reconciliation; ledger detail, category/period comparisons, liabilities only from real records, adjustments/approvals, currency/date basis, source-document references |
| Leave | Annual statement, own plans/requests, decisions, reschedules, usage, exceptions and history | Employee balances, request register, coverage/collisions, monthly/employee comparisons, exemptions/emergencies, confirmation backlog, policy basis, audit coverage and reminder reliability; full plan 11 |
| Attendance | Own daily register, check-ins/outs, corrections, exceptions, recorded hours and lateness basis | Daily/monthly detail and summary; expected-workday policy, present/absent/unmarked/leave/closure distinct; late/early/missing punches; field assignments; approvals; policy-effective comparisons; leave reconciliation |
| CRM/Pipeline | Own authorized clients/deals/follow-ups/activities | Stage movements, conversion cohorts, aging, sales/collection reconciliation, ownership changes, lost reasons, duplicates and missing data; never equate booked sales with collected cash |
| Client Database | Authorized client relationships and follow-up history | Client register, completeness, consent/access where recorded, duplicate review, assigned ownership and deal/payment links; exclude identity documents from routine bulk reports |
| Plot Inventory | Authorized available/reserved/sold plot information | Estate/plot register, area and price basis, availability movement, reservation age, allocations and sale reconciliation; no assumed valuation gains |
| Allocations | Own authorized allocation cases and actions | Request/approval/assignment register, plot/client reconciliation, conflicts, amendments, reversals and missing documents; dated ownership evidence |
| Site Visits / Experience | Own assigned visits, outcomes and follow-up | Planned/completed/cancelled visits, no-show only when recorded, staff assignment, costs where recorded, feedback and subsequent pipeline outcomes without claiming causation |
| Enquiries | Own received/assigned enquiries and response actions | Source/period register, assignment, response timestamps, conversion cohorts, aging and unresolved items; distinguish missing response evidence from no response |
| Referrals | Own authorized referrals and reward status | Source/referrer register, consent and attribution, qualification/conversion, earned/approved/paid rewards and duplicate attribution exceptions |
| Complaints | Own authorized complaints, decisions and messages | Category/status/severity register, response/resolution timelines where reliably captured, overdue cases, reopenings and remedy actions; private narratives excluded from broad comparisons |
| Company Leads | Authorized assigned leads and disposition | Source/assignment/qualification register, aging, duplicates, stage outcomes, routing history and follow-up coverage; no unrestricted Staff contact export |
| Quotation | Own authorized quotes and revision history | Issued/accepted/expired/withdrawn register, item/tax/discount/currency detail where supported, revisions and sales/payment reconciliation; quotations are not revenue |
| Banner Tracking | Own assigned installation/removal/check actions | Banner/location inventory, deployments, inspection history, overdue maintenance, lost/damaged items and cost evidence; precise location only for authorized readers |
| Site Visit Authorization | Own applications, approvals and required actions | Request/decision/visit register, amendments, authorizing actors, policy exceptions and document history; approval is separate from proof the visit occurred |
| Announcements | Received/published/acknowledged content within permitted audience | Publication/withdrawal history, audience, acknowledgment evidence and unresolved actions; viewed, delivered and acknowledged remain distinct |
| Memorandum | Issued/received/acknowledged memos | Draft/review/publish/withdrawal lifecycle, recipients, acknowledgment evidence, outstanding actions, versions and access scope |
| Contract of Sale | Authorized contract status and own required actions | Register, versions, parties/access, execution/signature evidence, outstanding approvals, cancellations, document/payment reconciliation; no implied legal validity from a status alone |
| Notes | Personal/explicitly shared note inventory and linked records | Authorized shared/project knowledge coverage, versions and unresolved actions; no reading private personal notes through analytics |
| Staff Report | Own cross-app statement with source detail | Authorized per-employee consolidated sections, neutral comparisons, manager commentary with provenance; reconcile app sections without double counting |
| Notifications | Own preferences, inbox, action and channel status | Dispatch/acceptance/delivery distinctions, failures/retries, unread/acknowledgment where recorded, channel/period comparisons; masked contact detail |
| Chat | Authorized conversation exports and own participation context | Authorized channel administration, retention and delivery health; no company-wide private-message content export or productivity scoring |
| Smart Insights | Own evidence-backed actions | Rule coverage, generated/resolved/actionable exceptions, source freshness and false-positive review; deterministic metrics, no unsupported predictions |
| Data Check | Own permitted record corrections | Rule/category/severity register, affected authorized records, recurrence, resolution history and quality trends; definition of rule denominator |
| Document Vault | Own/authorized files, versions and actions | Document register, classifications, access/expiry/retention where real policies exist, missing documents and version history; never public links by default |
| My Portfolio | Own sales/activity/earnings reconciled to source apps | Authorized portfolio/team comparisons with declared ownership and period; distinguish earned, approved and paid |
| Commission | Own calculation inputs, rate/version, earned/approved/paid adjustments | Staff/company reconciliation to Accounting and collections; avoid duplicate ledger implementations |
| Analytics | Authorized personal analytical views | Governed dimensions/measures and saved-view provenance; no unrestricted query builder bypassing RLS |
| Company Reports | Personal pack of authorized app sections | Composable cross-app pack, shared scope/date manifest, section-level freshness/completeness, source drill-through and reconciliation |
| Leaderboard | Authorized scoring rules and own score evidence | Versioned server-authoritative scores, cohort, ties, adjustments and challenge history; no new score rules inferred from HR private data |
| Team Roster | Authorized directory and own profile completeness | Current/historical staffing only where data exists, departments/roles/active status and completeness; no assumed tenure from profile creation |
| System Health | User-relevant service status | Jobs, deployments, error windows, freshness, retries and incidents; no keys/tokens or sensitive payloads in exports |
| Global/App Settings | Own preferences and applicable policies | Effective-dated policy/configuration changes and actor audit; settings remain inside owning app where appropriate |

## Document system

Each app gets a designed report layout: document title and purpose, company identity using the real logo, confidentiality, scope and period, generated timestamp, concise summary, comparative tables/charts, exact detail and definitions/limitations. PDF tables repeat headings and preserve totals across page breaks. Wide ledgers use landscape; personal statements use portrait where appropriate. Fonts, spacing, aspect ratio, contrast and page numbers require rendered page inspection, including empty and long fixtures. Do not substitute web screenshots for analytical documents. Approval letters/contracts remain distinct from informational reports.

CSV needs safe text escaping, spreadsheet formula neutralization, explicit units and ISO dates. PDF and CSV must report full matched data or fail with a visible explanation. Role changes invalidate cached snapshots. Cross-app packs identify independent snapshot timestamps until a true transactionally consistent cross-app resource exists.

## Delivery and completion

Current order remains Leave reports, Attendance reports, then unfinished apps in plan 00. Operations/Accounting coverage is audited against this expanded contract; their older first-slice plans do not reduce the user's new scope. Each app's detailed plan must research its own real products/approved source and actual data before implementation. This matrix is a scope contract, not a substitute for those blueprints.

For each report family maintain: researched, schema available, calculation implemented, authorized resource implemented, UI implemented, export implemented, numeric checks passed, rendered PDF inspected, Staff live checked, Management live checked, deployed. Only mark complete when all applicable columns have evidence. Explicitly mark unavailable history/data and remaining work; never imply all apps were completed by adding a generic report builder.
