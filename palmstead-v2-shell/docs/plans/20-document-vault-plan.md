# Document Vault — build plan (palmstead-v2-shell)

Third of 7 apps in the "Insights" build order. **Not the Contract-of-Sale Vault already built** — this is a different, older real v1 feature: "every file you've generated or downloaded," a cross-app download history log.

## 0. This is a real v1 port, and the backend already fully exists

Real v1 feature, `viewDownloads()` at `index.html:9125-9166`, sidebar label `'Document Vault':'Every file you've generated or downloaded'`. **Unlike every app before it in this queue, the entire backend is already live in palmstead-v2-shell, not just in web-next**: real `downloads` table, real `downloads_sel` RLS (own rows, or every row for a manager), `DownloadRecord` type, `ds.downloads.list()/log()` in `data/source.ts`, and `useLogDownload()` (`shared/hooks/useLogDownload.ts`) — a fire-and-forget logger already written specifically for this feature, its own comment literally naming "Document Vault." Only the destination screen itself was never built.

**The real, honest gap** (web-next's own `DocumentVaultScreen.tsx` comment already named this plainly, never silently dropped): only 3 of this shell's ~20 real `doc.save()` call sites currently call `useLogDownload()` (`usePipelineExcel.ts`, `useLead.ts`, `useLeads.ts`). A Document Vault built on top of that alone would show almost nothing and immediately read as broken the first time someone downloads a Quotation or a Contract and doesn't see it. **This is the real substance of this app's build, not a side task** — a UI shell over 3 wired call sites isn't a finished Document Vault, it's a decoration.

**Real call sites still missing `useLogDownload()`** (confirmed via `grep` across the real shell, not web-next's older list):
`useBannerReportPdf.ts`, `useContractReports.ts`, `useContracts.ts` (both the legacy and template-based generate paths), `TemplatePreviewScreen.tsx` (preview downloads — judgment call below), `useLeaveLetterPdf.ts`, `useReceipt.ts`, `useQuotationPdf.ts`, `useTechnicalQuotationPdf.ts`, `useSiteVisitAuthPdf.ts`, `useSiteVisitFormPdf.ts`, `useSveManagement.ts`, Finance's `commission-calculator-panel.tsx`/`commission-panel.tsx`/`payroll-panel.tsx`/`reports-panel.tsx`/`use-finance-receipts.ts`, `memorandum-screen.tsx`, `operations/reports/_components/operations-reports-screen.tsx`.

**One real scoping decision**: `TemplatePreviewScreen.tsx`'s "Download preview PDF" button generates a document stamped "Preview — sample data, not a real client" — logging that into Document Vault as if it were a real generated document would be actively misleading (a manager scanning their download history shouldn't see a fake "Kwabena Sample" contract mixed in with real ones). **Left unwired, deliberately, documented here rather than silently done either way.**

`fileData` (the base64 copy stored for re-download) is only practical for reasonably small PDFs — the real `downloads` table already stores it this way for the 3 existing call sites, so this follows the same convention everywhere rather than inventing a size cutoff; if a specific report later proves too large in practice, that's a real follow-up, not a reason to withhold logging entirely (the *history row* — filename, who, when — still has real value even if a specific oversized file's re-download copy is skipped).

## 1. Database

None. The real `downloads` table and its RLS already exist and are already correct.

## 2. Security

No changes — `downloads_sel`/`downloads_ins` already enforce the real "own rows, or every row if manager" split this app needs.

## 3. AI touchpoints

None — a plain download history has nothing for an AI layer to usefully add.

## 4. UI — page architecture

One real page, matching the content (a filterable history list, not multiple concerns):

```
/dashboard/document-vault    Real count header, kind filter chips (PDF/Excel/CSV, only shown if
                              more than one kind present), a real shadcn Table (not web-next's
                              div-list) -- filename, when, who (manager view only), kind badge,
                              re-download action (reconstructs a Blob from the stored data URI,
                              same mechanism web-next's own port already uses correctly).
```

## 5. Porting approach

1. Port `useDocumentVault.ts` verbatim (already correct, already matches this shell's real RLS).
2. Build one fresh native shadcn screen, no CSS modules.
3. **Wire `useLogDownload()` into every real call site listed above** (except the deliberately-excluded preview path) — one line added right after each real `doc.save(...)`, matching the exact pattern the 3 already-wired call sites use.
4. Wire the route into `sidebar-items.ts` only once verified.

## 6. QA

Generate a real PDF from several different real flows after the retrofit (a Quotation, a Contract, a Leave letter, a Finance report) and confirm each one now shows up in Document Vault with the right filename/kind/timestamp; confirm a non-manager only sees their own downloads and a manager sees everyone's; confirm re-download produces a byte-identical file to what was originally saved; confirm the Template Preview's sample-data download does NOT appear (the deliberate exclusion above).
