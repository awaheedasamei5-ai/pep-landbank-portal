# Quotation deposit options and configurable default %

Real user ask, 2026-10-31 (verbatim, trimmed): "in the quotation app... add two options which
is deposit amount... then when we enter that amount the system [will] use that amount to
calculate the monthly schedule amount, also add another option which is deposit percent where
we can enter manually... any percentage then the system will use that to calculate the rest of
the payment... also in the quotation setting... add it to the settings where we can change the
default deposit percent, if u do that it means when we change that in the settings, the before
and after interest % will now change to the number in the backend."

## What was built

**New DB column**: `app_config.default_deposit_pct` (numeric, default `30`) — same `0-100`
convention as the existing `allocation_threshold_pct`. Added via migration
`add_quotation_default_deposit_pct`.

**`quotationLogic.ts`**: the old hardcoded `QUOTE_DEPOSIT_PCT = 0.3` constant is now only the
last-resort fallback for a config row with no value at all. A new `defaultDepositPctFraction(config)`
reads `config.defaultDepositPct` for every real calculation — `computeQuotationTotals`,
`computeLeadQuotationTotals`, and `computeTechnicalQuotationTotals` (Technical Quotation already
had an unused `depositPctOverride` parameter from an earlier build; it now correctly falls back
to the configurable default too, instead of the old hardcoded 30%, when no override is given).

A new `DepositOverride` type (`{ mode: 'percent', value } | { mode: 'amount', value } | null`) is
threaded through `computeQuotationTotals` and `computeInstallmentPlan`:
- `'percent'` mode overrides the deposit % for just this one quotation, without touching the
  company-wide Settings default.
- `'amount'` mode bypasses percentages entirely — the deposit is the real typed cash figure
  (clamped to `[0, grandTotal]`), and the balance/monthly schedule are derived from
  `grandTotal - depositAmount`. The "before/after interest" toggle is correctly ignored in this
  mode (there's no percentage base to apply it to).

**`QuotationScreen.tsx`** (the Standard Quotation calculator): a new "Deposit amount" selector —
`Standard (configured %)` / `Custom percent` / `Fixed amount the client wants to pay` — with the
matching input field appearing only for the active mode. The existing "Deposit calculation"
dropdown's labels (`Before interest — N% of net`, `After interest — N% of net + interest`) now
read the real configured percent instead of a hardcoded "30%" string, and the results summary's
"Deposit (...)" row label is dynamic across all three modes.

**`PricingQuotationSettingsTab.tsx`**: a new "Standard deposit" section with a "Default deposit
percent (%)" field, saved through the exact same `useUpdateConfig`/`useLogPricingChange` pattern
every other pricing field on this screen already uses (change history included for free).

## The "before/after interest %" dependency — confirmed real, not conflated

The user's mental model is correct: the two dropdown options' *labels and math* both now derive
from `config.defaultDepositPct`, so changing the Settings number immediately changes what "30%"
reads as everywhere in the calculator (both before- and after-interest paths), with no further
code change needed. What does **not** change, and was never supposed to: the per-plan interest
*amounts* themselves (`int3`/`int6`/`int9`/`int12`, a flat GHS figure per plan length) are a
separate, already-independently-configurable business setting — the deposit % and the interest
amount are two different real numbers that happen to both enter the same deposit calculation,
not one driving the other.

## Scope note

Technical Quotation's own deposit-percent override parameter already existed in the logic layer
(unused) and now correctly uses the configurable default as its fallback, but no new UI control
for a per-quotation override was added to `TechnicalQuotationScreen.tsx` — the user's request
specifically described "the quotation app['s]... deposit calculation section," matching the
Standard calculator's own UI (the one with the literal "30%" labels) exactly. Adding the same
3-mode selector to Technical Quotation would be a small, low-risk follow-up if wanted.

## Verification

`npx tsc -b` (with `NODE_OPTIONS="--max-old-space-size=4096"`, the known workaround for this
shared dev machine's transient OOM, documented since Phase 3 of the master sweep) — clean.
