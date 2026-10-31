# New-staff "empty company-wide data" bug — root cause and fix

**Reported** 2026-10-31, verbatim: "I added a new test user to the system, although the sign in
was smooth, I realized that the person had access to every app, but the data in apps like Banner
Tracking, Client Database, Company Leads and other company-wide apps — which its previous and
current data for both newly added staff and current staffs should be available — was empty."

## Real root cause

A brand-new real staff account (`agent_key = 'yoda'`, role `agent`, `active = true` — created
2026-10-31, nothing wrong with the account itself) signed in fine, but **Company Leads showed
zero rows**. Traced to the `leads_sel` RLS policy:

```
(agent_key = my_key()) OR (my_role() = 'manager') OR (my_key() = ANY(ARRAY['elias','emmanuel','elizabeth']))
```

This is the exact hardcoded-staff-key-allowlist pattern already found and fixed 3 times earlier
this session (`contract_requests_upd`, `weekly_visit_forms`, `contract_templates_sel`) — just never
caught here because Company Leads wasn't in this session's original 5-named-app migration scope.
Any staff member hired/added after that allowlist was written (not just `yoda` — this affects
**every current and future staff member not named elias/emmanuel/elizabeth/manager**, e.g. Adams,
Bridget, Philip) can never see the shared `agent_key = 'company'` Company Leads pool (176 real
rows), because their own key can never appear in a list written before they existed.

This is also what made the user's *other* two named apps look broken, without either actually
being buggy in isolation:

- **Banner Tracking**: `banners_sel`/`banner_status_log` policies are already fully open
  (`my_key() is not null`) — banners themselves were never hidden. But Banner Tracking's own
  "leads sourced from this banner" attribution (built earlier today, Phase 9/C2.12) reads from
  `leads` filtered by `banner_id`, so it inherited the same `leads_sel` gap for any Company-Leads-
  sourced banner lead. Fixing `leads_sel` fixes this too, automatically — no separate change needed.
- **Client Database**: confirmed, by reading `useClients()`, to be **intentionally** agent-scoped
  for non-managers (own clients only, same pattern as "My Pipeline" vs "Master Pipeline" — a
  manager gets `useAllLeads()`, an agent gets `useLeads()`). A brand-new agent correctly starts
  with zero clients of their own; this is accurate, not a bug, and was independently verified
  solid for both roles in this session's own earlier test sweep (Batch 1). **Not changed.**

## Fix applied

Purely additive, SELECT-only, applied directly to the database (`sbydzrlzqxcdbudjaube`):

1. New permission key `company_leads.view` (via the real Settings/permissions system that now
   exists — `has_permission()` was reverted from its testing-phase override back to real
   role-based logic earlier today by a concurrent session's `a07a623` commit, so this is the
   correct, permanent mechanism to use now, not the temporary `auth.uid() is not null` pattern
   this session's *earlier* testing-phase fixes used before that system existed).
2. Granted to the `agent` role by default in `role_permissions` — so every current and future
   staff member gets it automatically, matching the user's explicit "100% ready for everyone
   regardless" requirement, while remaining individually revocable later via the real Settings UI
   (`staff_permission_overrides`) if a specific person should ever need to be excluded.
3. `leads_sel` widened with one new `OR` clause: `(agent_key = 'company' AND has_permission
   ('company_leads.view'))`. The existing `elias`/`emmanuel`/`elizabeth` clause is untouched. Every
   write-path policy that actually lets someone *claim/edit* a company lead (`leads_ins`,
   `leads_upd_company`) is **untouched** — this only opens read visibility; the real
   anti-lead-poaching protection on claiming/editing a company lead is unaffected.

## Other apps checked for the same pattern (per the user's "other company-wide apps" wording)

- `profiles` (Directory), `announcements`/`announcement_comments`, `leaderboard_scores`/
  `leaderboard_score_history` — all already fully open (`auth.uid() is not null` or `true`), no
  hardcoded allowlist found.
- `downloads` (Document Vault's real table name) — `user_key = my_key() OR manager`, confirmed
  **intentionally** personal (each staff member's own download history; Management sees
  everyone's) per this session's own earlier retroactive plan doc. Not a bug, not changed.

No other hardcoded-staff-key-allowlist gaps found on a company-wide app's SELECT policy.

## Verification

Live-verified in the running app: logged in as **Adams** (a real, non-privileged `agent` account —
not elias/emmanuel/elizabeth/manager, the same category of account the bug affects), opened
Company Leads, confirmed all 176 real company leads now render with full data (names, plots,
totals, stage) where the page would previously have shown zero. `npx tsc -b` clean (no code
changes were needed — this was a pure RLS/permissions fix).
