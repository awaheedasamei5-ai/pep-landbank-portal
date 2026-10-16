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

Awaiting source commit, scoped V2 deployment and fresh production verification. Read DEPLOY_INSTRUCTIONS in full before deploying. Update this section with exact source/deployment evidence after completion. No reset, restore, approval, SMS, financial record or business-data edit was executed during these checks.

## Next work

Continue the cross-app Back/Close/Cancel and unsaved/pending form matrix and Operations Staff action permission contracts. The current broad Operations project/issue RLS must be addressed before exposing additional Staff destructive controls. Reset adapters deliberately pin the reviewed schema, so any later trigger/security migration requires an explicit reviewed adapter update. Then complete Operations reports/workflows, followed by Accounting workflows/reports/PDFs in plan 14's order.
