"use client";

import { useState } from "react";
import OpenHrLeave from "@/openhr/pages/Leave";
import OpenHrLeaveSettings from "@/openhr/pages/LeaveSettings";
import { OpenHrProviders, useAuth } from "@/openhr/OpenHrProviders";

function LeaveInner() {
  const { user, isLoading } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  if (isLoading || !user) return null;

  const isAdmin = user.role === "ADMIN" || user.role === "HR";

  if (showSettings) {
    return <OpenHrLeaveSettings onBack={() => setShowSettings(false)} />;
  }

  return (
    <div className="relative">
      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="fixed bottom-8 right-8 z-50 rounded-full bg-slate-900 px-6 py-4 text-xs font-semibold uppercase tracking-widest text-white shadow-xl hover:bg-slate-800 transition-all"
        >
          Leave Settings
        </button>
      )}
      <OpenHrLeave user={user} />
    </div>
  );
}

// Raw duplicate of OpenHRApp's own Leave page -- it already composes the
// Employee module for everyone plus the Managerial/HR modules conditionally
// on user.role (see src/openhr/pages/Leave.tsx), so no separate "management"
// route is needed, unlike Attendance. Settings (src/openhr/pages/
// LeaveSettings.tsx) are housed inside this app, not a separate settings
// app, per the standing rule -- admin-only, toggled the same way
// Attendance toggles its punch screen.
export default function LeavePageClient() {
  return (
    <OpenHrProviders>
      <LeaveInner />
    </OpenHrProviders>
  );
}
