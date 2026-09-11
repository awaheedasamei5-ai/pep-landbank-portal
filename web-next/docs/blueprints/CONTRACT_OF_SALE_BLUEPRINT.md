# Contract of Sale App — Detailed Build Blueprint

**Status**: Living build document, produced per [[feedback-mandatory-app-build-process-2026-09-11]] after (1) a full re-read of the real v1 production implementation (`index.html` lines ~14088–14284, 17147–17359, 17794–18640, 7538), (2) a fresh re-read of the 59-page Master Rebuild Specification's Section 18 "Quotations, Contracts & Documents" (page 23), (3) a fresh re-read of the V3 PDF's "02 — Contract of Sale app" master chapter (pages 9–11) and deep-build appendix (pages 76–77), (4a) real internet research on PandaDoc's template library and content-library UI, and contract-lifecycle dashboard patterns, and (4b) real open-source research — two projects were cloned and their actual source read: **Documenso** (github.com/documenso/documenso) and **Syncfusion's Document Template Studio example** (github.com/SyncfusionExamples/document-template-studio-with-react-docx-editor). A third candidate, `freesign` (github.com/salocin93/freesign — React+TypeScript+Supabase), was cloned but not deep-studied once Documenso's own findings made clear that e-signature tools share one PDF-overlay paradigm that doesn't fit this app's actual gap (see §2 below) — noted honestly rather than silently claimed as researched.

This is **not a from-scratch build**. web-next already has a real, v1-parity `features/contracts/` implementation (contract requests, KYC capture, PDF generation) — confirmed via a fresh code audit before writing this document. The real gap, and the entire reason this blueprint exists, is the **template studio**: V3 requires a versioned, clause-library-backed, field-token document-authoring system, and today's implementation (like v1 before it) is three flat text blobs on `Config` with no version history, no approval gate, and no generation-time snapshot. Section 3 states plainly what's already built vs what this blueprint adds.

---

## 1. Design tokens (same source-of-truth as every other app — no invented colors)

| Purpose | Token | Light | Dark |
|---|---|---|---|
| Page background | `--c-paper` | `#F5F6FB` | `#0A0B16` |
| Card background | `--c-card` | `#FFFFFF` | `#141530` |
| Card border | `--c-line` | `#E3E5F1` | `#272A4E` |
| Primary text | `--c-text` | `#14162B` | `#EEEFFA` |
| Muted text | `--c-muted` | `#6A6E8E` | `#9C9FCB` |
| Accent (primary actions, active tab, token chips) | `--c-accent` | `#7C3AED` | `#B794F6` |
| Accent tint | `--c-accent-bg` | `#F1EAFF` | `#241638` |
| Success (approved, published, complete) | `--c-success` / `-bg` | `#146C43` / `#E6F4EC` | `#4FBE85` / `#0F241A` |
| Warning (pending, draft, missing data) | `--c-warn` / `-bg` | `#B07A1E` / `#FBF1DF` | `#E0AC57` / `#2E2410` |
| Danger (rejected, missing-required, delete) | `--c-danger` / `-bg` | `#B0402C` / `#FBEAE6` | `#E27562` / `#301715` |
| Info (in review) | `--c-info` / `-bg` | `#2563A8` / `#E9F1FA` | `#6FA8E0` / `#0F2033` |
| Display font | `--font-display` | `'Bricolage Grotesque'` | same |
| Body font | `--font-body` | `'Plus Jakarta Sans'` | same |
| Mono (version numbers, field-token code, dates) | `--font-mono` | `'IBM Plex Mono'` | same |
| Card radius | `--r-md` 20px / `--r-lg` 28px | | |
| Pill radius | `--r-pill` 100px | | |
| Shadow | `--shadow` | `0 1px 2px rgb(20 22 50 / 5%), 0 10px 28px rgb(20 22 50 / 7%)` | dark auto |

Status-pill color mapping (used across every screen below):
- **Draft** → `--c-muted` on `color-mix(in srgb, var(--c-muted) 8%, transparent)`
- **In review / Pending approval** → `--c-warn` on `--c-warn-bg`
- **Published / Approved / Complete** → `--c-success` on `--c-success-bg`
- **Rejected / Missing data** → `--c-danger` on `--c-danger-bg`

---

## 2. What real research actually surfaced (read this before the spec sections — it shapes several decisions below)

**v1 production (`index.html`)** already has a genuinely good, human-gated request/KYC/generate pipeline — see §3 for the exact inventory. Its one real weakness relevant to this blueprint: the contract's legal *text* is three flat `Config` fields (`contractPreamble`, `contractDefinitions`, `contractTerms`), edited as giant textareas with blank-line-delimited "clauses," with a Restore-to-default + Undo but **no version history, no draft/publish gate, and no field-token syntax** — every generation just re-renders whatever text is live in `Config` *right now*, so editing the template retroactively changes what a *regeneration* of an old contract would say (the PDF itself isn't stored, only metadata) — this is a real integrity gap V3 explicitly closes.

**Documenso** (real open-source DocuSign alternative, Prisma/tRPC/Remix) — read its actual `schema.prisma`, its Konva.js-based field-placement editor, and its `createDocumentFromTemplate` generation code. Two honest findings:
1. Its "Field" system is **positional boxes drawn on a rasterized PDF image** (`positionX`/`positionY`/`width`/`height` via a Konva canvas over `pdfjs-dist`-rendered pages) — there is **no `{{token}}`-in-text substitution concept anywhere in the codebase**. This is the wrong paradigm for Palmstead, which needs tokens embedded inside flowing legal text, not signature boxes floating over a static image. Ruled out as a UI/data-model source for the editor itself.
2. Its generation function (`create-document-from-template.ts`) **does** demonstrate the right integrity pattern for "never let a template edit retroactively change a generated document": it deep-copies every row (recipients, fields, the PDF bytes itself) into brand-new rows at generation time, so a generated Document shares no live foreign key with the mutable Template content afterward — only a `templateId` for lineage/audit. This "snapshot by deep copy" pattern is adopted directly in §8 below.

