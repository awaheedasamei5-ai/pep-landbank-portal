# Personal Banner inspection section — V2

Date: 12 November 2026. Follows the verified Banner inspection report release in PR #80, production commit `2c1c0c47f0b3d709fa4f891243cf9c8c48420831`.

The combined Staff Report already includes attendance, sales calls, leads, visits, scheduled work and banners a person logged. A person can inspect a banner they did not create, so their inspection history must be a separate section. The source of truth is `banner_inspections`, which records the authenticated inspector and server timestamp. The joined banner supplies its name and area. The section uses the report's existing Ghana-local date range, on-screen table, inclusion checkbox and selected-section PDF. It must show the person's own records only; the company-wide Banner report remains available through its detailed link. No private photo path or signed image URL belongs in this broad personal export.

Verification: typecheck, staff sign-in, selected section with zero inspections, a filtered PDF showing an honest zero state, and responsive width. A real inspection is not to be fabricated just to populate the report. Future field test can verify a genuine record appears automatically. Management can inspect company-wide Banner history in the dedicated report.

