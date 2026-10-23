# Contract of Sale — build plan (palmstead-v2-shell)

Produced per the `palmstead-app-build` skill's mandatory process: memory searched, prior real work checked (a complete, previously-built implementation was found and is being recovered, not redone — see §0), v1 re-read for the real business logic, real schema verified live via the Supabase MCP before writing a line of this plan.

## 0. This is not a from-scratch build

A full, already-verified **Template Studio** implementation for this exact app was built in the earlier `web-next` effort (abandoned as the UI deliverable in favor of this shell, per `feedback-oss-foundation-strategy-2026-09-11`, but its real schema and research were never undone). Confirmed live right now, on the same `sbydzrlzqxcdbudjaube` project this shell already runs against: `contract_templates`, `contract_template_versions`, `contract_clauses`, `contract_fields`, `contract_generations`, `contract_approvals` all exist, correctly shaped, zero rows (safe to build on, no data migration). The full research record — v1's real implementation, the 59-page spec, the V3 PDF, real open-source research (Documenso, Syncfusion's Document Template Studio, PandaDoc) — lives in `web-next/docs/blueprints/CONTRACT_OF_SALE_BLUEPRINT.md` and is treated here as already-done research, not repeated. Its real React components (`web-next/src/features/contracts/*`, 29 files, all `npx tsc -b`-clean and verified live at the time) are the porting source for this shell's Next.js/shadcn equivalents — ported and adapted to this project's real conventions (App Router pages, not React Router `<Outlet/>`; this shell's own shadcn primitives, not web-next's CSS-module components), not re-researched from scratch.

**What this plan adds that the prior build never covered**, driven directly by the user's own explicit request: a real **Drafts** page (save an in-progress contract before generating — genuinely new, no prior work covers this), a real **Vault** page browsing `contract_generations` (the data already exists; no browsing UI was ever built for it), restructuring the Clause Library from a side-panel into **real dedicated pages per clause group**, a new **Style/Text** page for fonts/typography (not just the cover image + wordmark the prior build and v1 both had), and **Google Drive sync** (entirely new — see §7, this needs the user's own Google Cloud credentials before it can be built for real).

## 1. Database

### 1.1 Reused as-is (already live, already correct)
`contract_templates`, `contract_template_versions` (one `published` per template via a partial unique index + `set_contract_template_version_published()` RPC), `contract_clauses`, `contract_fields`, `contract_generations` (the real per-generation snapshot: `content_snapshot`, `field_values_snapshot`, `pdf_storage_path`), `contract_approvals`. Plus v1/this shell's existing `contracts` (metadata log, kept for backward compat) and `contract_requests` (the request queue) — need to be verified live on `sbydzrlzqxcdbudjaube` (they exist on v1's `lrahgcnftetnyxunaljs` and on `sbydzrlzqxcdbudjaube` per the blueprint's own build-order item 2; re-confirm exact columns before wiring, not assumed).

### 1.2 New tables

```sql
-- Drafts: an in-progress contract a staff member has started but not
-- generated yet. Separate from contract_requests (a request for someone
-- ELSE to act) and contract_generations (an already-issued document) --
-- this is "I'm partway through filling this in, let me save and come back."
contract_drafts (
  id uuid pk,
  lead_id uuid references leads(id),
  client_name text not null,
  template_id uuid references contract_templates(id),         -- nullable: legacy no-template path allowed
  field_values jsonb not null default '{}',                    -- whatever's been filled in so far (KYC, custom fields, payment plan)
  status text not null default 'in_progress' check (status in ('in_progress','ready_to_generate')),
  created_by text not null, created_by_name text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
)

-- Contract style: typography/branding config for the PDF renderer, real
-- settings instead of hardcoded fonts -- one active row, same
-- one-row-active pattern as attendance_policy.
contract_style_settings (
  id uuid pk,
  is_active boolean not null default true,
  heading_font text not null default 'Helvetica-Bold',
  body_font text not null default 'Helvetica',
  mono_font text not null default 'Courier',                   -- clause numbers / dates
  base_font_size_pt numeric not null default 10.5,
  heading_font_size_pt numeric not null default 14,
  line_height numeric not null default 1.4,
  cover_image_path text,                                       -- storage path, contract-pdfs bucket
  wordmark_image_path text,
  ceo_name text,
  updated_by text, updated_by_name text,
  updated_at timestamptz not null default now()
)

-- Google Drive sync: per-generation sync status, so Vault can show
-- "synced / pending / failed" per document without blocking generation
-- itself on an external API call succeeding.
contract_drive_sync (
  generation_id uuid primary key references contract_generations(id) on delete cascade,
  drive_file_id text,
  status text not null default 'pending' check (status in ('pending','synced','failed')),
  error text,
  synced_at timestamptz
)
```

