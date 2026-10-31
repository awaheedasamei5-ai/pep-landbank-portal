# 42 — Urgent bug fixes (2026-10-31)

Two production bugs reported directly by the real user the same day, fixed and deployed on `rebuild`.

## Bug 1 — raw technical error shown to staff/clients

**Report:** "Edge Function returned a non-2xx status code" appeared verbatim in the UI — seen while using the AI "polish my writeup" feature, and while setting a device task reminder. User's standing instruction: *every* future error must read in plain English.

**Root causes (two, compounding):**
1. `friendlyError()`'s `looksLikeSafeSentence()` heuristic treated the Supabase SDK's own generic wrapper string ("Edge Function returned a non-2xx status code") as if it were a hand-written safe message — capitalized, has whitespace, didn't match the SQL-internals exclusion list — so it passed straight through to the user unchanged, at every call site that fed a raw `functions.invoke` error into `friendlyError()`.
2. Even after excluding that string, `functions.invoke()` never puts the edge function's own real JSON error body on `error.message` — it's only on the async `error.context` (a `Response`, needs `.json()`). The synchronous `friendlyError()` had no way to recover it, so call sites fell back to a generic message and lost real detail (e.g. "Device reminders are not configured yet.").

**Fixes (`src/webnext/shared/lib/friendlyError.ts`):**
- Added `GENERIC_SDK_WRAPPER_MESSAGES` and excluded it from `looksLikeSafeSentence()`.
- Added `friendlyFunctionsInvokeError(e, fallback)` — reads `error.context.json()` for the edge function's real message when present, else falls back to `friendlyError()`.
- Applied at every `functions.invoke` call site that **throws/surfaces** its error (read-only AI-insight queries that already `return null` on error were left alone, since nothing was ever shown to the user there): `schedule-push-settings.tsx`, `useSveManagement.ts` (feedback generation, `usePolishManagerNarrative`), `contractShareClient.ts`, `receiptClient.ts`, `sveReportClient.ts`, `useContractAi.ts` (`useClauseExplainer`, `useMissingDataChecklistDraft`), `useFollowUpDraft.ts`, `use-chat-smart-reply.ts`, `source.ts` (`analyzeAuthDoc`).

**Two real, separate gaps found during the audit (frontend called an `ai-insights` `kind` that was never implemented server-side, so it always 400s regardless of the error-message fix):**
- `sve_manager_narrative_polish` — this is the actual "Polish with AI" feature the user hit. **Implemented and deployed** (ai-insights v36): rewrites a site manager's rough notes into professional prose, strictly grounded in the given text, no invented facts. Verified live via curl.
- `allocation_doc_verify` — found incidentally; needs a vision-capable model (it has to look at an image, not just read text about it) and a real design decision on what "verify" means. **Not implemented** — out of scope for a same-day bug fix. Left with a friendly error pointing staff to review the document manually; documented here for follow-up.

**Device reminder bug, root cause #2:** `get-push-config` requires a `VAPID_PUBLIC_KEY` Supabase secret for Web Push, confirmed unset (503, real body `{"error":"Device reminders are not configured yet."}"`). No MCP tool exists to set Edge Function secrets — this needs the Supabase dashboard or CLI, outside this session's tool access. The error now surfaces that real sentence instead of the generic SDK string; the feature itself still needs the secret set before it will work.

**Verification:** `npx tsc -b` clean; `sve_manager_narrative_polish` verified live via curl; other fixes verified by code review (mechanical, same pattern applied everywhere).

Commit: `9b87eb5`.

## Bug 2 — Quotation request sends no SMS

**Report:** user generated a real test quotation and received no SMS. Expected: a thank-you SMS from "Trulander JSF" naming the client, their plot type and payment plan, saying a staff member will follow up to explain the payment schedule, with a real download link for the quotation PDF.

**Root cause:** no SMS mechanism ever existed for Quotation — `QuotationScreen.tsx` / `useQuotationPdf.ts` only ever built a local jsPDF file via `doc.save()`. This was a missing feature, not a regression.

