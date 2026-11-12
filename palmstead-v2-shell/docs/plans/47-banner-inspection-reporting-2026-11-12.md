# Banner inspection reporting — V2

Date: 12 November 2026. This continues plans 45 and 46 and uses only V2 `rebuild` and Supabase `sbydzrlzqxcdbudjaube`.

## Source and definitions

The Banner report already counts inventory, current condition, map coverage, linked leads and generic status entries. A status entry can be made without visiting a banner. The new `banner_inspections` table records a separate physical visit with an authenticated inspector, server time, observed condition, finding and private photo. [ArcGIS Field Maps](https://doc.arcgis.com/en/field-maps/android/use-maps/inspect.htm) likewise distinguishes an asset's current status from related historical inspection reports; its [inspection monitoring example](https://doc.arcgis.com/en/arcgis-solutions/latest/reference/use-solar-panel-inspections.htm) tracks progress and issues. Palmstead uses the existing shadcn Card, Field, chart and table system instead of importing an incompatible map or analytics backend.

An inspection is *recent* when its latest server timestamp is within the selected 30, 60 or 90 calendar-day lookback. “No recent inspection” includes both never-inspected banners and banners last inspected before that cutoff. This is an attention list, not a contractual SLA or proof that staff failed an assigned task. “Finding needs work” means the **latest physical observation** was maintenance or replacement; it is not inferred from an ordinary status log. Map coordinates and device accuracy are evidence metadata only, not verified location. A private photo stays in the banner detail screen; the report and PDF show its visit row and finding, but do not publish a reusable signed link or embed confidential images in a mass export.

## Scope and filters

The existing date, area, current condition, banner creator and map-quality controls remain. Date basis additionally supports latest physical inspection. New controls select inspection coverage, lookback and latest inspector. Their intersection drives the banner cohort. The inspection register then shows every inspection for that cohort within the selected date range, while the banner register shows each banner's most recent inspection regardless of the period. The count cards separate recent, never and attention-needed banners from physical inspections within the period. Monthly activity distinguishes additions, generic status entries and physical inspections. The PDF uses the same cohort and period, states the filter definitions, and includes a paginated inspection register with server time, banner, inspector, observed condition, finding and device accuracy. Empty data gets an explicit row rather than an empty chart/table.

## Security and data behavior

Read only from the existing RLS-protected `banner_inspections`, banners, status logs and role-visible leads. Both active Staff and Management may see company-wide banner inspection history. No report export changes an inspection or exposes a Storage path or signed photo URL. Exported information is still internal company data and uses the current browser's authorization; there is no public report endpoint. A newly signed-in Staff member can see historical company-wide inspections. Staff's personal pipeline remains separate.

## Verification boundary

Typecheck and cloud preview build, Management and Staff report views, filter intersection, empty inspection state, PDF text/table/layout, 390px width, and V2 production READY plus fresh reload. The live inspection table may legitimately be empty. A rollback-only synthetic inspection can verify the reporting calculations without claiming a real field visit; do not leave test rows. A true handset photo/location submission and field alerts remain a separate controlled field test.

