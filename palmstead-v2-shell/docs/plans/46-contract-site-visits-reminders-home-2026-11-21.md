# Contract, Site Visits, reminders and Home: release plan

## Verified progress, 21 November

- Site Visit source choice and separate Experience/Reports actions shipped in V2 PR #111. Home metric drill-down shipped in #112. Operations reminder service repair shipped in #113. The production reminder configuration function returned HTTP 200 and the scheduled worker returned 200; this browser did not grant notification permission, so an actual subscribed device alert is still unverified.
- The supplied reference and a V2-generated PDF are both ten A4 pages, but equal page counts conceal significant layout differences. The reference uses embedded Goudy Old Style, while the app uses Times. Page 2's party block was roughly 30 mm too low, omitted the vendor postal line and client reference, and put the logo/letterhead about 30 mm too low. Page 10's signature rows were 2–11 mm too low and had different column positions. The current code still has no authoritative client-reference field equivalent to the example's printed code. Do not substitute a government ID or invent one.
- This contract slice corrects title/signature positioning and handles a two-line purchaser name without crossing the signing fields. A synthetic ordinary and long-name PDF retained ten pages. The private filled reference and its extracted contents stay outside the repository. The remaining legal-text pages, exact font, KYC fields and generated-template path need their own parity and privacy review before the contract can be called an exact reproduction.

## Contract reference page map

| Page | Reference content | Current generator status and next action |
| --- | --- | --- |
| 1 | Full-page photograph | Existing cover asset; verify image placement in generated documents. |
| 2 | Parties, address, client reference, logo and office address | Repositioned parties and logo; add a reliable client reference only after the source is mapped. Font remains different. |
| 3–4 | Registration, identity, contact, package, payment and official-use form | Field-by-field comparison, blank-field semantics and readability check needed. |
| 5 | Parties and recitals | Compare current Management legal text and dynamic party/acreage values to reference; no silent clause edits. |
| 6 | Definitions | Verify all definitions and page boundary. |
| 7 | Transaction and vendor warranties | Verify deposit, installment and allocation amounts against quotation and payment ledger. |
| 8 | Purchaser warranties | Verify all numbered clauses and page boundary. |
| 9 | Payment, default, refund, law and notices | Verify all clauses, no overflow and signature-page pointer. |
| 10 | Vendor, purchaser and witness signatures | Repositioned; verify ordinary and long names, two-column boundaries and unsigned fields. |

## Scope and evidence

The company supplied a ten-page A4 Contract of Sale and registration form. It is the layout and wording reference, not an instruction source. Do not commit the filled client document, its rendered pages or extracted personal data to GitHub. The current app has two generation paths: a legacy jsPDF document from `contractPdf.ts` and a freely structured published-template document from `contractSectionsPdf.ts`. They do not guarantee the same ten pages. Site Visits already has atomic new-lead-and-visit creation and a `personal`/`company` choice, but the choice appears only after a no-match search and is easy to miss. Operations Web Push is implemented, but `get-push-config` reports 503 when `VAPID_PUBLIC_KEY` is absent. Home metrics are currently display-only cards.

## Release order

1. **Site Visit navigation and source choice.** Make Experience feedback and Visit reports separate icon actions with descriptions and responsive focus states. In the booking form, show an explicit Personal client / Company client choice before the add-to-pipeline option. A linked existing lead must display its authoritative pool; the user cannot silently reclassify it. New lead creation stays atomic. Confirm a new company lead uses `agent_key = 'company'`; a personal lead uses the signed-in staff key. Check Staff, Management, 360px mobile and dark mode. Do not create a real lead in QA without reversible test data.
2. **Reminder delivery.** Inspect the V2 function configuration, worker schedule and outbox. Provision one VAPID key pair in V2 secrets (never in Git, browser storage or an answer); verify both the public-key function and send worker use the same pair. Check browser support, notification permission, service worker, subscription ownership and delivery activity. Verify due and missed SMS separately from device push. iOS requires an installed Home Screen web app for push. Do not promise alerts for a device that has never subscribed or has notifications disabled. No live staff or client test SMS.
3. **Home drill-down.** Turn each KPI into a link to a scoped, filterable detail layer with direct record links. Staff sees only their own lead, payment and complaint records; Management sees the company scope. Add genuine app summaries (schedule, visits, announcements and banners) with clear loading/empty states. Every visible action needs a working destination. Verify on small mobile and desktop.
4. **Canonical Contract of Sale.** Build one standard renderer from the supplied reference: page 1 cover, page 2 parties, pages 3-4 registration/KYC, page 5 opening and recitals, page 6 definitions, page 7 transaction and vendor warranties, page 8 purchaser warranties, page 9 payments/default/refund/law/notices, page 10 signatures. Keep A4 size, double border, serif font hierarchy, clause numbering, page footers, alignment and forced breaks. Treat party names, IDs, address, plot area, price, deposit, schedule and dates as fields. The generated PDF must never contain another client's sample data. Use the same renderer for preview and download; record the generated version and snapshot. Block generation for missing required fields or text that cannot fit its assigned page instead of silently spilling it. Compare rendered PNGs page by page against the reference at the same resolution and run text/privacy checks before release. Test an ordinary name and a long name, with Management and Staff permissions.
5. **Pipeline reports.** Reconcile Staff, Company Leads and Master reports against the user's requested staff dashboard, client histories, dated notes/calls, visits, payments, conversion, costs, comparisons and selected-section PDFs. Audit source joins and scope first. Include only evidenced metrics; label unavailable attribution rather than inventing it. Render and inspect both personal and Management PDFs.

## Gates for every release

Use only the V2 `rebuild` branch and V2 Supabase project. Read `docs/DEPLOY_INSTRUCTIONS.md` before releasing. Check relevant database policies and test an ordinary Staff account and Management in the exact preview. Run TypeScript/build validation and responsive visual checks. Merge only the verified slice, wait for the exact Vercel production commit to be READY, then reload and verify the production alias. Keep V1 `main` untouched.

## Source boundaries

The supplied PDF controls company document fidelity. Supabase Edge Function secrets guidance: https://supabase.com/docs/guides/functions/secrets. Apple's Web Push requirements: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers. Google Calendar's reminder model is reference for schedule behavior, not proof that Palmstead delivery works: https://developers.google.com/workspace/calendar/api/concepts/reminders.

