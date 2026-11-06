# Sales reporting and twice-daily Management digest

Status: active plan, 5 November 2026. V2 only. The Announcements draft remains paused. This plan supersedes older pipeline analytics scope where the user asked for detailed Management reporting.

## Research and product model

- Salesforce Lead Analysis distinguishes leads created, contacted, converted, source mix, age and rep/channel conversion. It also links report rows to the source lead record: https://help.salesforce.com/s/articleView?id=sales.sales_insights_lead_analysis.htm&language=en_US&type=5
- Pipedrive separates funnel conversion from win/loss and activity performance from revenue: https://support.pipedrive.com/en/article/insights-reports-deal-conversion and https://support.pipedrive.com/en/article/insights-reports-activities-performance
- Odoo Pipeline Analysis uses stage, salesperson and period dimensions, while expected revenue is a forecast rather than cash: https://www.odoo.com/documentation/19.0/applications/sales/crm/performance/win_loss.html and https://www.odoo.com/documentation/19.0/applications/sales/crm/performance/expected_revenue_report.html
- ERPNext reconciles sales reports only when document type, date, status and returns are matched: https://docs.frappe.io/erpnext/sales-analytics
- Open source reference for interaction and report layout only: https://github.com/frappe/crm . Do not copy a second CRM stack into this Next.js/Supabase app or import code without checking its licence and data contract.

## Verified V2 data boundaries

- One `leads` table powers My Pipeline (owner `agent_key`), Master Pipeline (all active leads), and Company Leads (`agent_key = company`). `assigned_agent_key` is a handler, **not** ownership. Reassignment can move a lead out of the Company Leads cohort; historical ownership requires an event ledger and cannot be reconstructed from today's row.
- Calls and messages are `activity_log` rows with `action`, `method`, `outcome`, `agent_key`, `lead_id`, `created_at`; automatic payment/stage activity is in the same table. The current form writes `action=Call`. A live read found 41 historical calls recorded as `action=Pipeline update, method=Phone Call`; count both forms, while excluding payment and stage activity. Legacy calls may lack outcome. The existing analytics incorrectly label all activity as calls and the existing loader caps activity at 1,000 rows.
- `site_visits` has creation timestamp, scheduled `visit_date`, status, cancellation and nullable `lead_id`. Count requests by `created_at`, scheduled visits by `visit_date`, completed visits only where there is a trustworthy completed outcome; do not infer attendance from a past scheduled date. Unlinked visits get a separate quality count.
- `payments` has `payment_date`, `status`, `decided_at`, amount and lead link. Approved payment total is cash recorded against client accounts, not booked sales, bank-verified funds, or net revenue. Imported historic `leads.amt_paid` must never be added to payment rows. Payment owner can differ from today's lead owner; expose attribution method.
- `op_todos` supplies day plans and completion timestamps. Its audience/ownership is separate from sales ownership.
- All records belong to V2 Supabase `sbydzrlzqxcdbudjaube`. V1 and `main` are excluded.

## Report contract

Three entry points share one metric engine and layout: My Pipeline (own leads and own activity), Master Pipeline (all current leads), Company Leads (company-owned leads and their handlers). Staff see only authorized records through existing RLS; Management may compare employees. Never allow a Staff query parameter to widen the scope. The date range is inclusive in `Africa/Accra`, with an explicit basis for each metric. Preserve filters in the URL and in PDF metadata.

Filters: preset/custom date, prior equivalent period, source, stage, owner/handler/call actor, company/personal cohort, call action/method/outcome, site and visit status, payment status/method, payment plan, plot type, priority and missing-data flags. Multi-person comparison shows raw volume and rates side by side, with denominator, sample size, zero/unknown state and change versus prior period. Drilldowns must link to the exact lead, activity, visit or payment where the viewer is authorized.

