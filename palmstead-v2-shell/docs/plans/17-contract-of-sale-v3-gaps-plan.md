# Contract of Sale v3 — closing the real gaps (2026-10-23)

## 0. Why this plan exists

Plan 16 shipped Templates/Clauses/Vault/Style/Reports as real, working pages — verified live, deployed. But "working pages" isn't the same as "finished": the user's follow-up feedback (saved to memory as `feedback-contract-of-sale-v3-gaps-2026-10-23`) is that several of those pages are **structurally empty** (a working Clause Library with zero clauses is still a dead end), the new template system doesn't start from the real document staff already use, editing a clause can silently wreck the PDF's pagination, there's no path for a client who isn't in the database yet, the "amount paid" figure can't be entered where it's needed, and none of the 7 new tables this build added are wired into real-time sync.

This plan fixes each of those, in the order that unblocks the most "empty page" complaints first. Every phase below is independently shippable and gets verified live before moving to the next, per this repo's own standing process (`docs/CONTINUE_HERE.md` §2).

## 1. Research findings (what already exists, verbatim)

Full detail lives in this session's research pass; the load-bearing facts:

- **The real legacy contract is already fully written out**, hardcoded in `contractPdf.ts`'s `buildContractOfSalePdf` plus three `app_config` text columns (`contract_preamble`, `contract_definitions`, `contract_terms`) that are *already* Management-editable via the legacy flow — just never ported into the new section-based template system. The real clause text (cover → title → KYC form → preamble → definitions → the transaction → warranties → payments/default/refund → governing law → entire understanding → notices → signature block) is captured in full in this session's transcript and will be transcribed verbatim into the seed migration in Phase 1 — no paraphrasing, no invented legal language.
- **No "amount paid so far" merge token exists.** `lead.amtPaid` is read directly by the legacy renderer only for the KYC form's fill-in line; `ContractFieldKey`/`resolveContractFields` has nothing for it. This is the real root cause behind the user's "add the paid-amount field to where we enter details" ask — it's not that the field is hidden, it genuinely isn't modeled yet.
- **Clause groupings that mirror the real document**: Preamble/Recitals · Definitions & Interpretation · The Transaction · Vendor Warranties · Purchaser Warranties · Payments, Defaults & Refund · Governing Law/Entire Understanding/Notices · Parties & Signatures.
- **Pagination**: `contractBody()` (the legacy renderer) never splits a single clause mid-sentence — it measures each unit's height before drawing — but has no "keep heading with its first clause together" logic, and its exact page boundaries come from hand-placed force-breaks tied to literal string prefixes (`'2.2 '`, `'3. '`), which silently stop matching the moment the wording changes. `buildContractFromSections` (the new structured renderer) has **no orphan-heading protection and no force-break mechanism at all** — purely free-flowing by height. Neither renderer currently guarantees "edit the text, nothing reflows badly" as a general property.
- **Realtime**: `useDashboardRealtime.ts` is the one real cross-app bridge (subscribe `postgres_changes` per table → `queryClient.invalidateQueries` on real keys). It already has `contracts`/`contract_requests`. The 7 tables this build added — `contract_drafts`, `contract_templates`, `contract_template_versions`, `contract_clauses`, `contract_generations`, `contract_style_settings`, `contract_drive_sync` — are in **neither** the bridge **nor** the `supabase_realtime` publication (confirmed via `pg_publication_tables`), so even wiring client code alone would do nothing until the publication membership is fixed first.
- **External research** (contract-management clause libraries, jsPDF pagination, dynamic-document merge-field builders — see this session's web searches): confirms the Clause Library's existing design (central searchable repo, category grouping, insert-with-fallback) is already the right shape — the fix is seeding, not redesigning. Confirms the standard jsPDF pagination fix is measure-before-draw with a height lookahead, which this plan's Phase 4 implements. Confirms CRM-linked merge fields plus an explicit manual-entry fallback is the standard pattern for "not every contract subject is in the database yet" — exactly Phase 3 below.

## 2. Phase 1 — seed the Clause Library and a real Standard template (closes "empty page" complaints 1, 2, 4)

**Database**: one migration, `contract_of_sale_v3_seed_content`.

- Insert the 8 clause groups above into `contract_clauses`, one row per real numbered clause (not one giant blob per group — `1.1.1`, `1.1.2`, `1.1.3`... each independently editable/retireable, matching how the Clause Library page already works). Body text verbatim from the research pass, with `{{tokens}}` substituted in only where the research identified genuinely lead/config-driven text (acres, consideration figures, vendor/CEO/purchaser names) — the rest stays fixed legal boilerplate, exactly as it is today.
- Insert one new `contract_templates` row, "Standard Contract of Sale," with its v1 `contract_template_versions.content` built as real `ContractSection[]` JSON reproducing the full document structure above (heading/paragraph/clause sections in the real order, a `signature_block` section at the end), status `published` directly (this is the real baseline document, not a draft someone has to review) — created_by/published_by attributed to Management, not a fabricated identity.
- This single seed closes three complaints at once: Clause Library stops being empty, Templates has a real starting point instead of a blank canvas, and because this template is just normal `ContractSection[]` rows, it automatically gets the Style page's cover/wordmark/typography the same way any other template does — no special-casing needed.

**New field on `contract_fields`**: add `amountPaidToDate` and `balanceOutstanding` to `ContractFieldKey`/`CONTRACT_FIELD_LABELS`/`resolveContractFields` (resolving from a value passed in, not silently re-derived from `lead.amtPaid` — see Phase 3), and insert them into the seeded "The Transaction" clause group as a real new clause (`1.3.8 As at the date of this Agreement, the Purchaser has paid {{amountPaidToDate}} towards the Consideration, leaving a balance of {{balanceOutstanding}}.`) so the legal document itself states the real paid-to-date figure — this is the actual fix for "add it to the section before we generate," not just a UI-only field.

**QA**: open Clause Library, confirm all 8 groups with real clauses; open Templates, confirm "Standard Contract of Sale" v1 published with the full real structure; preview it against the sample lead and confirm every token resolves; confirm Style page's cover/accent color changes visibly affect this template's preview.

## 3. Phase 2 — pagination: keep clause groups together (closes complaint 3)

Change `buildContractFromSections` (not the legacy renderer, which is being superseded by the template system) to add:

- **Orphan-heading protection**: before drawing a `heading` section, look ahead to the next section in the array; if it's a `paragraph`/`clause`, compute both heights together and run the page-break check (`ensure`) against the combined height, not the heading alone. A heading can still end up near the bottom of a page, but never completely alone with its first clause pushed to the next page.
- **A `pageBreakBefore` boolean already supported per-section** (one new optional field on `ContractSection`, default false) so Management can pin a real "always start a fresh page here" point when they want one (mirroring what the legacy renderer's hardcoded force-breaks did, but as an explicit, visible, editable choice in the Template Studio UI — a toggle on each section's editor, not a hidden string match) rather than an implicit side effect of exact wording.
- Height-measurement itself stays what it already correctly does (never split a single paragraph mid-sentence) — this phase only adds the "don't orphan a heading" and "optional explicit break" layers on top.

**QA**: take the seeded Standard template, edit a clause to add 3 new sentences (long enough to push it near a page boundary), regenerate, and visually confirm no heading sits alone at a page bottom and no paragraph splits mid-word. Toggle `pageBreakBefore` on a clause and confirm it forces a fresh page.

## 4. Phase 3 — walk-in client path + real amount-paid capture (closes complaints 5, 6)

**Generate screen** gets a second entry path alongside "search a client": a **"New client (not in the system yet)"** option that reveals a plain form — name, contact, address, plot type, number of plots, unit price, payment plan — enough to resolve every `ContractFieldKey` without a `Lead` row existing at all. This produces an in-memory `Lead`-shaped object (not written to the real `leads` table — a contract generated this way is intentionally standalone, matching the user's own framing of "people who are not part of the database"); it's clearly labeled "Walk-in — not linked to Pipeline" throughout Generate and in the Vault entry it produces, so it's never mistaken for a real pipeline lead later.

**Amount-paid field**, shown in both paths right in the client-details step (before generation, as asked):
- **Existing lead**: shows the real `lead.amtPaid` as the current figure, with an "Update amount paid" action that opens the real payment-logging flow (`useCreatePayment`, the same approval pipeline Payments already uses) rather than a parallel editable field — per `pipeline-payment-integrity`'s standing caution, this app must never create a second, divergent way to move money through the ledger. Once that payment is approved, `lead.amtPaid` updates for real and Generate reflects it on next load, same as everywhere else in the app.
- **Walk-in client**: a plain editable number field (no pipeline record exists to diverge from), feeding `amountPaidToDate`/`balanceOutstanding` directly.

**QA**: generate a contract for a real existing lead and confirm the amount-paid figure shown matches Payments exactly and that "Update amount paid" lands in the real approval queue, not a shortcut. Generate a contract for a typed-in walk-in client end-to-end, confirm the PDF's new §1.3.8 clause shows the real entered figures, confirm nothing was written to `leads`.

## 5. Phase 4 — real-time sync (closes complaint 7)

- Migration: add all 7 tables (`contract_drafts`, `contract_templates`, `contract_template_versions`, `contract_clauses`, `contract_generations`, `contract_style_settings`, `contract_drive_sync`) to the `supabase_realtime` publication (`alter publication supabase_realtime add table ...`) — without this, no amount of client code does anything, per this project's own `realtime-publication-membership` lesson.
- `useDashboardRealtime.ts`: subscribe to each, invalidating the real query keys already in use — `['contractDrafts']`, `['contractTemplates']`/`['contractTemplateVersions', ...]`, `['contractClauses']`, `['contractGenerations']`, `['contractStyleSettings']`. Unfiltered for everyone (these are all Management-facing tables already RLS-scoped; invalidation only triggers a normal RLS-respecting refetch, same reasoning the allocation-requests bridge entry already documents).
- "Real-time intelligence": the 5 AI capabilities already built (KYC completeness, clause explainer, consistency scan, missing-data checklist, draft-readiness nudge) stay as-is — they're already live, server-backed, and auto-fetched where the plan called for it; this phase doesn't add a 6th, it makes sure the data those capabilities react to (a draft, a template, a clause) is never stale across tabs/devices.

**QA**: two browser sessions as Management; create/edit a clause in one, confirm it appears in the other's Clause Library without a manual refresh; same for a draft's status and a template's publish state.

## 6. Build order

1. Phase 1 (seed data) — directly fixes the loudest "empty page" complaints, no architectural risk.
2. Phase 4 (realtime) — small, mechanical, same pattern as 20+ existing entries in the bridge; do it early so every later phase's QA can rely on live cross-tab verification instead of manual refreshes.
3. Phase 3 (walk-in + amount-paid) — the highest-value new capability, but needs Phase 1's seeded template to generate against meaningfully.
4. Phase 2 (pagination) — lowest urgency (only matters once real edits are being made against real seeded content, which Phase 1 provides) and the one with the most design judgment involved (exact `pageBreakBefore` UX), so it benefits from the other three being settled first.

Each phase gets its own commit, its own live verification, and its own push to `origin/rebuild` before the next starts — no phase is reported done on an unverified pass.
