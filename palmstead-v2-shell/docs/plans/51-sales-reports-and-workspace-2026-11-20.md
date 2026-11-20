# Sales reports and connected workspace — 20 November 2026

## Verified starting point

The shared `SalesReportScreen` powers personal, company, and master reports. Its loader currently omits `lead_conversations` and `client_cost_attributions`; its PDF has summary registers but no client dossier. The Staff comparison credits approved payments to the payment recorder, not the owner of the deal. Site visit intake currently offers only an optional personal pipeline lead. The Home and Announcements work is a separate later release.

## Evidence and definitions

Salesforce Pipeline Inspection uses owner, stage, amount, next step, activity, and dated changes; HubSpot sales analytics includes lead funnels, prospecting activity, and team timelines. Use these as interaction and metric references, not as a source of company data or a UI clone. Existing Recharts, jsPDF and the project report primitives already meet the chart/PDF need, so adding a second report framework would increase maintenance without adding reliable data. Any external visual asset needs a license and brand review; prefer the existing logo, tokens and chart primitives.

One lead is one deal. `agent_key = 'company'` remains in the company pool even if `assigned_agent_key` names a staff handler; assignment does not create a personal deal. A personal report includes only `agent_key = viewer key`. The master report includes both pools and can filter them. Approved payment amount is a client receipt, not profit or verified bank cash. Current `grand_total` and stage are snapshots. The site visit cost ledger contains an attributable amount only after attended visits and a matched actual-cost form; a zero ledger total is not proof of zero spend. Never fabricate historical stage/owner snapshots or costs.

## Releases

1. **Report evidence and client drill-down.** Extend the existing RLS-scoped loader with conversations and cost ledger. Add pool/client filters, complete lead-level breakdown, conversation/call/next-action timeline, payment and visit evidence, and ledger-based cost versus receipts. Keep long text and all filtered rows in the PDF with page-safe tables and page counts. Define Staff comparison by lead ownership and show company pool separately. Test personal/company/master isolation, empty states, cent-accurate totals, PDF pagination, Management and Staff live.
2. **Site visit intake ownership.** Require a personal or company prospect choice for new unlinked clients. Create a lead in the selected pool only after explicit confirmation, link visit by `lead_id`, respect role grants, avoid duplicate and partial creates, and test both roles. Do not infer ownership from name/contact alone when multiple deals exist.
3. **Home and information center.** Build role-aware cards and charts from authoritative query endpoints, link each to working page layers, and turn Announcements into a managed feed with source, audience, publish time, expiry and unread state. Guidance must distinguish measured trends from heuristic advice. Profile image uses private storage, controlled upload limits and a fallback avatar.
4. **Settings and access.** Audit every app route and server mutation before exposing the access matrix. Repair recovery. Offer Management a guarded, audited reset/invite flow; passwords cannot be displayed or synchronized in a vault because Auth stores non-reversible hashes. A password vault would create a severe single-point compromise and be inaccurate after a user changes a password. Never store plaintext passwords or expose them to Management.

## References

- https://help.salesforce.com/s/articleView?id=sales.pipeline_inspection_metrics_and_fields.htm&language=en_US
- https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite
- Existing `src/webnext/shared/lib/pdfReport.ts`, `SalesReportPdf.ts`, Recharts and shadcn chart wrapper.