Real font choice is constrained to the fonts `jspdf`/this shell's own PDF toolkit actually embeds (standard PDF base-14: Helvetica/Times/Courier families) unless a real embedded-font pipeline is built — naming this constraint now rather than promising arbitrary Google-Fonts-style typography the PDF layer can't actually render.

## 2. Security

- Reuse the existing `manager`/`elizabeth`-gated `canManageContracts()` boundary for anything touching templates, clauses, style settings, and the full vault — matches v1's real access rule exactly (confirmed in the v1 audit the prior blueprint already did), not invented fresh.
- `contract_drafts`: creatable/editable by the staff member who owns it (`created_by = my_key()`) or Management, same shape as this shell's own existing "own row or manager" policies elsewhere (e.g. leads/payments).
- `contract_drive_sync`: Management-only (it's an internal sync-status record, not staff-facing).
- Real RLS written and tested via transaction+rollback before any UI reads it, per this project's own standing testing discipline — never a live login for verification.

## 3. AI touchpoints

Reuse the 4 already-speced, already-implemented `contract_*` kinds on the shared `ai-insights` Edge Function (KYC completeness checker, plain-language clause explainer, consistency scan, missing-data checklist) — port the prompts, don't re-invent them. One real addition: a **draft-readiness nudge** on the Drafts page (deterministic verdict — which required fields are still empty — AI only phrases the one-line reminder), following the exact same deterministic-verdict/AI-phrases-it discipline as the other four.

## 4. UI — full page architecture

Real distinct routes, one per feature, matching this shell's own established convention (`operations/[projectId]/issues/[issueId]`, not tabs-in-one-file). No feature lives inside an accordion standing in for a page.

```
/dashboard/contract-of-sale                          Hub: KPI strip (pending requests, drafts in progress,
                                                       contracts this month, templates needing review) + real
                                                       nav cards into every section below.
/dashboard/contract-of-sale/generate                  The core flow: search/create client, KYC capture modal,
                                                       pick a published template (or legacy no-template path),
                                                       resolve + generate. Can start FROM a draft or a request.
/dashboard/contract-of-sale/drafts                    NEW. List of contract_drafts, grouped by status. Open
                                                       one -> resumes exactly where it was left off in Generate.
/dashboard/contract-of-sale/requests                  The existing request queue (ported, not rebuilt).
/dashboard/contract-of-sale/vault                     NEW. Browsable contract_generations: search by client,
                                                       date, template; each row shows Drive sync status; re-
                                                       download the stored PDF (never regenerates -- always
                                                       serves the stored content_snapshot's PDF, per the
                                                       integrity rule the prior blueprint already established).
/dashboard/contract-of-sale/templates                 Template Studio dashboard: thumbnail-card grid (ported
                                                       from TemplateStudioScreen.tsx).
/dashboard/contract-of-sale/templates/[id]             Template detail: version rail + section canvas + Merge
                                                       Fields panel (ported from TemplateDetailScreen.tsx /
                                                       MergeFieldsPanel.tsx). Clause insertion now links OUT to
                                                       /clauses (below) instead of a side-panel picker.
/dashboard/contract-of-sale/templates/[id]/preview     Sample-data preview + PDF download (ported from
                                                       TemplatePreviewScreen.tsx).
/dashboard/contract-of-sale/clauses                   NEW structure. Clause Library overview: one card per
                                                       real category (Preamble / Definitions / Terms, plus any
                                                       custom category added later) with a count and last-
                                                       edited date.
/dashboard/contract-of-sale/clauses/[category]         NEW. Dedicated page per clause GROUP -- the user's own
                                                       explicit ask. Lists every contract_clauses row in that
                                                       category, each independently editable, reusing the
                                                       insert-copies-inline discipline the prior blueprint
                                                       already established (editing a library clause here never
                                                       retroactively changes a template that already copied it).
/dashboard/contract-of-sale/style                      NEW. Contract text/font/branding editor: cover image,
                                                       wordmark, CEO name (ported from v1/the prior Config
                                                       fields) PLUS real typography controls backed by
                                                       contract_style_settings (§1.2) -- heading/body/mono font
                                                       family pickers (constrained to real embeddable PDF
                                                       fonts), base size, heading size, line height. Live PDF
                                                       preview panel so a font change is seen before saving.
/dashboard/contract-of-sale/reports                    The 6 named reports (ported from ContractReportsScreen.tsx).
```

Each page reuses this shell's own real dashboard components (data tables, stat cards, the shared PDF-report toolkit) — never a flat generic tile grid. Design tokens for anything net-new (the Drafts/Vault/Clause-group/Style pages) reuse this shell's existing semantic theme tokens, not the prior blueprint's separate purple-accent palette (that was web-next's own token set; this shell has its own).

