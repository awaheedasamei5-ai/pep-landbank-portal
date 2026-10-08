"use client";

import { useState } from "react";
import OpenHrAttendance from "@/openhr/pages/Attendance";
import OpenHrAttendanceLogs from "@/openhr/pages/AttendanceLogs";
import { OpenHrProviders, useAuth } from "@/openhr/OpenHrProviders";

// Mirrors OpenHRApp's own real composition (src/App.tsx: 'attendance-logs'/
// 'attendance-audit' render AttendanceLogs as the landing page; 'attendance'
// is the full-screen camera punch flow it launches into) rather than
// inventing a new layout -- this is the raw duplicate phase, per the user's
// explicit instruction to duplicate apps that already have a complete repo
// implementation first, twist to fit Palmstead afterward (not done yet).
function AttendanceInner() {
  const { user, isLoading } = useAuth();
  const [punching, setPunching] = useState(false);

  if (isLoading || !user) return null;

  if (punching) {
    return <OpenHrAttendance user={user} onFinish={() => setPunching(false)} />;
  }

  const isAuditRole = user.role === "ADMIN" || user.role === "HR" || user.role === "MANAGER";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPunching(true)}
        className="fixed bottom-8 right-8 z-50 rounded-full bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-widest text-white shadow-xl hover:bg-primary-hover transition-all"
      >
        Check In / Out
      </button>
      <OpenHrAttendanceLogs user={user} viewMode={isAuditRole ? "AUDIT" : "MY"} />
    </div>
  );
}

export default function AttendancePageClient() {
  return (
    <OpenHrProviders>
      <AttendanceInner />
    </OpenHrProviders>
  );
}