**Fix — mirrors the established share-link + SMS pattern (`useSendContractToClient.ts`) exactly:**
- New Supabase migration `quotation_share_links_and_sms`: `public.quotation_share_links` table (nullable `lead_id` — a quotation can be for a walk-in with no lead yet — `token`, `storage_path`, `client_name`, `client_contact`, `plot_type`, `payment_plan`, `created_by`), RLS open to any authenticated staff member (matching Quotation's own no-role-restriction design), new private `quotation-pdfs` storage bucket with matching insert/select policies.
- New `get-quotation` edge function (`verify_jwt: false`), byte-for-byte structural mirror of `get-contract`: looks up the token with the service role, returns a 5-minute signed Storage URL.
- `src/webnext/data/source.ts`: added `quotationPdfs.uploadPdf()` and `quotationShareLinks.create()`, mirroring `contractGenerations.uploadPdf` / `contractShareLinks.create`.
- `src/webnext/data/quotationShareClient.ts` (new): `resolveQuotationLink(token)`, mirrors `resolveContractLink`.
- `src/webnext/features/public/quotation/QuotationDownloadScreen.tsx` + `.module.css` (new) and `src/app/(external)/quotation/[token]/page.tsx` (new): public, unauthenticated download page, mirrors `ContractDownloadScreen`.
- `src/webnext/features/quotation/hooks/useQuotationPdf.ts`: `useDownloadQuotationPdf()` now also calls `tryShareQuotationWithClient()` after the local save — only when the client has a contact number on file. It uploads the same PDF blob, creates a `quotation_share_links` row, builds `${origin}/quotation/${token}`, and sends:
  > "Hi {FirstName}, thank you for requesting a quotation from Trulander JSF for a {Plot Type} on the {Payment Plan} plan. A staff member will reach out shortly to explain the payment schedule. Download your quotation here: {link}"
  via `ds.sms.send(contact, message, 'quotation_ready', profile.key)`.
- **Optional-safe by construction:** the whole upload/link/SMS chain is wrapped in `try { } catch { }` inside `tryShareQuotationWithClient()`, called *after* `doc.save()` and `logDownload()` already ran. Any failure anywhere in that chain is swallowed — the staff member's local PDF download is never blocked or affected.
- `QuotationScreen.tsx`: passes the real `plan` (payment plan) through to the mutation alongside the existing `totals`/`noPlots`/`plotType`/`client`/`config`.

**Verification:** per the directive, no live test SMS was sent (Arkesel is live/real-cost). Verified by code review: the message construction, contact-gating (`if (!client.contact) return;`), share-link creation, and `ds.sms.send` call shape all match the established pattern used by contracts/receipts/SVE reports. Confirmed via direct SQL that `quotation_share_links` table and `quotation-pdfs` bucket exist as migrated. `npx tsc -b` clean.

## Not in scope for this fix (tracked separately per the user's larger request)

- Quotation: new "Deposit Amount" / "Deposit Percent" entry modes, and a configurable default deposit percent in Settings.
- Site Visit Experience feedback download + fusion into the Site Manager's Report rebuild (budget reconciliation, conversion-rate analytics) — see `43-site-manager-report-and-client-id-integration-master-plan.md`.
- Pipeline engagement dashboard drill-downs with day/week/month/year filters.
- Cross-app client-ID integration (Pipeline ↔ Accounting ↔ Contract of Sale ↔ Allocation ↔ Plot Inventory), auto-recalculating payment schedules with AI-composed SMS on over/under-payment.
- New-staff-sees-empty-company-data gap — see `44-new-staff-empty-company-data-fix.md`.
- `allocation_doc_verify` AI capability — needs a vision-capable model and a real design decision on what "verify" means; currently returns a friendly "not available yet" message.
- `VAPID_PUBLIC_KEY` Supabase secret still needs to be set (via dashboard/CLI, not available to this session) before device task reminders will actually work end-to-end.