## 5. Porting approach — corrected after checking this shell's real current state

This shell's `src/webnext/` tree already carries two different precedents, and the wrong one almost got used here:
- A **literal CSS-module copy** of web-next's own screens (Quotation, Banners, Site Visits) — fine for areas no one ever flagged as ugly.
- A **native shadcn rebuild** of the logic-only layer's UI (Leave, Attendance) — because the literal-copy UI for exactly these two was explicitly rejected ("no generic tiles or one page bullshit") and rebuilt using this shell's own `Button`/`Card`/`PageHeader`/`StatCard`/lucide-icon components, while the underlying hooks/lib/data-source logic stayed ported as-is.

Contract of Sale follows the **second** precedent: the data-source layer for all 6 tables is *already live* in `src/webnext/data/source.ts` (confirmed — `contractRequests`, `contracts`, `contractTemplates`, `contractTemplateVersions`, `contractClauses`, `contractFields`, `contractGenerations`, `contractApprovals` all fully typed and implemented). What's missing is only `src/webnext/features/contracts/{hooks,lib,screens}`. So:

1. Schema: confirmed — `contracts`/`contract_requests` columns on `sbydzrlzqxcdbudjaube` match what the data-source layer already assumes (verified via `information_schema.columns`); the 3 new tables in §1.2 are applied (migration `contract_of_sale_drafts_style_drive_sync`, zero advisories).
2. Port `hooks/` and `lib/` from `web-next/src/features/contracts/` into `palmstead-v2-shell/src/webnext/features/contracts/` close to verbatim (pure logic/PDF-building/TanStack Query, no CSS modules, no UI) — these don't need a shadcn rebuild, same as Leave's own `lib/leaveLogic.ts` wasn't rebuilt, only its screens were.
3. Build every screen in §4 as a **new native shadcn screen**, consuming those ported hooks exactly the way `LeaveDashboardScreen.tsx` consumes `leaveLogic.ts` — `Button`/`Card`/`CardAction`/`PageHeader`/`StatCard`/lucide icons, real data tables, no CSS modules, no flat tile grid.
4. Build order, each phase verified live before the next starts (never report "done" on an unverified slice):
   1. Hub + Generate + Requests (the core v1-parity flow, including the real KYC capture modal — do not skip this the way the prior build's first audit caught web-next skipping it).
   2. Drafts (new).
   3. Templates dashboard + Template detail (editor canvas, version state machine, Merge Fields).
   4. Clause pages (new structure, ported logic).
   5. Vault (new UI over existing data).
   6. Style/Text page (new).
   7. Reports.
   8. Google Drive sync — blocked on §7 below.
   9. The 4 (+1 new) AI capabilities, wired in alongside whichever screen each belongs to rather than as a separate final pass.

## 6. QA — do not mark a phase done without actually exercising it

Same checklist shape as the prior blueprint's §17, re-run per phase in this shell specifically (a port is not "the same code," it needs its own live verification): create a draft, resume it, generate against a published template, confirm the unresolved-token guard blocks on a missing field, confirm a past generation's PDF re-downloads unchanged after the template is edited afterward, confirm a clause-group page's edit does not retroactively change an already-generated contract, confirm the style page's font change appears in a freshly generated PDF.

## 7. Google Drive sync — real blocker, not a scope cut

This needs a real Google Cloud OAuth client (or a service account with domain-wide delegation) scoped to Drive, which only the user can create and hand over — there is no way to fabricate working credentials. Once provided: a server-side Edge Function (not a client-side token flow, to avoid ever exposing a refresh token to the browser) uploads the stored PDF to a real company Drive folder at generation time, records the resulting `drive_file_id` in `contract_drive_sync`, and the Vault page shows real sync status per document with a manual retry for anything `failed`. This phase is sequenced last and does not block any other page in §4 from shipping.
