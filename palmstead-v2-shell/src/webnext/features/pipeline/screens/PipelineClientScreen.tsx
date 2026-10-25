"use client";

import { useSessionStore } from "../../../auth/useSessionStore";
import { LeadClientScreen } from "../../../shared/ui/LeadClientScreen";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.5,
// generalized -- thin My/Master Pipeline wrapper around the shared
// LeadClientScreen (same real Overview/Payment History/Site Visits &
// Allocation/Contract of Sale tabs Company Leads clients already get).
// Both roles share the one /dashboard/pipeline route, so backHref is the
// same either way -- only the eyebrow label is role-aware.
export function PipelineClientScreen() {
  const profile = useSessionStore((s) => s.profile);
  const isMaster = profile?.role === "manager";
  return <LeadClientScreen backHref="/dashboard/pipeline" eyebrow={isMaster ? "Master Pipeline Lead" : "Pipeline Lead"} />;
}
