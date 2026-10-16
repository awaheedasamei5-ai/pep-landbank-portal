# Return navigation across Palmstead apps

## 1. Scope and evidence

This is the navigation implementation contract for plan 14, written after the Operations reset release. It does not change the user's order: finish Management reset and permitted Staff actions/Back controls, then Operations reports and workflows, then Accounting and PDFs. A navigation component is not proof that every app's forms or permissions work.

The current static inventory contains 85 dashboard page files, including business routes, old examples and framework pages. It follows actual page imports for up to three levels to find possible ArrowLeft/Back handlers. The companion CSV is deliberately labelled provisional: an imported icon, a comment, an inner wizard button or a layout not reached by the scan does not prove a page has a working Back control. Chat and Notes are now real separately committed apps. Do not replace them with templates or remove their changes. Home needs no Back-to-itself link.

Concrete current gaps include Operations reports and Attendance corrections lacking a top-level return, root app pages without a route back to Home, and Accounting/Operations primary tabs held only in component state. A fixed parent link cannot restore a filtered report or selected schedule tab. The copied React Router shim's `navigate(-1)` currently calls unrestricted browser Back; direct deep links can therefore leave Palmstead. Its `useSearchParams` setter is also currently a no-op and must not be treated as a working filter persistence API.

The dashboard's PageTransition keys its contents on pathname. It remounts nested route content on a change of page, so a navigation trail belongs outside that keyed content. Do not store the trail inside each screen or assume a nested Operations layout survives the transition. Existing overlay/list layouts also need their own Close/Cancel semantics; a shell Back button cannot substitute for a drawer closing to its list.

## 2. Research and actual source

Use the already cloned shell Button/Dialog primitives and actual existing app return controls. The official shadcn skill was installed from `shadcn-ui/ui/skills/shadcn` using the bundled skill installer and read locally. The project reports Next 16.3.4, React 19, Radix Nova, Tailwind 4 and Lucide; local wrappers must be inspected before use. No protected UI primitive is edited. The source register is the existing shell and its licensed components, not a newly invented design system.

