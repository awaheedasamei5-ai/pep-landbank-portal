# Live verification and bounded login/PDF repairs

## Scope and evidence (22 October 2026)

Verify the previously open Operations PDF downloads and Staff sign-in. Preserve all business data and the user's existing browser session. Use isolated browser contexts with the supplied test accounts. No SMS, record resets, or business mutations.

The browser-control runtime failed before launch inside MXC with HRESULT 0x80070020. A read-only command through the approved execution path succeeded; the official harmless MXC compatibility probe reproduced the launcher failure. The same approved path successfully launched an isolated headless Edge browser for app verification. This does not repair MXC itself or change sandbox policy.

Production baseline b6f23d5: Staff and Management password login, Operations reports loading, PDF download and page refresh passed without page errors. Actual PDFs downloaded: Staff 2 pages and Management 3 pages, both covering October 2026. Staff has its assigned issue and no company workload section; Management includes staff workload. Existing data currently contains one shared issue, so large-data and exclusion cases require separate fixtures.

## Reproduced defects and repair plan

1. **Login before hydration:** DOM-ready automation submitted the native form before the client handler attached. The missing method defaults to GET and includes form fields in the navigation URL. Add explicit POST and keep email, password, remember and submit controls disabled until hydration; show preparation and no-JavaScript guidance. Keep the existing authenticated client login and role logic.
2. **Repeated PDF footer:** each AutoTable page hook calls a helper that stamps all existing pages. Subsequent tables and the final call overprint earlier page totals. Reserve a bottom margin in each table, remove table-level footer hooks, and stamp once after all sections are complete.
3. **Duplicate chart ticks:** rounding fractional ticks at low counts produces repeated 1/0 labels. Use a positive integer tick interval with a matching upper bound and exact distinct integer labels.
4. **Staff section selection:** the export-section effect resets every Staff selection to Full report. Restrict that fallback to unauthorized workload selections; preserve permitted Staff summary, comparison, trend and register exports. Verify through actual downloaded filenames and section content.

These are bounded repairs to existing features, not an app architecture replacement. The shared PDF helper and Supabase schema/permissions remain outside the repair scope.

## Verification and release gate

- Build and typecheck the exact isolated rebuild source.
- Inspect the server-rendered login with JavaScript disabled and scripts delayed: POST method, disabled controls, no credential query-string navigation; verify ordinary ready-state login still works.
- On the local repaired build, use both roles to download the actual full PDF; also test section-only and filtered empty outputs, and mobile containment.
- Extract PDF text to confirm exactly one correct page counter/footer per page, correct section/filter metadata, role scope and chart tick labels. Render and visually inspect every downloaded page.
- Commit only the login/report repair and evidence to rebuild, deploy V2 under DEPLOY_INSTRUCTIONS, then repeat actual login/reload/PDF checks against production. Do not claim MXC or Vercel connector authorization repaired by these app changes.

## Results

The first production repair release is `a0d42f0`, tree `99e46808739f1061e4c8ed2b4f5b009dade97132`, READY deployment `dpl_ALSP19cWyNFoQyxpUzrAaycLVqBy` (32-second cloud build). Fresh production role suites passed login/reload, eight actual PDF downloads, Staff section preservation and scope handling, and the static login safeguards. All 13 production pages passed footer/bounds/section checks and were rendered/inspected. A deployment-specific 10-minute runtime error query returned no captured logs; this is not a complete monitoring certification.

Visual mobile review then caught an action clipped by a containing element even though document width equalled viewport width: the report header's export row did not wrap. Follow-up sets only that row to flex-wrap and strengthens verification to check the visible left/right bounds of Summary CSV, Register CSV and Download PDF at 360px. Horizontal report-section navigation and register tables intentionally scroll within their own containers. This follow-up is verified and released separately; no PDF builder or auth behavior changes in it.

The follow-up source compiled in the isolated development server and both role journeys rendered all actions within the 360px viewport: Summary CSV x=16..152.20, Register CSV x=160.20..288.97, Download PDF x=16..154.25 on the next row. The Staff mobile screenshot was inspected at reading size and confirms the wrapping. Cloud production build and fresh production bounds/download checks are required for this final CSS-only follow-up; do not rely on document scroll width alone as a clipping test.

The isolated production build compiled successfully and passed its full TypeScript check. Actual local Management and Staff login/reload checks passed without page errors. A no-JavaScript browser verified POST and disabled credential/submit controls. Each role downloaded full, trend-only, comparison-only and filtered empty-register PDFs; Staff section selection is preserved, the Staff person URL parameter is removed, and the company workload section is absent. All eight PDFs (13 pages) passed exact single-footer/page-count, page-bound and section/filter checks; every rendered page was inspected, with the full Staff chart/footer also inspected at reading size. Mobile page and viewport widths both measured 360px for each role. Live data was not changed.

Focused lint found an existing nonsemantic date-range group and a new nested label ternary. The date group now uses a fieldset and the login label uses explicit branches. Focused lint now exits successfully (five pre-existing class-order informational notices). The final production build compiled in 92 seconds and passed TypeScript in 14.7 seconds. Both role browser suites were repeated against that exact build: login/reload, disabled no-JavaScript controls and POST, eight downloads, Staff scope handling, 360px containment and zero page errors all passed. The final eight PDFs/13 pages passed the same text, footer, bounds and scope checks. Vercel CLI device login was refreshed deliberately by the user, and project inspection/API confirmed the intended project and Git production branch. Post-release verification follows the automatic deployment of this verified source; its artifacts belong in the workspace output/live-operations-verification/production-final folder, without credentials or persistent browser state.