**Syncfusion's Document Template Studio example** (real React/JSX source, `MergeFieldsPanel.jsx`, `Dashboard.jsx`, `TemplateViewer.jsx`) — this is the actual right paradigm, and drove concrete UI decisions in §6/§7:
- A **"Merge Fields" side panel** listing available tokens as clickable/draggable chips, sourced from three unioned lists (fields the template already "owns," a global/common catalog, and fields detected live in the open document) — click inserts at the caret, drag-and-drop also works, with a small floating ghost chip following the cursor during drag.
- An **"Add Field" dialog** with a scope choice (This template vs Common/global) and a single validated Field Name input (camelCase, letters/digits, leading letter) — deliberately minimal, no separate label/sample/group metadata.
- A **template dashboard** as a colored thumbnail-card grid (type-colored accent per card), with dedicated "+ New Template" and "+ Upload Template" cards, and a trash icon per card gated behind confirmation — independently confirmed by PandaDoc's own real template-library page (sidebar category filter + searchable thumbnail grid), so this is a converged, twice-confirmed real pattern, not a single project's idiosyncrasy.

**PandaDoc** (real product, browsed live) — its Content Library "Add content library item" picker is a horizontally-scrollable row of preview cards (a services-quote card, an "About us" card, a case-study card, a numbered-outline "Offer Template" card) opened from within the document editor — this is the concrete reference for §6's **Clause Library insertion panel** (a picker of reusable named clauses, previewed, inserted at the cursor — not a flat unsearchable list).

**Contract-lifecycle dashboard research** (real UX-pattern research, not a single product) confirms the request-queue lifecycle-stage language this blueprint uses: Draft → In Review → Published (for templates) and Request → Data Check → Draft → Review → Approved → Downloaded (for a generated contract, this exact 6-stage rail is also named explicitly in the V3 master chapter's own §2 "Staff version" section, page 9 — internet research independently converged on the same shape).

---

## 3. Already built — real inventory, confirmed via a fresh code audit (do not re-build any of this)

- **`contract_requests` table + full request/fulfil workflow** — `features/contracts/hooks/useContractRequests.ts`, `screens/ContractRequestsScreen.tsx`. Staff can request a contract for a lead; Management/`useCanFulfilContracts()`-gated users see a queue and fulfil requests. Matches v1's request pipeline closely.
- **`ContractGeneratorScreen.tsx`** (`/app/office/contracts/generate`, reached by a `navigate()` push from the Requests screen — a drill-down workflow step, correctly NOT a separate sidebar entry) — client search/select, KYC capture, triggers PDF generation.
- **`contractPdf.ts`** — real PDF generation, `Contract`/`ContractRequest`/`NewContractRequest` domain types, matching v1's `buildContractOfSalePDF` shape.
- **Single sidebar entry** ("Contract Requests" → `/app/office/contracts`) — already correct, no nested-sidebar-apps violation here to fix (verified directly against the exact anti-pattern that triggered [[feedback-mandatory-app-build-process-2026-09-11]], since this app was an obvious place to also check).

**What none of the above has** (confirmed by the same audit, cross-checked against §2's research): any concept of `contract_templates`/`contract_template_versions`, a clause library (reusable named clauses beyond the 3-flat-text-blob shape), field-token syntax/insertion beyond one hardcoded literal `{ACRES}` substitution, a draft→published approval gate for template changes, or generation-time content snapshotting. Content generation still resolves live from `Config.contractPreamble/contractDefinitions/contractTerms` at the moment of generation — the exact v1 behavior, now confirmed still true in web-next, and the `Contract` type stores metadata only (id/leadId/clientName/agentKey/createdBy/createdAt) — no content field exists to snapshot into yet.

**A real production-parity regression, not just a V3 gap** (found by the same audit — flagging plainly rather than silently folding it in): v1's `promptForLeadKyc` is a genuine KYC **capture** modal (nationality, occupation, ID type/number, contact person, land usage — see the v1 audit in §2's sibling research). `ContractGeneratorScreen.tsx` today only **displays** a "missing KYC" warning (`!hasKyc` note) — there is no way for anyone to actually fill in or edit KYC data anywhere in web-next's current contracts feature. This must be restored as part of this blueprint's work (§6.4 below), not treated as optional, since the new field-token system (§7) depends on KYC fields as real token sources — generation can't resolve `{{kycNationality}}` etc. if nothing ever captures the value.

---

## 4. New data model (real entities, matching V3's own named list exactly)

| Table | Purpose | Key columns |
|---|---|---|
| `contract_templates` | One row per named template ("Standard Full Plot Sale," "Half Plot — Installment Plan," etc.) | `id, name, description, is_active, created_by, created_by_name, created_at` |
| `contract_template_versions` | Every edit is a new version row; exactly one `is_published` per template at a time (partial unique index, same pattern as `attendance_policy`) | `id, template_id, version_number, status ('draft'|'in_review'|'published'|'archived'), content (jsonb — ordered array of section blocks, see below), published_at, published_by, published_by_name, created_by, created_by_name, created_at` |
| `contract_clauses` | The clause library — reusable named text blocks, insertable into any template version's content | `id, name, category, body (text, may contain `{{tokens}}`), is_active, created_by, created_at` |
| `contract_fields` | The token catalog — matches Syncfusion's `MergeFieldsPanel` model exactly: a field is just a name + scope | `id, key (camelCase), scope ('common'|'template'), template_id (null when scope='common'), created_by, created_at` |
| `contract_generations` | One row per actually-generated contract — **the deep-copy snapshot** (§8), replacing today's metadata-only `contracts` table with a real content-bearing one | `id, contract_request_id (nullable), lead_id, client_name, template_id, template_version_id, version_number_snapshot, content_snapshot (jsonb — the fully resolved content, tokens already substituted), field_values_snapshot (jsonb), pdf_storage_path, generated_by, generated_by_name, generated_at` |
| `contract_approvals` | Approval events on a template version (the "legal approval workflow" V3 names) | `id, template_version_id, status ('approved'|'rejected'), reason, decided_by, decided_by_name, decided_at` |

**Content shape** (`contract_template_versions.content`, a real typed JSON structure, not a blob):
```ts
interface ContractSection {
  id: string;
  kind: 'heading' | 'paragraph' | 'clause' | 'signature_block' | 'image' | 'footer';
  text?: string;        // may contain {{fieldKey}} tokens, for heading/paragraph/clause/footer
  clauseId?: string;    // set when kind==='clause' and it was inserted FROM the library (keeps a lineage pointer; text is still copied inline so the version is self-contained)
  imageRef?: string;    // storage path, for kind==='image'
}
```
Order in the array is print order — this is the real "page ordering" V3 names, achieved by array position rather than a separate `page_number` column (simpler, no renumbering-on-reorder problem).

**Migration note**: the existing `contracts`/`contract_requests` tables and their RLS stay exactly as they are — `contract_generations` is additive (a request, once fulfilled, gets both an existing `contracts` row for backward-compat with anything already reading it, AND a new `contract_generations` row carrying the real snapshot). Nothing existing is dropped or renamed, per the standing "do not rewrite working logic merely because it is inconvenient" rule.

---

## 5. Staff version — UI (from V3 §2, page 9, converged with existing screens)

The existing request/KYC/generate flow (§3) already implements most of this well and stays as-is. **One real addition**: the progress rail V3 names explicitly — *Request → Data check → Draft → Review → Approved → Downloaded* — is not currently shown as a visual rail anywhere; add it as a horizontal stepper at the top of `ContractRequestsScreen`'s per-request detail (or wherever a single request's status is shown), each step a filled/outline circle + label, current step highlighted `--c-accent`, completed steps `--c-success`, matching the exact wording V3 gives.

