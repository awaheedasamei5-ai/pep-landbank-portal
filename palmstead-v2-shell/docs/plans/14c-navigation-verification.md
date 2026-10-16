# Navigation foundation verification — 16 October 2026

## Slice and sources

Management and Staff can return from the selected Operations layers, Attendance corrections and Accounting to a safe previous portal view. Meaningful Operations/Accounting tabs survive reload and browser history. This slice does not complete the wider cross-app navigation/form audit, Staff action security, Operations reporting rebuild or Accounting rebuild. See plan 14 and navigation contract 14b.

Implemented against the current committed V2 shell, actual Next 16.3.4 Link/navigation documentation, existing Radix shadcn components, and the [GOV.UK Back-link guidance](https://design-system.service.gov.uk/components/back-link/). No protected UI primitive or V1 file changed. No routing dependency was added. Concurrent committed Notes/Chat/Memorandum remain in the release. Uncommitted Chat-attachment planning is separate work and must be preserved.

## Isolated checks

- `node scripts/qa/portal-navigation.mjs`: **121 assertions passed**. Real route registry/parents, URL validation, direct/reloaded context, repeated Back, meaningful tabs versus filter changes, forbidden Management destinations, native trail repositioning and bounded retention.
- Production Next build: compilation, strict TypeScript and all **87 generated pages passed** in the isolated review copy. The installed Supabase request builder requires abortSignal before single; the final build uses that supported order.
- Focused Biome check passed for the pure core, new provider/links, Accounting tabs and Operations boundary. Existing app files have pre-existing lint diagnostics; no whole-repository lint-clean claim. Automatic hook-dependency suggestions were removed, retaining existing data/draft/board behaviour.
- `git diff --check` passed. Existing Operations changes were reduced to navigation usage sites rather than unrelated formatting or logic changes.

## Browser checks against the built app on localhost:3004

Actual Management and Adams test accounts, real V2 data, no destructive mutations or messages:

| Journey | Evidence |
|---|---|
| Management Home → Operations | Labelled Back to Home; correct existing content and reset entry |
| Work Queue → Reset → Back | Returned to `/dashboard/operations?view=queue`, Work Queue aria-selected=true |
| Project Board → work item → reload → Back | Original project returned with `view=board`, Board aria-selected=true; link carries validated returnTo |
| Accounting Payments → reload | `tab=payments`, Payments aria-selected=true |
| Payments → Expenses → native Back → native Forward | URL and selected tab followed Payments then Expenses |
| Accounting Expenses → Operations reports | Back href retained `/dashboard/finance?tab=expenses`; reports rendered existing real data |
| Direct Attendance corrections → Back | Fallback returned to existing Attendance page |
| Staff Home → Operations | Adams agent identity; reset entry count=0; Back to Home present |
| Staff Work Queue → Reports → Back | Staff assigned-work report; return retained `view=queue`, aria-selected=true |
| Staff direct reset route | Management access required; no preview/reset/recovery form shown; safe Back to Operations |
| Staff Accounting Payments | `tab=payments`, Payments aria-selected=true |
| Identity restoration | Signed Management back in after Staff checks |

The browser exposed an existing background-tab opening defect in OperationsDataBoundary: it skipped the initial version check when hidden. Initial checks now run regardless of visibility; later hidden-tab polls remain skipped. Queries use a 15-second abort signal and abort on unmount. The final built app opened Operations and completed the journeys above without browser/server errors. This does not establish every possible network/auth failure mode.

### Responsive and theme proof

Accounting at **320 × 820**: document scrollWidth=320, viewport=320. The 546px tab list scrolls within its 288px container; the document does not overflow. The existing Expenses register also scrolls locally. Light and dark screenshots were saved and visually inspected:

- Workspace `output/screenshots/navigation-accounting-mobile-light.png`
- Workspace `output/screenshots/navigation-accounting-mobile-dark.png`

Temporary viewport override was reset. Keyboard and full overlay/dirty-form verification remain part of the wider matrix; they are not inferred from these screenshots. Browser waits sometimes returned before route content settled; recorded assertions use the actual rendered selected tab and destination URL, not the intermediate Opening Operations screen.

## Release

**Published and deployed.** Source commit `926b2f1ab841360eb351fdce1c615bafb8210b2e`, Git tree `d6c1f9a24fbf37f84edd8f2430703e380e42176b`. Local backup `codex/navigation-local-20261016` retains the identical-tree local commit `ac778c6`. The GitHub rebuild update used an expected-head lease, and the local branch was aligned only after identical-tree verification; concurrent uncommitted Chat sources were preserved.

Exact isolated release contained **1,958 committed V2 files**; **1,893 application files** were verified against the source of the built/role-tested review app. No .env, node_modules or .next was uploaded from the local review server. DEPLOY_INSTRUCTIONS was read in full again, project/org IDs checked, then the authorized scoped V2 command was run from the release's palmstead-v2-shell folder.

Vercel deployment **`dpl_6DZQXce2iSqJz3ddTsjQmpTtMyAk`**, created **16 October 2026 11:59:39 UTC**, returned **READY** and assigned `https://palmstead-v2-shell.vercel.app`. Deployment URL: `https://palmstead-v2-shell-duql5t1td-dnm-garments.vercel.app`. Vercel's own build, TypeScript and 87-page generation also passed. Scoped inspect confirmed the production alias.

Production was refreshed and fresh actual-role sessions checked. Management: new Operations Back/reset controls; Work Queue → Reset → Back returned to `view=queue` selected=true; Accounting Reports retained `tab=reports` selected=true after reload. Staff: Adams agent identity, reset entry count=0, assigned-work Reports only, Reports Back retained `view=queue` selected=true. Management was signed back in and Operations reports opened afterward. A stalled initial production browser sign-in was recovered by closing only the agent-created stale tab and using a fresh normal sign-in. No account credentials, browser security or environment values were changed. Do not describe that recovery as proof of a general auth-resilience fix.

A bounded 15-minute/20-entry error-level query for this exact deployment returned no captured logs. That is not a full monitoring audit. No reset, restore, approval, SMS, financial record or business-data edit was executed during these checks.

## Next work

Continue the cross-app Back/Close/Cancel and unsaved/pending form matrix and Operations Staff action permission contracts. The current broad Operations project/issue RLS must be addressed before exposing additional Staff destructive controls. Reset adapters deliberately pin the reviewed schema, so any later trigger/security migration requires an explicit reviewed adapter update. Then complete Operations reports/workflows, followed by Accounting workflows/reports/PDFs in plan 14's order.
