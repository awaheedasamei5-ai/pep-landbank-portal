import { Suspense } from "react";

import { AddSiteVisitScreen } from "@/webnext/features/site-visits/screens/AddSiteVisitScreen";

export default function Page() {
  return (
    <Suspense>
      <AddSiteVisitScreen />
    </Suspense>
  );
}
