"use client";

import { LeadClientScreen } from "../../../shared/ui/LeadClientScreen";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.5 -- thin
// Company-Leads-scoped wrapper around the shared LeadClientScreen (see
// pipeline/screens/PipelineClientScreen.tsx for the analogous Pipeline
// wrapper -- My/Master Pipeline get the same layered tabs now too).
export function CompanyLeadClientScreen() {
  return <LeadClientScreen backHref="/dashboard/company-leads" eyebrow="Company Lead" />;
}
