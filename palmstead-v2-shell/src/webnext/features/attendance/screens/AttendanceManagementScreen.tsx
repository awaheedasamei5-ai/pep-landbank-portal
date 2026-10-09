"use client";

import Link from 'next/link';
import { ClipboardList, Settings, Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { useAttendanceManagement } from '../hooks/useAttendanceManagement';
import { TeamTodayCard } from '../components/TeamTodayCard';
import { AttendanceSuggestions } from '../components/AttendanceSuggestions';

// Attendance plan Part 4 -- "Management's real question is almost never
// 'show me a table' -- it's 'is anything wrong today, and who do I need
// to deal with.'" Rebuilt on the shell's real shadcn components after
// the 2026-10-08/09 correction: the old 4-way tab-state toggle
// (Today/Records/Exceptions/Policy&Locations) is now real routes
// (/management/records, /management/exceptions, /management/settings),
// same treatment Leave's Management screens already got.
export function AttendanceManagementScreen() {
  const mgmt = useAttendanceManagement();
  const signedIn = mgmt.today.filter((r) => r.signInAt).length;

  return (
    <div>
      <PageHeader
        title="Attendance — Management"
        description="Who's in today, what needs your attention."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/attendance/management/records">
                <ClipboardList />
                Records
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/attendance/management/exceptions">
                <Siren />
                Exceptions {mgmt.pendingExceptions.length > 0 ? `(${mgmt.pendingExceptions.length})` : ''}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/attendance/management/settings">
                <Settings />
                Policy &amp; Locations
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Signed in today" value={signedIn} />
        <StatCard label="Pending exceptions" value={mgmt.pendingExceptions.length} />
        <StatCard label="Records (30 days)" value={mgmt.recent30.length} />
      </div>

      <div className="mb-6">
        <TeamTodayCard records={mgmt.today} isLoading={mgmt.isLoadingToday} />
      </div>

      <AttendanceSuggestions
        suggestions={mgmt.suggestions}
        onIssue={async (s, reason) => {
          await mgmt.issueNote(s.staffKey, s.staffName, s.kind, reason, s.workDate);
        }}
      />
    </div>
  );
}
