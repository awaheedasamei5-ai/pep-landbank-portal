# Report Center and Banner Field Operations — V2

Status: active, 6 November 2026. Work on `rebuild` only; never write to V1 `main`. Release verified slices through a feature branch, preview, Management and Staff checks, then V2 production.

## Product research and limits

- ERPNext's sales analytics separates date, group-by and comparison dimensions; Pipedrive distinguishes activity performance from deal conversion. Keep denominators and source dates explicit rather than calling approved receipts booked sales. Sources: https://docs.frappe.io/erpnext/sales-analytics and https://support.pipedrive.com/en/article/insights-reports-activities-performance
- MapLibre supports live GeoJSON marker sources and a user-location control; OSRM provides Route and Trip services for ordered stops. These are candidate building blocks, subject to hosting, traffic limits and field-device testing. Sources: https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/ , https://maplibre.org/maplibre-gl-js/docs/API/classes/GeolocateControl/ , https://project-osrm.org/docs/v5.24.0/api/
- Browser geolocation requires HTTPS and permission. Web pages cannot promise background proximity detection after a phone has suspended or closed the tab. An installed native app with background geofences would be a separate delivery phase. In the web app, offer foreground nearby alerts and directions only while location tracking is active. Source: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- Frappe HR's attendance details distinguish recorded in/out times, worked hours, late entry and early exit; Odoo compares worked hours with expected hours from an assigned schedule. Palmstead has a company policy but no reliable historical absence/leave join yet, so do not label unmarked days as absences or payroll hours. Sources: https://docs.frappe.io/hr/human-resources-reports and https://www.odoo.com/documentation/19.0/applications/hr/attendances/attendance_reporting.html

## Current code and data audit

| Area | Current state | Required work |
| --- | --- | --- |
| My/Master/Company Pipelines | Shared reports and full PDF exist; Staff only sees authorized rows, Management compares staff. | More filters, prior-period comparisons, selected PDF sections and persistent URLs; clarify sales versus approved receipts. |
| Operations Tracker | Detailed report route with filter URL, schedule report, section PDF and CSV already exists. | Verify personal scope and make it discoverable from Staff Report. |
| Attendance | Daily/monthly records and Management screens, no dedicated report route/PDF for personal attendance. | Personal attendance summary, punctuality/exception/correction evidence and PDF; Management roster comparison separately. |
| Site Visits / Experience | Visit list, forms and separate Experience PDF exist; pipeline reports include linked requests. | Personal visit funnel, requested/scheduled/attended/cancelled outcomes, source/lead linkage and PDF. Do not equate scheduled with attended. |
| Banner Tracking | Four-tab v1 port and PDF exist; reports filter by period/area/status only. | Repair coordinates/map; add operational status, inspections, lead attribution, route and data-quality report; scope personal versus company-wide clearly. |
| Leave, Finance, Contracts | Existing app-level reports/exports. | Inventory permission and personal filters, then connect safe exports to Staff Report. |
| Staff Report | Sidebar currently points to `coming-soon`. | Build one staff-owned report center with section filters, consolidated PDF, source links and explicit unavailable data. Management can inspect staff only through authorized Management views. |

Live V2 banner audit: 63 records; all have non-null coordinates, but 12 stored longitude values are outside valid longitude range (examples `-1219050` and `-849760`). Their intended values appear to be the same numbers divided by 10,000,000, in Accra. These outliers cause Leaflet's `fitBounds` to zoom to the whole world. The current map script comes from unpkg at runtime, has no in-map route/stop selection, and "Find by name" only affects an external Directions button. The dashboard's 57 good / 5 maintenance / 1 scouted counts are real, while its "live" count is only query-refetched data, not a realtime subscription. Area names are inconsistent in case. The create form accepts out-of-range coordinates, silently ignores a failed initial status-log write, and has no clear map-pin confirmation. Fix these as separate, testable concerns.

## Target information architecture

1. **Staff Report**: overview by Ghana date range with source-status badges, section cards for Sales, Operations, Attendance, Site Visits, Banner activity, Leave and authorized Finance/Contracts; one consolidated PDF with cover, definitions, per-app charts/tables, timestamp and source links. Section-only exports must match the current filter. Each section opens its app-level report. Staff never gets another employee's private rows through a query parameter.
2. **App reports**: each app owns the detailed metrics and permissions. Share a small filter/date/export contract and PDF visual language, not one giant cross-app data query. Management comparisons use aggregate rows with denominator and date basis.
3. **Banner Tracking**: summary, searchable inventory, field map, inspection history, routes, attribution and reports. Every banner has stable ID, coordinates, area, current condition, inspection timestamp, photo/history and lead links. Distinguish scouted location from installed banner; show stale inspections and unverified coordinates.
4. **Field map**: validate coordinates before mapping. Select banner pins or list rows to build a stop set; calculate route order and distance with a routing service, with a straight-line fallback labelled as such. Show stops, leg distance/time and navigation action; preserve selected stops. For nearby alerts, ask location permission only after user starts field mode, use foreground `watchPosition` and a configurable radius with deduped notifications; never claim background alerts work when the app is closed.

## Delivery phases and gates

0. **Daily Management SMS activation:** when an active Management profile gains a valid phone in biodata, enable the existing digest schedule atomically and queue a current-day first snapshot. Keep idempotent `(date,kind)` and recipient deliveries, avoid duplicate SMS, preserve a manual off switch, verify with a rolled-back database test and worker disabled/queued states. Never put customer data in the SMS. The first same-day report is an activation catch-up; subsequent reports follow 08:00/18:00 Ghana settings.
1. **Banner correctness:** repair the 12 clearly corrupted longitudes with an audit trail or reversible evidence, add range checks to create/edit, show mapped/invalid counts, fit only valid pins, and make map/list selection work. Test the 63-row production sample plus invalid fixtures and a phone viewport.
2. **Report inventory and Staff Report shell:** build the real route and navigation; expose only already authorized personal reports first, with consistent date scope and source links. Browser test Staff and Management.
3. **Missing reports:** Attendance and Site Visits personal reports first, then Banner operational report; charts, detailed registers and branded PDFs. Test metric reconciliation against source IDs and inspect PDF pages.
4. **Consolidated report:** a single personal cross-app PDF with selected sections, filters, provenance and missing-data notices; compare against app reports, enforce RLS for each fetch, test Staff and Management.
5. **Banner field workflow:** replace fragile map loading, build stop planning and route display, inspection capture with evidence/status history, realtime count updates, and foreground proximity. Check map service usage terms/cost before production routing; confirm field navigation on a real device.

For every phase: targeted tests for high-risk metric/coordinate/security logic, typecheck/build, preview browser checks for Management and Staff, PDF render where applicable, V2 production READY and fresh reload. Do not send a real SMS while testing with a placeholder phone; delivery is live only when a real Management biodata number is saved.