The [GOV.UK Back-link guidance](https://design-system.service.gov.uk/components/back-link/) establishes a deliberate return in a multi-page flow and restoration of the prior state. The local Next documentation under `node_modules/next/dist/docs/01-app/` was read for Link, useRouter, usePathname and useSearchParams. Next recommends Link for navigation; push adds a browser entry, replace does not; untrusted URLs must be sanitized before either. The current Link API exposes onNavigate for client navigation, distinct from all click events. Its documented use is preferred over intercepting modifier clicks manually where possible.

Official [Button](https://ui.shadcn.com/docs/components/radix/button) and [AlertDialog](https://ui.shadcn.com/docs/components/radix/alert-dialog) references apply: use the local Radix asChild composition, built-in variants, a text label and a Lucide icon with data-icon. Destructive discard confirmation uses AlertDialog with a title/description, explicit cancel and focus restoration. Buttons and overlays must remain keyboard-operable on mobile and desktop. Do not install a new routing library or replace the existing Next adapter.

## 3. URL and parent-route contract

Create a pure, tested route registry from actual business pages, excluding template dashboards and external URLs. Each pattern has a title, app root, valid parent and any Management restriction. Dynamic parents carry the same validated record/project parameters: an Operations issue returns to its real project page, not the nonexistent `/issues` index; Leave edit returns to its request detail; request detail returns to Requests; app roots return to Home. Management settings and reports fall back to an existing authorized app page.

Accept only relative registered `/dashboard` targets. Reject schemes, protocol-relative URLs, backslashes, control characters, oversized values and invalid encoded path segments. Decode defensively to reject encoded or nested slash/backslash/dot traversal. Validate the normalized URL again against the registry. Do not use history length, referrer headers, an arbitrary href or a caller's role claim as permission to navigate. The server remains the authorization boundary; the client registry simply avoids pointless returns to known forbidden Management pages.

The optional `returnTo` value is consumed once, validated and stripped from the returned target. Reject ambiguous repeated return parameters and recursive chains. Filters on the target remain intact. Do not put credentials, form contents, letter wording, private notes, signatures or payment instructions into navigation state or query strings. An invalid return value falls through to a trusted local trail and then a deterministic parent; it never leaves the portal or executes a URL scheme.

Ignore same-view self-return targets to prevent loops. A distinct report section or app tab may be a meaningful view even at the same pathname; routine changes to a date/employee/status filter are not dozens of new Back steps. Preserve the exact current filter URL for the view being left. Query normalization must not silently drop supported filters or rewrite ordered business values.

## 4. Trail and browser-history contract

Keep a small per-tab trail in a provider outside PageTransition, in memory only. Clear it when the signed-in staff identity changes. Track sanitized URLs, meaningful view keys and recorded scroll positions, not business rows. Cap retained entries. An ordinary page or meaningful tab visit appends; filter replacement updates the current entry; native browser Back/Forward repositions to its recorded destination using the public popstate event, without modifying Next's private history state.

The app Back action chooses validated returnTo, then the previous meaningful authorized visit, then the registered parent. It navigates deliberately and truncates its own forward trail to avoid toggling between the detail and list forever. A normal Link remains a real link with a safe fallback href: open-in-new-tab and keyboard modifier behavior still work when there is no in-memory trail. Do not replace ordinary native browser Back/Forward behavior globally.

Record scroll without rendering on every pixel. App Back may restore the saved view position with scroll:false and a bounded layout-aware restore after content becomes available. Do not keep an unbounded observer or timer running after navigation. A deep link or reload with no memory trail uses the validated explicit return context or parent; it does not guess an external browser entry. Native history scroll restoration remains the browser's job.

The React Router adapter must delegate `navigate(-1)` to the safe return contract, preserving its existing string navigation and state handoff behavior. Implement its query setter using Next with an explicit replace policy for filters; the existing no-op is a real gap. Do not silently change all pushes into replacements or alter the semantics of the +1 forward path. String targets still require the same URL-safety checks when they originate from user-supplied return context.

## 5. UI and layer coverage

Use one labelled page-return control per appropriate layer. Existing app Back rows should adopt the shared contract; missing pages receive it at a deliberate header location. Do not add a second floating or fixed row over an existing one. A role switch such as My Leave is a separate navigation action and must not be labelled as Back if its target does not match the return destination. Root Home has no self-link. Templates stay excluded from the business-app coverage claim.

Implement first at the observed missing pages and Operations project/issue/report/reset layers, then audit Leave, Attendance, CRM/list overlays, Staff Hub/Directory/Profile, Memorandum/Notes/Chat and Accounting. The CSV needs separate page and inner-layer checks. Every Dialog/Drawer/Sheet needs an accessible Close/Cancel and a correct return/focus target; a calendar's date arrow is not an app Back button. Test forms, approval details, settings subpages, filtered drill-through, report sections, calculator steps, download previews and empty/error/forbidden states.

Persist Operations root view (Overview, My Schedule, Work Queue, Audit Log) in a validated URL value. Persist Accounting's existing primary tabs in the URL as part of navigation work, retaining the panels and data logic. Invalid values fall back to the appropriate default. Changes use ordinary Next navigation and preserve other valid query context. Tab rows wrap or scroll locally on narrow screens. This does not count as the later Accounting workflow/report/PDF audit.

Add explicit validated return context to source drill-through links where a reload/bookmark must retain the original filtered register. Do not indiscriminately rewrite every anchor in the document. Existing overlays which keep the parent list mounted should retain that useful behavior. Back from a detail must not reset the company's filters or change the selected employee/year without a visible reason.

## 6. Unsaved and pending forms

Provide an opt-in shared guard for dirty forms and pending mutations, then wire it to each actual form during the layer audit. Dirty Back opens a discard/stay choice; cancelling keeps entered values and restores focus. A pending save must not look cancelled while the server may still commit. Save success clears the guard; save failure preserves the draft and return context. Native reload/tab-close gets the ordinary beforeunload protection when a form is dirty. Do not claim all forms protected until the matrix rows are wired and exercised.

Guard ordinary internal link navigation and the copied router adapter where they leave a registered dirty form. Preserve modifier clicks/new tabs and downloads. Do not add browser permission requests or invent autosaving. Parent confirmation dialogs must not be bypassed by the new Back control. Reset execution continues to use its server-bound batch and idempotency contract; navigation cannot cancel a completed server transaction.

## 7. Verification and release

Pure tests cover every registered parent pattern, unknown paths, direct links, first visit, filtered list/detail/return, same-page report sections, tab changes, repeated Back, native Back/Forward, trail trimming and identity clearing. URL tests include javascript/data/http schemes, //host, backslashes, controls, percent/nested traversal, repeated/recursive returnTo and forbidden Management destinations. Do not infer security from a rendered icon.

Browser checks use actual Management and Adams sessions, desktop and 320–390px, keyboard, light/dark, meaningful tab/filter restoration, direct deep links and reloaded details. Exercise the missing Operations/Attendance controls first, then each business route and inner-layer row. Inspect query state and the rendered destination, not just a click succeeding. Do not send notifications, approve business requests or delete real records for navigation QA.

Run focused component review, typecheck and production build. Record exact tested sources/commit, role evidence, screenshots, known gaps and deployment. Read DEPLOY_INSTRUCTIONS before each V2 deployment. The source registry/CSV is an acceptance ledger, not a declaration that all 85 pages or all inner layers are complete. No new PDF is generated by navigation alone; Operations and Accounting report/PDF work retains its separate research and rendering gates.

## 8. Current status

Shared navigation foundation is implemented and verified locally, pending release. The provider lives outside PageTransition and clears its bounded in-memory trail on staff identity/role changes. It observes public popstate events, retains meaningful view/tab steps, replaces filter-only steps and restores saved scroll on app Back with bounded retries cancelled by user input. No Next private history state is read or modified.

Shared Back controls are wired at Operations root/project/work-item/reset/reports, Attendance corrections and Accounting. Operations root and project sections and Accounting tabs now read validated URL values. Operations project/list/board drill-through links carry validated returnTo context for reload/new-tab. Existing copied CRM navigate(-1) handlers now use the safe return contract; query setters work with filter replacement by default. This does not claim that all CRM forms/layers are verified.

The native Node QA script `scripts/qa/portal-navigation.mjs` passed 121 isolated assertions, including all 62 business routes, parent fallbacks, unsafe URL rejection, encoded spaces in record keys, role restrictions, exact filtered return, repeated Back, native trail repositioning and bounded retention. Node's module-type warning is harmless; package.json was not changed just to silence the QA runner.

Browser evidence for this slice is in `14c-navigation-verification.md`. Still outstanding: cross-app page/overlay coverage; opt-in unsaved/pending form guards and wiring; remaining filter state held outside URLs; project/issue loading-state Back; all Staff action permissions and later Operations/Accounting report workflows. The static CSV remains a provisional inventory. Do not describe the whole navigation programme as completed or released until those rows have their own evidence. No real business records were changed by these navigation checks.
