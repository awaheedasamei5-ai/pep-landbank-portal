# Staff profile and role settings — V2 correction

Status: phase 1 released in PR #65. Work-role review phase prepared in PR #66; production release pending authenticated browser verification. Scope: V2 `rebuild` and Supabase `sbydzrlzqxcdbudjaube` only. V1 remains read only.

## Why this correction is needed

PRs #63–64 put phone, WhatsApp, desk extension and birthday in Management's team editor. Staff should enter and maintain their own biodata. The current Staff Settings page only edits address. `profiles` mixes public directory data, personal data and authorization fields; its protective trigger currently permits only address/avatar/social/signature self-updates. This must be corrected in the database as well as the UI. Staff must never be able to turn a self-declared department-head title into finance approval rights.

## Source research and product decisions

- [Frappe HR Employee](https://docs.frappe.io/hr/employee) separates employee personal, contact, joining, department/designation and approver information; its approver relationship is used by downstream requests.
- [SAP Employee Self-Service](https://help.sap.com/docs/successfactors-employee-central/implementing-employee-central-core/708a728e453c435581564ecb1819281a.html) lets staff edit selected personal, phone, emergency-contact, address and identity data under field-level permissions.
- [SAP Update Personal Data](https://help.sap.com/docs/successfactors-employee-central/sap-best-practices-for-sap-successfactors-employee-central-9a638633f8e14597b38021e269c4df76/update-personal-data-fj5?version=2211) uses a review workflow before selected identity/address changes become effective.
- [SAP People Profile](https://help.sap.com/docs/successfactors-platform/configuring-people-profile/full-profile-of-latest-people-profile) groups personal and job data into separate cards with role-based access.
- [SAP Role-Based Permissions](https://help.sap.com/docs/successfactors-employee-central/implementing-employee-central-core/4ffaa9ee25fe4b4096053f507afa0313.html) distinguishes an employee's own data from manager and administrator rights.

The product pattern is self-service data entry, clear sections, visible verification/review state, and separately controlled authority. The app should collect only information used for contact, HR, payroll or company workflows; it should not invent compulsory demographic or medical fields.

## Data ownership and app consumers

| Fact | Owner and source | Consumer | Rule |
|---|---|---|---|
| Legal/display name and work email | Auth/onboarding, Management correction | All app headers, reports, payroll | A self-edit request cannot overwrite identity used for signed records. |
| Mobile contact and WhatsApp | Staff entry in My Settings | Directory, Leave and Operations reminders, HR SMS | Contact entry is separate from verified Auth phone. Reminder delivery uses active profile and the existing worker checks. |
| Address and date of birth | Staff entry in My Settings | HR and future staff documents | Date of birth and identity evidence belong in private biodata, not company directory. |
| Emergency contact | Staff entry in My Settings | HR response only | Private owner/authorized reviewer access. No public directory exposure. |
| Professional title and sales responsibility | Staff declaration, reviewed employment assignment | Directory, pipeline, payroll role title | Support both simultaneously; do not overwrite one with the other. |
| Department and head-of-department designation | Staff declaration, Management confirmation | Finance routing, org directory, access templates | A claim is never an authorization grant. Finance's existing department and HOD assignment remain canonical until confirmed. |
| App permissions and Finance approval rights | Management-controlled tables | RLS, RPCs, UI, exports | Never derived from staff-editable text, checkbox or metadata. |
| Bank details and pay | Finance payroll setup | Payroll | Stay in existing restricted Finance subsystem; do not duplicate in general Settings. |

## Information architecture

Staff Settings has a compact profile summary and four sections that stack at 320px: **Personal** (name as registered, birthday, address, optional identity and emergency-contact details), **Contact** (mobile for work SMS, WhatsApp, desk extension, verification status), **Work** (professional title, sales responsibility, department and HOD declaration with review state), and **Security** (password/reset, verified sign-in factors and sessions). No massive single form. Each section saves independently and has field-level help, validation, pending/saved/error feedback. Never display a full national ID in company-wide UI or in logs.

Management Settings shows an invitation roster, profile completion and review queue; it does not ask Management to type staff biodata. Management may correct verified employment assignments and decide role declarations with an audit trail. Access and Finance role setup remain separate settings, but the approved staff record populates their read-only views. Show effective roles and any mismatch so the user does not repeat entry silently.

## Delivery phases

1. **Correct current UI and self-service contact.** Remove personal fields from Management team editor. Keep invitation/roster. Add staff contact, WhatsApp, birthday, address and desk extension to My Settings. Update the profile trigger with an explicit self-edit allowlist, validate phone formats, and verify Staff can edit only their own row while a colleague and inactive account cannot. Keep `profiles.phone` as contact, not Auth-verified phone. Check existing reminder consumers after this change.
2. **Private KYC and emergency details.** Add a private owner-linked table and explicit Management/HR reviewer path for legal identity document type/number and emergency contact. Move existing nonempty sensitive values out of the broadly readable `profiles` table after a collision/consumer audit. Never collect data with no defined consumer. Build masked owner/reviewer UI, audit modifications, and test RLS against Staff, colleague, inactive user, client account and anonymous user.
3. **Work-role declaration and review.** Staff enter a professional title, optional sales responsibility, department and HOD request. Store pending declarations separately from canonical `profiles.position`/`department`, `finance_staff_departments` and `finance_role_assignments`. Management confirms with a reason; a guarded RPC applies the approved assignment and writes an immutable decision. Self-declaration alone never changes permissions or finance approval routing. Reconcile any existing finance assignments before applying.
4. **One source across apps.** Update Directory, Payroll role title, Finance routing, Lead/Pipeline salesperson views, Leave, Operations and SMS resolver to read the confirmed profile/role facts by stable profile ID or agent key. Preserve historical attribution; avoid copying free text into every app. Add a clear profile-completion panel for new staff, but let them access existing company history according to their actual grants.
5. **Verification and release.** Run source typecheck, RLS impersonation tests, mobile/light/dark browser checks as both Staff and Management, and form submission/readback. Test invalid phone, empty optional fields, simultaneous professional+sales roles, pending/approved/rejected HOD claim, role-gated Finance routes and one new-staff case. Use exact V2 preview before merging to `rebuild`, then check READY production SHA and hard reload. No live SMS, payments or resets in QA.

## Explicit boundaries

- The current V2 Auth Phone provider and signed Arkesel hook are still off. Entering a contact number must never claim OTP verification or enable phone login. Verified enrollment is a separate Settings phase.
- The old Manager editor deployment is being corrected. Until the corrected slice is verified, do not ask Management to maintain personal biodata there.
- Previous V1 password hashes match V2, but an actual signed-in V1-password browser journey needs current credentials or a user sign-in session; build/RLS checks do not substitute for it.


## 4 November 2026 work-role checkpoint

V2 table/RPC migration `20261104110000_staff_work_profiles.sql` is applied; its schema-migration version and source filename match. The role form and Management review queue are on PR #66, with a READY Vercel preview at commit `64615dd5a647fffb43c072c35ecdc5125222e21c`. Rollback-only tests proved a Staff submission plus Management approval updates canonical title/department while creating zero Finance roles; a rejected submission leaves canonical fields unchanged and records two events. Staff self-approval and direct table inserts are denied. No role declarations or finance assignments remain in production data after those tests. Browser control is disabled in Work settings, so Staff/Management visual and form-submission checks are not complete. Keep PR #66 out of `rebuild` until that verification gate is satisfied. Approved sales-role display across Directory and payroll sync remain later phase 4 work; the private table must not be exposed through broad directory RLS.
