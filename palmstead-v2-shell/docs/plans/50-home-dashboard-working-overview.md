# Home dashboard: working overview

## Audit and intent

The existing home already shows real lead, balance, payment, complaint, schedule and announcement data. Its Site Visits shortcut has no upcoming records, and Banner Tracker is absent. Large amounts and paired text can crowd narrow screens. The drill-down list also has a fixed width cap that leaves unused workspace.

The dashboard should answer three questions quickly: what needs attention, how the client pipeline is doing, and where to open the underlying record. Atlassian's Jira dashboard guidance uses personal work and permission-aware widgets; Salesforce's sales dashboards provide manager drill-down. The existing shadcn dashboard components and chart primitives fit this codebase better than importing a separate theme or asset bundle.

References:
- https://support.atlassian.com/jira-software-cloud/docs/what-is-a-jira-dashboard/
- https://help.salesforce.com/s/articleView?id=sales.hvs_reports_reports_dashboards_overview.htm&language=en_US&type=5
- https://github.com/shadcn-ui/ui/blob/main/apps/v4/app/%28app%29/examples/dashboard/page.tsx

## Data and access

- Schedule and announcements retain their existing feature permissions.
- Staff upcoming visits come from their own site visit query. Management's team visits come from the existing company-wide site visit source, with its row security. Cancelled visits are excluded from the upcoming list.
- Banner status comes from the existing Banner Tracker source. Its read policy is available to signed-in staff. Attention means maintenance or replacement status; an unknown location is shown in the tracker rather than counted as damaged.
- KPI cards retain the existing role-scoped overview and open their matching detail lists. No sample figures or duplicate data store are introduced.

## Release slice

1. Improve the greeting and app shortcuts while keeping theme colors and accessible links.
2. Add upcoming visits with direct record links. Represent banners on an interactive, square map with status filters, real location counts, clickable pins and a route-planning link into Banner Tracker. Do not list banner names on the home page.
3. Keep the task, visit and news panels compact, place the map beside pipeline diagrams on wide screens, and make KPI values wrap on small screens. Use the available width in home insight lists.
4. Typecheck, build preview, inspect Management and Staff at desktop and mobile widths, then release only after verifying the exact preview and production deployment.

## Follow-on dashboard work

After this slice, assess exact task deep links and action priority across apps, then add only alerts backed by a verified source and permission rule. Avoid a crowded dashboard or inferred performance claims.

## 23 November layout and activity follow-up

Management's screenshot showed the map card much taller than the stage and agent cards. Keep the three cards in one equal-column, equal-height desktop row; make the map viewport shorter while retaining filters, pins and the route-planning link. On phones, stack the cards at natural heights and check 320 and 360 pixel widths.

Add a separate live activity row rather than padding the three analytics cards with invented content. Site visit outcomes use the existing Staff-owned or Management-visible visit source, exclude cancelled visits, and distinguish attended, did not attend, past unconfirmed and upcoming. The task workload uses only the signed-in person's assigned schedule items in a clearly labelled 30-day lookback and seven-day forward window. Each card links to its detailed report or planner. Verify Management and Staff isolation, map interaction, theme and overflow in the exact preview and production alias.