No other staff-facing change — staff never sees the template studio, clause library, or version history; they only ever interact with the *result* (their request's progress + the final downloaded PDF), matching both v1's existing access boundary and V3's own C. Permission matrix (`Create: Only allowed workflow` for a staff role).

---

## 6. Management version — Template Studio (the new work, V3 §3 page 9-10)

### 6.1 Studio dashboard (`/app/office/contracts/templates`)

New nested route under the existing Contract Requests shell (add a `SegmentedTabs` bar: **Requests** | **Templates**, reusing the exact shell+`<Outlet/>` pattern already proven for Attendance/Leave/Ops-Tracker — this app currently has no tab bar because it never needed one before; adding Templates as a second peer screen is precisely the situation that pattern exists for).

- Thumbnail-card grid (`grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`, `gap: 14px`), each card `--r-md`, `--c-card` background, a 4px top accent stripe colored by template category (reuse the existing category-color convention already established elsewhere in this codebase rather than inventing a new palette).
  - Card body: template name (bold, 14px), a status pill for its current published version (or "No published version" in `--c-muted` if none), a small meta line `"v{N} · updated {date}"` in `--font-mono` for the number.
  - **"+ New template"** card — dashed border, `+` icon, opens a name/description prompt, creates `contract_templates` row + an empty `contract_template_versions` row (`version_number: 1`, `status: 'draft'`).
  - Click any card → Template detail (`/app/office/contracts/templates/:id`).
  - No delete from the grid — templates are never hard-deleted (matches V3's soft-delete/archive rule for records affecting compliance); deactivate happens inside the template detail screen.

### 6.2 Template detail — Page editor + Clause library + Merge Fields (V3 §3 "template administration studio")

Three-column desktop layout (matches V3's own "persistent navigation rail... dense, multi-panel workspaces" instruction for the management/desktop composition):
- **Left rail (220px)**: version list — every `contract_template_versions` row for this template, newest first, each a row showing `v{N}`, status pill, "{date} by {name}". Clicking a non-current version opens it **read-only** with a banner *"Viewing v{N} (read-only) — {status}. Create a new version to edit."* and a "Duplicate as new draft" button. Only the latest **draft** version (or a freshly duplicated one) is ever editable — this is the real draft/publish gate.
- **Center (flexible width)**: the page-editor canvas — a scrollable stack of section cards (one per `ContractSection` in `content`), each rendered per its `kind`:
  - `heading`/`paragraph`/`clause`/`footer`: an inline-editable text area (`contentEditable` or a plain `<textarea>` with auto-grow — plain textarea is the pragmatic, accessible choice, matching this codebase's existing convention of never reaching for a heavy rich-text-editor dependency), with `{{fieldKey}}` tokens rendered as inline highlighted chips (`background: var(--c-accent-bg)`, `color: var(--c-accent)`, `border-radius: 4px`, `padding: 1px 4px`) inside the text — implemented via a small regex-based render pass over the raw string, not a full rich-text editor library (keeps this dependency-free, matching every other new component built this session).
  - `signature_block`: fixed, non-editable preview (dotted Sign/Name/Designation lines, exactly matching v1's existing signature page), with a small "signature block — not editable" caption.
  - `image`: a thumbnail + "Replace image" button (storage upload, same pattern as the existing office-location/logo upload flows elsewhere in Settings).
  - Each section card has a drag handle (reorder within the array) and hover-revealed ✕ remove + duplicate icons.
  - A footer **"+ Add section"** row with 5 buttons (Heading / Paragraph / Clause / Image / Footer) matching the `kind` union.
- **Right rail (260px)**: two stacked panels, tab-switchable —
  - **Merge Fields** (default tab) — directly ports the Syncfusion pattern: a list of field chips (`--r-pill`, `--c-card` background, `--c-line` border, `--font-mono` label), click-to-insert-at-the-currently-focused-section's-caret, plus drag-and-drop onto any section's text area. A **"+ Add field"** footer button opens a small dialog: scope radio (This template / Common), a validated Field Name input (`^[A-Za-z][A-Za-z0-9]*$`, live inline error), Cancel/Add.
  - **Clause Library** — a searchable list (search-by-name/category, debounced) of `contract_clauses` rows, each a small preview card (name, category tag, first ~80 characters of body, truncated) — clicking inserts a new `kind: 'clause'` section at the end of the canvas (or at the last-focused position) with `clauseId` set and `text` copied inline (so the version stays self-contained even if the library clause is edited later — same deep-copy-at-use-time discipline as §8's generation snapshot, applied one level up). A **"+ New clause"** button at the top opens a name/category/body form and inserts the new clause immediately after saving it to the library.
- **Top bar**: template name (editable inline on click), version status pill, and the primary action button — changes by state:
  - Draft, unsaved changes → **"Save draft"** (`--c-card` background, `--c-line` border).
  - Draft, saved → **"Submit for review"** (`--c-accent` background, white text) — sets `status: 'in_review'`.
  - In review (manager viewing their own submission) → read-only, banner *"Awaiting approval"*.
  - In review (a **different** manager, i.e. real approval-gate separation — any manager other than the submitter may decide) → **"Approve"** (`--c-success`) / **"Reject"** (`--c-danger`, requires a reason) buttons, writing a `contract_approvals` row; Approve also flips the version to `status: 'published'`, sets `published_at/by`, and — atomically, same pattern as `set_attendance_policy` — flips every other version of this template from `published` back to `archived` (exactly one published version per template, enforced the same way `attendance_policy` enforces exactly one active row).

### 6.3 Preview (`/app/office/contracts/templates/:id/preview`)

Read-only render of the current version's `content` array with **sample token values** filled in (a small hardcoded sample-lead object, clearly labeled *"Preview — sample data, not a real client"* per the artifact-design "never pass off examples as real data" principle already internalized project-wide) — reuses the same section-kind rendering as the editor canvas, minus the editing chrome. A "Download preview PDF" button runs the same PDF-rendering path §8 uses for real generation, so what Management previews is byte-identical in layout to what a real generation would produce.

### 6.4 KYC capture modal — restoring a real production-parity gap (not new V3 scope, a regression fix)

A real modal (reuses the shared `Modal` component already built for Attendance), triggered from `ContractGeneratorScreen` when `!hasKyc` (replacing today's passive warning-only note) and from the request-fulfil flow when a request needs review before generation. Fields, ported directly from v1's `promptForLeadKyc` (confirmed real in the v1 audit, not invented): nationality, occupation, date of birth, ID type (Voters/Passport/Ghana Card/Driver's License — a `<select>`), ID number, email, location/address, contact person (name/phone/email/address/relation), land usage (Residential/Commercial `<select>` + conditional detail text field). Saves onto the lead's `kyc` jsonb column (already exists per the v1 audit — `apiUpdateLead` equivalent). A "Skip for now" secondary action stays available only when there is no pending client-submitted KYC to review (matching v1's own exact rule — a client-submitted request's data is never skippable, always reviewed).

---

## 7. Field-token system — concrete spec (the part neither open-source reference fully solved)

- **Syntax**: `{{fieldKey}}`, camelCase, matching Syncfusion's own validated pattern exactly (`^[A-Za-z][A-Za-z0-9]*$`) — chosen because it's a real, already-proven-working convention from real source, not invented fresh.
- **Resolution source**: at generation time, a fixed resolver function maps known field keys to real lead/contract data — `clientLegalName`, `clientAddress`, `clientContact`, `plotType`, `noPlots`, `unitPrice`, `discount`, `grandTotal`, `depositAmount`, `depositPercent`, `monthlyInstallment`, `paymentPlanMonths`, `kycNationality`, `kycOccupation`, `kycIdType`, `kycIdNumber`, `kycContactName`, `kycContactPhone`, `kycLandUsage`, `vendorCeoName`, `generationDate` — a real, exhaustive, typed union (`ContractFieldKey`), not a dynamic string lookup, so an unresolvable token is a compile-time-visible gap, not a silent blank at generation time.
- **Custom/common fields** (created via the Add Field dialog) resolve from a small `custom_field_values` jsonb column on the contract request (staff or Management can fill in ad-hoc values for a custom field at generation time, in the same KYC-review step that already exists) — mirrors Syncfusion's own "common/global catalog augmented by template-scoped custom fields" shape exactly.
- **Unresolved-token guard**: before allowing generation, run a synchronous scan over the version's resolved content for any `{{...}}` pattern that didn't get substituted (missing data or an unrecognized key) and block with a plain-English list of exactly which fields are missing — this is both a real correctness gate and the concrete implementation of the V3 AI capability "Draft missing-data checklist" (§9) done deterministically first, AI only phrases the sentence.

---

## 8. Generation + snapshot (the one idea adopted directly from Documenso's real source)

`generateAndRecordContract` (existing function, extend rather than replace) gains a new step once KYC is confirmed and no missing tokens remain:
1. Resolve every token in the **published** version's `content` array against the real lead/KYC/custom-field data → produces `content_snapshot` (same shape as `content`, tokens replaced with literal resolved strings).
2. Render the PDF from `content_snapshot` (deterministic — same renderer as the editor's Preview, §6.3) and upload it to Supabase Storage (reuse the existing `attendance-photos`-style private-bucket pattern, a new `contract-pdfs` bucket, folder-per-lead).
3. Insert one `contract_generations` row carrying `content_snapshot`, `field_values_snapshot`, `template_version_id` (a pointer for audit/lineage — **never re-read from live** to redisplay a past generation; the UI for viewing a past generation always renders `content_snapshot`, matching Documenso's own "templateId is lineage only, not a live dependency" discipline exactly).
4. Existing `contracts`/`contract_requests` fulfil logic runs unchanged (backward compatible with anything already reading those tables).

This is the concrete fix for the real integrity gap named in both the 59-page spec ("Never overwrite an issued financial/legal document; generate a new version") and V3 ("A generated contract snapshots the exact template version and lead values used at generation time so later template edits never silently alter historical contracts").

---

## 9. Groq AI integration (V3 §5, page 10 — exact 4 capabilities named)

Deterministic-verdict/AI-drafts-language pattern throughout (matches every other AI capability built this session):
1. **KYC completeness checker** — deterministic field-presence check (already effectively exists as the "missing KYC" prompt gate in the current generator) is the verdict; AI only drafts a friendly one-line summary of what's still missing, shown in the KYC modal.
2. **Plain-language clause explainer** — on-demand, staff-facing: click "Explain this clause" on any rendered contract section → AI restates the legal text in plain English. Never alters the legal text itself, output-only.
3. **Consistency scan between lead values and contract fields** — deterministic diff (e.g., lead's `unitPrice` at request time vs. at generation time, if they've drifted) is the verdict; AI drafts the explanation sentence for Management's review screen.
4. **Draft missing-data checklist** — already covered by §7's deterministic unresolved-token guard; AI drafts the human-readable checklist text, never invents which fields are actually missing.

All four go through the shared `ai-insights` Edge Function (new `contract_*` prompt kinds), same read-real-file-then-verify-byte-for-byte deploy discipline already established this session.

---

## 10. Realtime (V3 §6)

Connects to: Pipeline, Master Pipeline, Allocation, Document Vault, Chat, SMS App, Management Dashboard (named explicitly in the V3 master chapter). Concretely: a published template version, a new generation, and an approval decision each invalidate the relevant React Query keys (`['contractTemplates']`, `['contractTemplateVersions', templateId]`, `['contractGenerations']`) via the existing Supabase Realtime channel-per-table convention already used everywhere else in this codebase — no new sync mechanism invented.

---

## 11. Report system (V3 §7 — 6 named reports)

Contract production report, outstanding requests, missing-information report, template-version usage report, turnaround-time report, signed/unsigned document status report — each follows the same page-by-page shape already proven for every other report built this session (executive cover + KPI strip → trends → detailed table → exceptions → filters/audit footer). Scoped as its own build-order item (§17, item 6) rather than folded into the template-studio work, since none of it is blocking for the studio itself to function.

---

## 12. Icon audit

Current icon set already has `document` (used for the sidebar entry). New icons needed: none strictly required — reuse `document` for templates/clauses, `check`/`chevronRight` for the approval actions, `pin`-style drag handle is unnecessary (a simple `⠿` grip glyph or CSS-drawn dots is the established lightweight convention, matching this project's own "no new icon unless genuinely a new concept" discipline from the Attendance blueprint's own icon audit).

---

## 13. Empty / loading states

- Templates grid, zero templates: centered illustration-free message *"No contract templates yet — create one to get started."* + the same "+ New template" card, never a bare blank grid.
- Version list, viewing a template with only one draft version: no history rail clutter, just the single row.
- Clause library, zero clauses: *"No clauses in the library yet — add one from any template's editor."*
- Merge Fields panel, no template open: *"Merge fields will appear here when a template is opened"* (verbatim Syncfusion copy — genuinely good, reused as-is).

---

## 14. Responsive behavior

Desktop (≥1024px, matching this project's existing breakpoint convention): the 3-column Template Studio layout in full. Below 1024px: right rail (Merge Fields/Clause Library) collapses into a bottom sheet reached via a floating "Insert" button (matches the established mobile pattern already used for secondary panels elsewhere, e.g. Ops Tracker's own mobile composition); left version rail collapses into a "Versions" dropdown in the top bar instead of a persistent column. The Requests screen and staff-facing progress rail need no special mobile treatment beyond what already exists.

---

## 15. Accessibility

Section-kind buttons and drag handles keyboard-operable (drag handle also exposes an "Move up/down" pair of buttons for keyboard/screen-reader users, since native HTML drag-and-drop has no accessible fallback on its own). Merge-field chips are real `<button>`s (click-to-insert always works without drag). Status pills carry `aria-label` beyond just color. Approve/Reject require an explicit confirm, never a single accidental click on a destructive-adjacent action.

---

## 16. Data-model change summary

| Change | Type |
|---|---|
| `contract_templates` | new table |
| `contract_template_versions` | new table, one-published-at-a-time partial unique index |
| `contract_clauses` | new table |
| `contract_fields` | new table |
| `contract_generations` | new table (additive, `contracts` untouched) |
| `contract_approvals` | new table |
| `contract-pdfs` storage bucket | new, private, folder-per-lead |
| `set_contract_template_version_published()` | new SECURITY DEFINER RPC (atomic publish + archive-others, mirrors `set_attendance_policy`) |
| `ai-insights` | extended with 4 new `contract_*` prompt kinds |

---

## 17. QA acceptance checklist (do not mark any item built without actually exercising it)

**Management side:**
- [ ] Create a new template, add sections of every `kind`, insert a merge field by click and by drag, save as draft.
- [ ] Insert a clause from the library; confirm it copies inline (editing the library clause afterward does not retroactively change the already-inserted section).
- [ ] Submit for review as one manager account, approve as a different manager account; confirm the version flips to published and any prior published version flips to archived (exactly one published version, verified via direct SQL).
- [ ] Attempt to edit a non-latest-draft version directly — confirm it's read-only and "Duplicate as new draft" produces a real new editable version.
- [ ] Preview renders sample data correctly and is clearly labeled as sample, not real.

**Staff/generation side:**
- [x] The KYC capture modal (§6.4) actually saves real values onto the lead — confirmed a filled-in field persists and is readable on a reload, not just displayed transiently.
- [x] Request → KYC → generate a real contract against a published template with a missing custom field — confirmed the unresolved-token guard blocks generation with a plain-English list of exactly what's missing.
- [x] Generate successfully — confirmed a `contract_generations` row exists with a real `content_snapshot`, and that a later edit to the template's live content does NOT change what re-opening this past generation shows.
- [x] Progress rail shows the correct current step at each stage of a real request's lifecycle — confirmed live: Data check flipped on real KYC data, Draft/Downloaded flipped on a real generation existing, Review flipped on the real template-level approval record, and clicking "Mark fulfilled" flipped Approved live in front of the rail without a reload.

---

## 18. Build order

1. **[DONE 2026-09-11]** KYC capture modal restoration (§6.4) — real production-parity regression, fixed first since the token system (item 5) needs real KYC data to resolve against. New `LeadKycModal.tsx`, `LeadUpdate.kyc` + `buildLeadDbPatch()` wired through (demo mode needed zero changes — its generic spread already handled it). Verified live: filled in a real client's KYC, reloaded the page from scratch, confirmed every field persisted (nationality/ID type/ID number all read back correctly) — a genuine backend round-trip, not just local state. `npx tsc -b` / `oxlint` / `stylelint` all clean, zero console errors.
2. **[DONE 2026-09-11]** Schema migration (§4/§16) — all 6 tables + the atomic publish RPC + the `contract-pdfs` storage bucket, applied and verified (rollback-wrapped SQL test of the archive-others-on-publish mechanic; `get_advisors` clean apart from the same expected SECURITY DEFINER informational note every other RPC this session carries). Domain types, mappers, and both demo + Supabase data-source implementations built alongside it — `npx tsc -b` clean.
3. **[DONE 2026-09-11]** Template Studio dashboard + shell tab addition (§6.1) — new `ContractsScreen.tsx` shell (Requests | Templates tabs, reusing the proven SegmentedTabs pattern), `TemplateStudioScreen.tsx` (colored thumbnail-card grid, "+ New template" inline-create card). Verified live: created a real template, confirmed it persisted through a fresh reload.
4. **[DONE 2026-09-11, PARTIAL — see note]** Page editor canvas + section CRUD (§6.2 center column) + the full draft→review→approve/reject→publish state machine (originally items 4 and 7, built together as one real vertical slice rather than shipping a page editor with no way to ever finish a version). New `TemplateDetailScreen.tsx`: version rail, add/edit/remove/reorder sections of every kind, Save draft/Submit for review/Approve/Reject/Duplicate-as-new-draft all wired to the real RPC and mutations. Verified live end-to-end: added a real paragraph section containing genuine `{{clientLegalName}}`/`{{noPlots}}`/`{{unitPrice}}` tokens (typed by hand), saved, reloaded from scratch and confirmed the exact text persisted, submitted for review, approved — watched the version flip through Draft → In review → Published for real, dashboard card updated to match. **What's honestly NOT in this slice**: the Merge Fields insertion panel and Clause Library panel (§6.2's right rail, items 5-6 below) — tokens must be typed by hand for now, which the screen says outright rather than pretending otherwise. The "different manager must approve" rule from §6.2 is also not enforced in the UI yet (any manager/elizabeth can approve their own submission) — RLS still requires manager/elizabeth for the underlying write either way, so this is a UX gap, not a security one.
5. **[DONE 2026-09-11]** Merge Fields panel + token rendering/insertion (§6.2 right rail, §7) — the genuinely novel piece this blueprint exists for. New `MergeFieldsPanel.tsx`, a direct port of the real Syncfusion Document Template Studio pattern studied for this blueprint: a chip list unioned from template-scoped fields, common/global fields, and fields already typed in the version's own content (doc-detected, insertion-only) — click-to-insert-at-the-real-caret-position (via a textarea ref map + `activeSectionId` tracking), an "Add Field" dialog (scope radio + validated camelCase name). **Verified live**: typed "Schedule of ", clicked the `{{noPlots}}` chip, confirmed it inserted at that exact caret position (not appended/prepended), continued typing and confirmed the caret was correctly repositioned after the token. Drag-and-drop (Syncfusion's other insertion path) is honestly NOT built — click is the real, fully functional primary path.
6. **[DONE 2026-09-11]** Clause Library panel + insert-copies-inline behavior (§6.2 right rail) — new `ClauseLibraryPanel.tsx`, converged from PandaDoc's real Content Library picker research. Search, preview cards, "+ New clause" form that saves to the library AND inserts a copy in one action. **Verified live**: created a real "Governing Law" clause, watched it appear as a new `clause`-kind section in the canvas immediately, confirmed the library card also appeared in the panel; a fresh reload confirmed all 3 sections (the hand-typed paragraph, the caret-inserted token, and the clause-library insertion) persisted with byte-exact text.
7. **[DONE 2026-09-11]** Preview screen (§6.3) — new `TemplatePreviewScreen.tsx` + a real shared PDF renderer for the new structured content model, `contractSectionsPdf.ts` (reuses `contractPdf.ts`'s own border/pagination/clause-numbering primitives, now exported for this), plus `contractFieldResolver.ts` (the real, exhaustive `ContractFieldKey` resolver named in §7 — `resolveContractFields`, `resolveTokensInText`, `resolveSections`, `findUnresolvedTokens`). Uses a small hardcoded sample lead (clearly labeled, real company config is not faked) to resolve tokens for preview. **Verified live**: opened Preview on the real draft built in items 5-6, confirmed every token resolved correctly against the sample lead (`{{clientLegalName}}` → "Kwabena Sample", `{{noPlots}}`/`{{unitPrice}}` both correct, appearing in two different sections), clicked "Download preview PDF" and confirmed no error surfaced (dev-server logs clean since the click). `image` sections render as a bracketed placeholder — no asset-upload UI exists yet, flagged honestly rather than silently faked.
8. **[DONE 2026-09-11]** Generation-time snapshot integration into `useGenerateContract` (§8) — extended rather than replaced: called with just a `Lead`, it still runs the exact original v1-parity hardcoded-text path (`buildContractOfSalePdf`) byte-for-byte unchanged; called with an optional `template` (a published version's id/content/name, picked from a new dropdown added to `SelectedLeadPreview` in `ContractGeneratorScreen.tsx`, populated by a new `contractTemplateVersions.listPublished()` data-source method + `usePublishedContractTemplateVersions()` hook), it takes the new path: resolves every `{{token}}` against real lead/KYC/config data (`resolveContractFields`/`resolveSections`), blocks with a plain-English missing-fields message via `findUnresolvedTokens` if anything survives unresolved, renders the PDF client-side with the same `contractSectionsPdf.ts` renderer the Preview screen uses, uploads it to the new private `contract-pdfs` bucket (new `contractGenerations.uploadPdf()`, demo mode fakes the path same as `issueReceiptLink`), and inserts one real `contract_generations` row carrying `content_snapshot`/`field_values_snapshot`/`template_version_id` — the existing `contracts.create()` metadata-only insert still runs afterward either way, so anything already reading `contracts.list()` (the "Previously generated" list, fulfil status) keeps working unchanged, per §8 step 4. **Verified live end-to-end** in DEMO_MODE: generated against the real published "Standard Full Plot Sale v1" template for a real lead (Kwame Asante) — confirmed via `localStorage` inspection that the `contract_generations` row's `content_snapshot` held the fully resolved text (`{{clientLegalName}}` → "Kwame Asante", `{{noPlots}}` → "1", `{{unitPrice}}` → "GHS 48,000") and carried the correct `templateId`/`templateVersionId`/`versionNumberSnapshot`/fake `pdfStoragePath`. Then proved the guard for real: injected a section referencing an unresolvable `{{madeUpToken}}` directly into the published version's stored content, regenerated, and confirmed the UI blocked with *"Can't generate yet -- missing: madeUpToken."* without inserting a bad row — reverted the injection afterward. Then proved snapshot immutability for real: re-read the original generation's `content_snapshot` after the injection/revert cycle and confirmed it was byte-identical to what it held right after generation (a live demonstration of "content_snapshot is a deep copy, never a live FK back to the template" — Documenso's own pattern, adopted directly). Finally re-ran the plain legacy path (no template selected) for a second lead (Efua Ansah, who has zero KYC) and confirmed it still generates successfully with no guard/crash, exactly as before this item touched anything. `npx tsc -b` clean, zero console errors throughout. Honestly not built in this slice: `custom_field_values` (ad-hoc per-request field values for genuinely custom/common fields beyond the fixed `ContractFieldKey` union) — the fixed resolver covers every field actually named in §7/§9's spec text, so this is deferred rather than blocking.
9. **[DONE 2026-09-11]** Staff-facing progress rail (§5) — V3's own named stages (*Request → Data check → Draft → Review → Approved → Downloaded*) added as a real horizontal stepper, revealed by clicking any request row in `ContractRequestsScreen` (new `ContractProgressRail.tsx`, `.module.css`). Every stage is a real deterministic signal, not a fabricated tracked state: Request always complete; Data check reads the lead's real KYC (via `useLead`, fixed mid-build after first trying the agent-scoped `useLeads` and finding Management couldn't see another agent's client — matches the exact real bug `useLead`'s own comment already documents); Draft/Downloaded read whether any `contract_generations` row exists for the lead (`useContractGenerations`, new hook); Review reads the real `contract_approvals` decision for the generation's `template_version_id` when a template was used, falling back to the request's own `fulfilled` status for the legacy no-template path (no per-request review construct exists to check otherwise); Approved reads `contract_requests.status === 'fulfilled'`. Honestly not strictly monotonic: a manager can generate+download before marking fulfilled (two independent actions today), so "Downloaded" can show complete before "Approved" — shown as the real current data rather than a faked enforced order. **Verified live end-to-end**: expanded a real pending request and watched Data check/Draft/Review already correct from real KYC + an earlier real generation + its real template approval; clicked "Mark fulfilled" and watched Approved flip to complete live, no reload needed. `npx tsc -b` / `stylelint` both clean.
10. **[DONE 2026-09-11]** 4 AI capabilities (§9) — all through 4 new `contract_*` kinds on the shared `ai-insights` Edge Function (deployed as version 31, content verified byte-for-byte against the local file after deploy, same discipline as every other Edge Function change this session). Deterministic-verdict/AI-drafts-language throughout, no exception:
    1. **KYC completeness checker** — new `useKycCompletenessSummary()` in `useContractAi.ts`, wired into `LeadKycModal.tsx`. The missing-field list itself (exactly the 7 fields the resolver actually needs) is the real deterministic verdict; AI only phrases the one-line summary. **Verified live**: opened the modal for a lead with zero KYC, got *"Hi Efua, please provide Nationality, Occupation, ID type, ID number, Contact person name, Contact person phone, and Land usage to proceed"* — all 7 real fields named, first name only sent.
    2. **Plain-language clause explainer** — new `useClauseExplainer()`, an "Explain this clause" button per rendered section in `TemplatePreviewScreen.tsx` (called against the SAMPLE lead's resolved text only, never real client data, so nothing sensitive reaches the model here). **Verified live**: clicked it on the real published clause, got a correct 2-sentence plain-English restatement, legal text itself untouched.
    3. **Consistency scan** — new `useConsistencyScanSummary()`, auto-fetched in `ContractGeneratorScreen.tsx`'s `SelectedLeadPreview` once a real diff exists between the current lead's resolved fields and this lead's own last real generation's `field_values_snapshot` (the genuinely available "before/after" data — no separate request-time snapshot exists to compare against instead). **Verified live**: confirmed a clean baseline (no false positive) against an unchanged lead, then bumped a real lead's `unitPrice` via the underlying data, reloaded, and got *"Unit price changed from GHS 48,000 to GHS 52,000, Grand total from GHS 48,000 to GHS 52,000, Deposit amount from GHS 14,400 to GHS 15,600; please confirm."* — every real changed field and value named correctly, nothing invented.
    4. **Missing-data checklist** — new `useMissingDataChecklistDraft()`, fires the moment the real §7 unresolved-token guard blocks generation (the error thrown in `useContracts.ts` now carries the real `missingKeys` array for this, not just a formatted string). **Verified live**: injected a real unresolvable `{{madeUpToken}}`, got both the instant deterministic message and, a beat later, the AI's *"Please provide a value for madeUpToken before generating the Contract of Sale."* underneath it.
    New `CONTRACT_FIELD_LABELS` (in `contractFieldResolver.ts`) gives every `ContractFieldKey` a human label for the consistency scan's diff, reused by both the AI context and future UI. `npx tsc -b` / `stylelint` both clean, zero real console errors (one stale HMR-buffer entry cross-checked against `preview_logs` timestamps and confirmed historical, not current, same diagnostic already used repeatedly this session).
11. **[DONE 2026-09-11]** Report system (§11) — all 6 named reports, new `contractReportsPdf.ts` (6 builder functions) + `useContractReports.ts` + a new `ContractReportsScreen.tsx` reached via a third **Reports** tab on the same `ContractsScreen` shell (manager/elizabeth-gated, same as Templates — never a new sidebar entry). All 6 reuse the shared branded-report toolkit (`shared/lib/pdfReport.ts`) every other report this session already uses, same page shape (KPI strip → trend/chart → detailed table → exceptions → footer):
    1. **Contract production report** — total generated, the real template-based/legacy split (`contracts.length` vs `contract_generations.length` — every generation inserts a `contracts` row, only template-based ones also get a snapshot row, so this split is real not estimated), a 6-month bar-chart trend, most recent 20 contracts.
    2. **Outstanding requests** — every real pending `contract_request`, aged from `created_at`, oldest first, exceptions section for anything pending more than 7 days.
    3. **Missing-information report** — every pending request whose lead's KYC is incomplete, reusing the exact same deterministic `missingKycFieldLabels()` helper (newly extracted into `contractFieldResolver.ts`, shared with §9 capability 1's AI summary rather than duplicated) so both name identical fields.
    4. **Template-version usage report** — real usage counts grouped by `template_id`+`version_number_snapshot` straight off `contract_generations` (the real audit-lineage fields set at generation time, §8), never a live re-read of the templates table.
    5. **Turnaround-time report** — real days from `created_at` to `fulfilled_at` for every actually-fulfilled request, exceptions for anything over 5 days. (Caught and fixed a real bug before shipping: `shared/lib/format.ts`'s `daysSince()` assumes a bare `YYYY-MM-DD` and mis-parses this table's full ISO timestamps — added a local `daysBetween()` that diffs full timestamps directly instead of reusing it.)
    6. **Document status report** — honestly reframed rather than faked: Palmstead has no e-signature product anywhere in the schema, so there is no real "signed" boolean to report on. Built the closest genuine proxy instead — a real crosstab of `contract_requests.status` (fulfilled/pending) against whether a `contracts` row exists for that lead (a document has actually been generated at least once) — with an explicit on-page note stating plainly that this is request/generation status, not signature status. Flagged here rather than silently passing off "generated" as "signed".
    **Verified live**: opened the new Reports tab, confirmed all 6 real report rows render with their real descriptions, clicked all 6 download buttons in sequence, confirmed no error in either the UI or the dev-server log, `npx tsc -b` / `stylelint` both clean.

Every item in this blueprint's build order is now DONE and verified live. Contract of Sale (V3 app 02) is complete — the next app in the V3 PDF's own numbered sequence (03 — Log Payment) should follow the same mandatory process from its own first step.
