import { Suspense } from "react";

import { AddLeadForm } from "../_components/add-lead-form";

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <Suspense>
        <AddLeadForm />
      </Suspense>
    </div>
  );
}
