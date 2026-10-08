"use client";

import OpenHrLeave from "@/openhr/pages/Leave";
import { OpenHrProviders, useAuth } from "@/openhr/OpenHrProviders";

function LeaveInner() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null;
  return <OpenHrLeave user={user} />;
}

// Raw duplicate of OpenHRApp's own Leave page -- it already composes the
// Employee module for everyone plus the Managerial/HR modules conditionally
// on user.role (see src/openhr/pages/Leave.tsx), so no separate "management"
// route is needed, unlike Attendance. Twist-to-fit pass (deciding how
// Palmstead's single manager role should map across isManager vs isAdmin)
// is deliberately NOT done yet.
export default function LeavePageClient() {
  return (
    <OpenHrProviders>
      <LeaveInner />
    </OpenHrProviders>
  );
}
