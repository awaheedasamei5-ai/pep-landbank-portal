"use client";

import { useState } from "react";
import OpenHrAttendance from "@/openhr/pages/Attendance";
import OpenHrAttendanceLogs from "@/openhr/pages/AttendanceLogs";
import { OpenHrProviders, useAuth } from "@/openhr/OpenHrProviders";
import { AttendanceManagementScreen } from "@/webnext/features/attendance/screens/AttendanceManagementScreen";

// Mirrors OpenHRApp's own real composition (src/App.tsx: 'attendance-logs'/
// 'attendance-audit' render AttendanceLogs as the landing page; 'attendance'
// is the full-screen camera punch flow it launches into) rather than
// inventing a new layout -- this is the raw duplicate phase, per the user's
// explicit instruction to duplicate apps that already have a complete repo
// implementation first, twist to fit Palmstead afterward (not done yet).
function AttendanceInner() {
  const { user, isLoading } = useAuth();
  const [punching, setPunching] = useState(false);
  const [showManagement, setShowManagement] = useState(false);

  if (isLoading || !user) return null;

  if (punching) {
    return <OpenHrAttendance user={user} onFinish={() => setPunching(false)} />;
  }

  const isAuditRole = user.role === "ADMIN" || user.role === "HR" || user.role === "MANAGER";

  // Full staff+management dashboard (Today / Records / Exceptions /
  // Policy & Locations), restored from the real hand-built Attendance work
  // (tag v2-attendance-leave-handbuilt-2026-10-08) rather than rebuilt --
  // its own data layer (useAttendanceManagement -> data/source.ts's
  // attendance/attendancePolicy/officeLocations/attendanceExceptions/
  // attendanceNotes) was never deleted, only the screens were, when the
  // raw-duplicate pass swapped in OpenHRApp's own punch flow.
  if (showManagement && isAuditRole) {
    return (
      <div>
        <div className="flex justify-end px-4 pt-4">
          <button
            type="button"
            onClick={() => setShowManagement(false)}
            className="rounded-full bg-slate-900 px-6 py-3 text-xs font-semibold uppercase tracking-widest text-white shadow-xl hover:bg-slate-800 transition-all"
          >
            Back to my attendance
          </button>
        </div>
        <AttendanceManagementScreen />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPunching(true)}
        className="fixed bottom-8 right-8 z-50 rounded-full bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-widest text-white shadow-xl hover:bg-primary-hover transition-all"
      >
        Check In / Out
      </button>
      {isAuditRole && (
        <button
          type="button"
          onClick={() => setShowManagement(true)}
          className="fixed bottom-8 right-48 z-50 rounded-full bg-slate-900 px-6 py-4 text-xs font-semibold uppercase tracking-widest text-white shadow-xl hover:bg-slate-800 transition-all"
        >
          Management Dashboard
        </button>
      )}
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
