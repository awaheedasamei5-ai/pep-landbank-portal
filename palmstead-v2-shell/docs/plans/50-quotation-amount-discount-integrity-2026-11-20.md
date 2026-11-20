# Quotation amount and discount integrity — 20 November 2026

## Scope found in the current V2 code

Standard Quotation is a live calculator with a downloadable PDF and an optional Save as lead action. It reads company plot prices, standard per-plot discounts, plan interest, and default deposit percentage from `app_config`. Technical Quotation calculates area-priced land and produces a related PDF. A lead quotation uses the lead's stored negotiated price, discount, and deposit target.

The fixed deposit input already exists in the Standard calculator, but its calculation silently caps an amount above the grand total, money is displayed with zero decimal places, and Save as lead omits both the selected deposit and the calculated discount. The Add Lead screen then applies its defaults again. Technical Quotation still has only the default deposit percentage. The PDFs infer a deposit percentage even when a fixed amount was agreed.

Preview testing exposed a further routing defect: the parent Pipeline layout reads the shim's one-shot navigation state before Add Lead mounts. The quote-to-lead handoff therefore uses a five-minute, same-tab draft that Add Lead consumes on mount, then removes. It is never persisted as a lead until the user explicitly saves the form.

## Contract for the repair

1. On installment plans, a valid fixed deposit is taken as entered to the pesewa. The rest of the final price is divided across the chosen months; the final installment absorbs rounding. Blank, negative, non-finite, over-total, and over-precision values are rejected visibly rather than silently changed. Full Payment has no deposit schedule.
2. Keep the configured standard plot discount. Add an optional, quotation-only further discount in GHS or percent of the price **after** the standard discount and **before** interest. Show the company discount, extra discount, net, interest, total, deposit, and balance separately. Reject an extra discount larger than its base or a percent outside 0–100.
3. Apply the same optional fixed/percentage deposit and optional extra discount to Technical Quotation; its area-derived price is the discount base. Neither quotation changes company-wide settings.
4. PDFs show the same monetary breakdown as the screen and label a fixed deposit as an amount, not an invented percentage. A Standard quotation saved as a lead carries its plot quantity, negotiated total discount, and exact deposit target into the lead form for review and persistence.
5. Verify pure calculation cases, invalid inputs, PDF text and layout, Staff and Management browser paths, and the final V2 production deployment. Do not touch V1.

