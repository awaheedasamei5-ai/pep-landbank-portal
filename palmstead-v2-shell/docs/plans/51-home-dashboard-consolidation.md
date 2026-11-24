# Home dashboard consolidation

## Problem and data rules

The home page repeats Operations, Site Visits, updates and pipeline data in separate shortcut and activity cards. Preserve each destination and use existing role-scoped queries. Staff pipeline data must remain limited to their own agent key. The chart must never treat lead counts as money or imply that the width of a tiny segment is larger than its share.

## Layout

1. Keep the greeting and useful shortcuts as a compact navigation line.
2. Keep leads, outstanding balance, fully paid clients and complaints as one linked metric strip, ordered by daily sales importance.
3. Present one pipeline chart and the interactive banner map in equally sized columns. Management switches between pipeline value by person and lead count by stage. Staff see their stages. The center shows pipeline value in either mode; the caption states what segment sizes mean. Zero values remain listed but do not appear as invented slices. Colors, labels and numbers accompany every segment.
4. Combine coming tasks, upcoming site visits and company updates into one work card. Keep the links to the underlying apps and the permission checks.
5. Retain the approved payment trend below these decisions. Remove the second task and visit activity row, which duplicated the work card.

The chart uses the app's existing Recharts and theme colors, with Recharts automatic animation so reduced-motion preferences are respected. The layout must stack without horizontal overflow on narrow phones. Loading and empty states remain explicit.

## Verification and release

Typecheck, lint the edited files and build. Inspect Management and Staff at desktop and 320/360 px widths, including the chart switch, exact labels, links, map interaction and page overflow. Release only to the V2 `rebuild` branch per `docs/DEPLOY_INSTRUCTIONS.md`, then verify the exact Vercel build and fresh production alias.

