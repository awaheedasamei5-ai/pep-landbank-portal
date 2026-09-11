import { Suspense } from "react";

import { AddLeadScreen } from "@/webnext/features/pipeline/screens/AddLeadScreen";

// Sibling of the (list) route group -- NOT wrapped by PipelineListScreen's
// Outlet (matches web-next's own separate top-level 'sales/pipeline/new'
// route, not nested under 'sales/pipeline'). Suspense is required here
// because AddLeadScreen reads useSearchParams() (via the router shim) for
// the real Client Database "+ New deal"/Company Leads prefill.
export default function Page() {
  return (
    <Suspense>
      <AddLeadScreen />
    </Suspense>
  );
}
