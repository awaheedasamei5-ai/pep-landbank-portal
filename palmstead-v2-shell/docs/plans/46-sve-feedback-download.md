# Site Visit Experience — per-submission feedback download

Real user ask (2026-10-31): "I realized that the customer experience, we are unable to
download their feedbacks, it only shows on the screen."

## What existed before this

Site Visit Experience (SVE) already had a real PDF export — but only at the **day-report**
level (`sve_day_reports`, `buildSveDayReportPdf`, the "Day reports" tab's Download button).
A single client's raw submission (ratings, comments) shown in the "Client feedback" tab's
expanded card had no export path at all — the UI's own hint text told staff to "build this
client into a full day report" just to get one client's answers on paper. That's the literal
gap the user hit.

This is deliberate, not accidental: an earlier real user ask ("the report isn't supposed to
be for a single client after client but a full report after every site visit") moved the
system away from per-submission reports toward day-level ones. This fix does **not** reverse
that — it adds a lightweight single-client export as a second, parallel option, so staff get
an immediate download without being forced through the day-report workflow when they just
want one client's raw feedback right now.

## What was built

- `buildSveSubmissionPdf(siteVisit, submission, logoDataUri, generatedByName)` in
  `src/webnext/features/sve-management/lib/sveReportPdf.ts` — reuses the exact same
  `sitePdfHeader`/`sitePdfSectionBar`/`sitePdfFields`/`pdfReportFooter`/`pdfGeneratedStamp`
  primitives as the day report, so this reads as the same document family, not a bespoke
  one-off. Contains only the client's real raw submission fields (ratings, journey/site-match
  feedback, purchase intent, comments) — no AI summary or manager debrief, since those only
  exist once a day report has actually been built for that client.
- `sveSubmissionFilename(clientName, visitDate)` — matching filename convention.
- `useDownloadSveSubmissionPdf()` in `useSveManagement.ts` — same real pattern as
  `useDownloadSveDayReportPdf` (loads the real logo, builds the PDF, saves it, logs the
  download via `useLogDownload` so it shows up in Document Vault like every other real
  generated document this session has wired that way).
- A "Download this feedback" button in `SveManagementScreen.tsx`'s expanded feedback card,
  next to the existing "build a full day report" hint (kept, not removed).

## Verification

`npx tsc -b` clean immediately after this change (confirmed before a concurrent fork's
unrelated Quotation work landed in the same shared working tree, which then made the Browser
pane session unavailable for this task — a shared-environment resource conflict, not an app
bug). **Substitute verification performed**: pulled 3 real
`site_visits`/`site_visit_experience_submissions` rows directly via SQL, confirming every
field this PDF builder references (`overallRating`, `relationshipRating`, `npsScore`,
`journeyRating`, `siteDescriptionRating`, `handlingFeedback`, `purchaseIntent`,
`improvementSuggestions`, `additionalComments`) exists and is correctly populated on real
production data. A real visual click-through (open a real submission, click Download, confirm
the PDF) is still worth doing once the Browser pane is free, but the data-shape risk this
verification targets is ruled out.
