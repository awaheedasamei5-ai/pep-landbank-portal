# Shared workspace theme and responsive repair

2026-10-15. User reported that app canvases stay white/separate from the shell and mobile cards collide or escape the content area. This repair continues alongside the section/filter/comparison report exports; neither request replaces the other.

## Observed causes and repair boundaries

Every dashboard route is wrapped in `.webnext-theme`. That wrapper originally supplied its own light/purple and dark/purple palettes, fonts and painted background. It reacted to dark class changes but not the shell's selected theme preset, so the content canvas could still look like a separate application. Map compatibility tokens to the shell's background, card, foreground, border, primary and accent tokens. Make the wrapper transparent and inherit the shell font. Keep legacy spacing/variable names so migrated CSS modules still resolve their dependencies. Semantic success/warning/info colors remain explicit readable light/dark palette values; they must not become arbitrary chart colors.

Protected files under `src/components/ui/` and `src/components/calendar/` are not edited. Shared consumer layout rules constrain card minimum sizes and stack CardAction beneath its title/description at narrow widths. They do not shrink text, conceal overflowing content as a substitute for layout, or indiscriminately change all tables into cards. Wide analytical tables retain local horizontal scrolling.

The shared PageHeader needs a shrinkable title/description and bounded actions. The mobile top bar needs icon-sized search and compact spacing, so it does not compete with account/theme/settings controls. Shared statistic icons must not shrink into text. The Leave request list needs vertically stacked identity/status on narrow screens and wrapping footer actions. Leave balance headings and metrics must wrap. Pending Management request details must use a shrinkable flex basis rather than a fixed minimum width.

## Verification

Check 320/390px mobile, tablet and desktop widths. Inspect actual card/header/text bounds, local table scrolling, no body overflow, accessible labels and touch actions. Test Leave Management, personal Leave, report controls, Operations, Accounting, Attendance, dashboard and at least one migrated Sales screen. Test light, dark and a non-default theme preset; compare computed wrapper/card colors with the inherited shell values and restore preferences afterward. Use saved screenshots of meaningful mobile and desktop states.

Reports must retain Staff/Management authorization, exact data and readable exported pages. Compare section-only PDF and CSV against selected filters, both comparison modes and the full-pack export. Build/typecheck, publish rebuild, deploy V2 and hard-refresh both roles. A shared-token repair does not imply every legacy page has received a complete layout/content audit; record any remaining page-specific failures precisely.

## Verified local evidence

Final production build/typecheck passed. Management Leave tested at 320, 390, 768 and 1440 widths: body width equals viewport, cards remain in workspace. Dark Tangerine follows inherited shell background/card tokens; light Default also checked. Original local Default/light and viewport restored. At 320, loaded Accounting six-card dashboard also has no escaped cards. Dashboard/Operations/Attendance/Pipeline/Plots received structural boundary checks, some during loading, so they are not claimed as complete functional audits. Mobile report filters open/collapse correctly, comparison changes and refresh retain validated scope. Both roles downloaded actual section files; Staff management route denied. No protected ui/calendar components edited. Production hard-refresh verification follows V2 deployment.

### Production verification — 2026-10-15, section exports/theme repair

Published source commit 78c87352327b21c7097697da1ea7063e3557a8bc, tree 6d8029c15199878b51528196016f71f741758348. V2 deployment dpl_FcQPD1XRETbMRUznDA5moPfJjK77 reached READY and production alias (36-second cloud build). Hard-refreshed live Management and Adams Staff sessions. Downloaded actual Management October Trends PDF/CSV against September previous period and Staff October Requests PDF/CSV; parsed exports confirmed sections/date scopes and Staff-only request, with known colleague names absent. Both downloaded PDF first pages rendered and inspected. Staff management report route denied. Production mobile Management Leave: dark cards, transparent workspace, viewport/body 375px, zero escaped cards; screenshot saved. Restored original light theme and browser dimensions. Production error-log query returned no captured logs, which is not complete monitoring coverage. Local loaded Operations overview (13 cards), schedule and Attendance (6 cards) at 320 also stayed within workspace. No real requests changed or SMS sent for this release QA. Remaining historical/turnaround/reminder reporting and other app audits remain explicitly open.
