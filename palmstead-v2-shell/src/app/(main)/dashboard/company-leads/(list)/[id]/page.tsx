import { CompanyLeadClientScreen } from "@/webnext/features/company-leads/screens/CompanyLeadClientScreen";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.5 -- a
// real Company-Leads-specific layered client page (Overview/Payment
// History/Site Visits & Allocation/Contract of Sale tabs), replacing the
// generic single-scroll PipelineDetailScreen for this route only. Master
// Pipeline's own /dashboard/pipeline/[id] route is untouched.
export default function Page() {
  return <CompanyLeadClientScreen />;
}