Metric families: new leads and source mix; contact attempts, genuine calls, outcomes, reached rate, first-contact lag, overdue follow-ups, active days; requested/scheduled/cancelled/verified-completed visits, unique lead progression; current stage distribution, paid-in-full cohort, lead-to-visit and visit-to-paid rates; approved payment count/value by payment date and by decision date, monthly trend, method and staff, outstanding contract balances as a current snapshot; incomplete linkage, missing outcome and missing ownership. Do not call a payment a sale or count a scheduled visit as attended. Historic stage conversion/velocity remains unavailable until immutable stage events exist.

The PDF is a multi-page management document: cover with company name, scope, definitions, generated time and author; executive KPI page; monthly trend and funnel charts; staff comparison with denominators; source/outcome/visit/payment breakdown; exception and data-quality register; detailed record appendix; page numbers, repeated table headers and no clipped text. Export the **selected** sections and filters, not just a full report. Display an explicit completeness warning if any source query is truncated or unavailable. Render and visually inspect synthetic and actual authorized samples before release.

## Twice-daily Management digest

Morning snapshot in Ghana local time: each active staff member's scheduled to-dos/meetings, open follow-ups, site visits, planned calls and due items; sales pipeline changes/new leads since last close. Evening snapshot: logged genuine calls and outcomes, other contact activity, new leads, visits requested/completed, approved payments (with caveat), tasks completed/missed/rescheduled, and planned-versus-done. Show zero separately from missing data.

Use a private snapshot table and immutable run ID, one `(local_date, morning|evening)` run; guarded server worker creates it, retries safely and sends only an SMS containing an authenticated Management deep link. The report page requires a fresh active Management session and builds/downloads the PDF on demand, so the link can remain useful without a public bearer token. Resolve every active Management recipient from verified profile biodata at send time. Never put client names, amounts or task contents into SMS. Record per-recipient provider status, attempts, generated/exported timestamps and audit, with a manual resend action. Store the Arkesel key only server side; no real SMS in QA. Cron schedules and final operating hours must be explicit in Settings. DST-free `Africa/Accra` local-day boundaries and idempotency are required.

## Build and release order

1. **Data/metric foundation:** server-scoped, paginated queries or guarded report RPC; pure metric engine; cohort/attribution definitions and tests. Fix the false call label and truncation. Read-only role/security checks.
2. **Interactive reports:** shared report route/components from all three apps; responsive filters, trend/funnel/comparison/drilldown; Staff and Management authorization and mobile/light/dark QA.
3. **PDF exports:** selected scope, detailed appendix and chart rendering; fixture, actual browser download and page-layout QA.
4. **Daily digest:** settings, snapshots, guarded Management route and outbox/cron worker; dry run and idempotency/role tests; controlled delivery only after verification.
5. For each verified slice: typecheck/build, preview READY, Management and Staff browser journeys, then merge to `rebuild` (V2 auto deployment) and fresh production checks. Do not merge to `main`, reset records or send a test SMS to real staff.

## Acceptance limits

All numbers must reconcile to source IDs and filters. Historical ownership, actual site attendance and booked-sales conversion must be labelled unavailable where the source has no immutable evidence. The report must never silently cap a series at the first 1,000 rows. A failed or incomplete digest must be visible in Management UI and must not be reported as delivered.

## 6 November checkpoint

- First reporting slice is live on V2 production: My Pipeline, Master Pipeline and Company Leads share reports and branded PDF export. Management and Staff browser checks and PDF inspection passed. It is not the full filter/comparison scope above.
- Daily digest schema, three cron jobs and worker are installed in V2. Settings remain `enabled=false`. Worker authentication and disabled-mode dry run passed; no SMS was sent. The active Management profile has no phone in biodata, so delivery cannot be enabled safely yet.
- Daily list/detail UI, Management-only PDF, sign-in return path and Staff denial are implemented locally. A populated historical sample reconciled four genuine calls and produced a readable PDF. Targeted tests, typecheck, formatting and production build passed. Preview and production deployment of this second slice remain pending because the Vercel CLI returned `Not authorized` during upload; investigate credentials/project access, then repeat live checks.
- QA runs with IDs `1eb8c2fb-96b8-445e-9828-1647ee424149` and `abd443a8-9b92-460b-949a-a08eb00ceb1e` are temporary and must be removed after release checks.
