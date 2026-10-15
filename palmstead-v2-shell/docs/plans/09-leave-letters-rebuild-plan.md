# Leave letters — review and rebuild plan

**Status: IMPLEMENTED LOCALLY; live verification pending.** This phase follows the project
handoff sequence after Operations Reports. It improves the letter workflow
without changing Palmstead's leave policy or replacing the existing row of
record.

## Current state and evidence

- Staff leave requests create a deterministic letter using
  `buildLeaveLetterText()` and save it to `leave_requests.letter_text`.
- V1 presented that generated letter for review/edit before saving. V2
  currently submits the generated text immediately, so staff cannot correct
  a name or wording before the request is recorded.
- The PDF includes the existing company header, request reference, staff
  signature and Management signature after approval.
- When Management chooses **Reschedule & approve**, the request's active
  `dates` and `days_count` change, but its saved applicant letter remains the
  original submission. The current PDF renderer reads the letter text as its
  date source, so it can present the old requested dates beside a decision
  approving different dates without clearly stating the approved schedule.
- V1 is authoritative for actual policy and letter wording, not for carrying
  forward a document ambiguity. The submitted letter must remain unchanged
  as the applicant's record.

## Scope

### Staff request flow

1. Keep the existing date selection, quota/conflict validation, and
   deterministic V1 letter template.
2. After valid dates are selected, show a clearly labeled **Review your leave
   letter** step containing the generated letter. Allow staff to correct the
   generated wording before submission, as V1 did. Do not add AI drafting or
   replace the generated letter with a blank generic text area.
3. Make draft and submit actions save the reviewed text; preserve the draft
   edit route and request reference behavior.
4. Keep emergency reason as a required, clearly identified addition to the
   same generated letter. Emergency flow must remain distinct and retain its
   existing policy overrides and management warning.

### Decision and PDF behavior

1. Preserve `letter_text` as the immutable-by-decision applicant submission.
2. For an approved request whose active dates differ from the submitted
   dates, show a distinct **Management-approved leave dates** block in the
   PDF using the current `request.dates`, and retain the original dates in
   the submitted letter. Avoid silently rewriting the user's request.
3. Keep normal approved requests visually unchanged. Keep request reference,
   signatures, current company header and generated timestamp.
4. Ensure multi-page layout, line wrapping, longer emergency reasons, and
   mobile review/edit layout remain readable.

## Files expected to change

- `src/webnext/features/leave/components/LeaveNewRequestForm.tsx` — review
  state, letter preview/edit and submit the reviewed content.
- `src/webnext/features/leave/components/LeaveEmergencyForm.tsx` — same
  review treatment for the emergency letter with the required reason.
- `src/webnext/features/leave/lib/leaveLetterPdf.ts` — add the distinct
  approved-date block only for dates changed by Management.
- This plan — implementation and verification checklist.

No schema, RLS policy, leave quota, approval rule, SMS, or migration change is
planned. No live leave request will be created or altered for QA.

## Verification plan

- Compare the generated text template to V1 for a one-day and multi-day
  request; verify the review editor starts with the deterministic template.
- Verify emergency reason is included in the reviewed/saved letter.
- Render synthetic PDFs for normal approval, changed-date approval,
  multi-day dates, and emergency text; inspect extracted text and page count.
- Run the project's approved static/build checks after implementation.
- If the production UI can be checked without creating leave data, verify the
  staff request review state and Management's existing request view in the
  authenticated sessions. Do not submit or approve any live request.
- Deployment remains subject to `docs/DEPLOY_INSTRUCTIONS.md` and its live
  Management/Staff verification gate.

## Progress

- [x] Read V1 leave-letter generation and PDF behavior.
- [x] Inspect current V2 create, emergency, decision, and PDF paths.
- [x] Confirm live V2 leave schema read-only; no schema change is needed.
- [x] Write this scope and verification plan before implementation.
- [x] Restore generated-letter review/edit for normal and emergency requests.
- [x] Clarify Management-approved replacement dates in PDFs without
      mutating the applicant's original letter.
- [x] TypeScript check passes; synthetic PDF check confirms unchanged-date
      approval stays one page and a changed-date approval includes the new
      Management-approved schedule.
- [ ] Production build (blocked: Windows denied canonicalizing the Desktop
      repo path; no files were written by the build).
- [x] Targeted TypeScript and duplicate-ID checks pass. Full-file Biome check
      also reports repository-wide formatting/import-style diagnostics in
      these existing modules and a `jspdf` export false positive; no
      auto-format was applied because it would rewrite the feature files.
- [ ] Verify Management and Staff views without live mutations.
- [x] Committed locally as `1d6dee2` on `rebuild`.
- [ ] Push to `origin/rebuild` (GitHub returned 403 for the currently
      authenticated account); deploy only if the documented gate is satisfied.
