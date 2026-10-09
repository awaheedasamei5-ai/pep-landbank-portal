"use client";

import Link from 'next/link';
import { Siren, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { useAttendance } from '../hooks/useAttendance';
import { useAttendanceMonth } from '../hooks/useAttendanceMonth';
import { useAttendanceComparison } from '../hooks/useAttendanceComparison';
import { useSessionStore } from '../../../auth/useSessionStore';
import { AttendanceCheckInScreen } from './AttendanceCheckInScreen';
import { AttendanceMonthCard } from '../components/AttendanceMonthCard';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { AttendanceComparison } from '../components/AttendanceComparison';
import { useState } from 'react';

function hoursWorkedStr(signInAt: string | null, signOutAt: string | null): string {
  if (!signInAt) return '--:--';
  const mins = Math.max(0, Math.round((new Date(signOutAt || Date.now()).getTime() - new Date(signInAt).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// Staff Attendance dashboard, rebuilt on the shell's real shadcn
// components after the 2026-10-08/09 correction (same treatment as
// Leave) -- replaces the old view-state toggle with real routes
// (/attendance/management is its own page now). Check In/Out stays the
// primary, prominent element: a large circular button, not a corner
// overlay. The month KPI/calendar heatmap/comparison panels and the
// full-screen camera check-in flow are all real, unchanged logic --
// only their chrome is rebuilt here.
export function AttendanceScreen() {
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  const { today, isLoadingToday, reconcileMessage, dismissReconcileMessage } = useAttendance();
  const { monthStart, monthKey, cells, stats } = useAttendanceMonth();
  const { you, rank, teamCount, teamAvgOnTime, teamAvgAttended } = useAttendanceComparison(monthKey);
  const monthLabel = monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const [checkingIn, setCheckingIn] = useState(false);

  if (checkingIn) return <AttendanceCheckInScreen onFinish={() => setCheckingIn(false)} />;

  const signedIn = !!today?.signInAt;
  const signedOut = !!today?.signOutAt;

  return (
    <div className="p-4 pb-24 md:p-8">
      <PageHeader
        title="Attendance"
        description="Sign in when you arrive, sign out when you leave — your location is captured automatically."
        action={
          isManager ? (
            <Button asChild variant="outline">
              <Link href="/dashboard/attendance/management">Management</Link>
            </Button>
          ) : undefined
        }
      />

      {reconcileMessage && (
        <Alert className="mb-6">
          <AlertDescription>{reconcileMessage}</AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={dismissReconcileMessage}>
              <X />
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Card className="mb-6">
        <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
          {isLoadingToday ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <Badge variant={!signedIn ? 'outline' : !signedOut ? 'default' : 'secondary'}>{!signedIn ? 'Not signed in yet' : !signedOut ? 'Signed in' : 'Day complete'}</Badge>
              {signedIn && (
                <p className="text-sm text-muted-foreground">
                  In {new Date(today!.signInAt!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  {signedOut && ` · Out ${new Date(today!.signOutAt!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                  {' · '}
                  {hoursWorkedStr(today!.signInAt, today!.signOutAt)}
                </p>
              )}
              {!signedOut && (
                <button
                  type="button"
                  onClick={() => setCheckingIn(true)}
                  className="flex size-36 flex-col items-center justify-center gap-1 rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
                >
                  <span className="font-heading text-lg font-semibold uppercase tracking-wide">{!signedIn ? 'Check In' : 'Check Out'}</span>
                  <span className="text-xs opacity-80">Tap to start</span>
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Exception requests</CardTitle>
          <CardDescription>Pre-authorize an errand, site visit, or field assignment ahead of time</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/attendance/exceptions">
                <Siren />
                View / request
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
      </Card>

      <div className="mb-6">
        <AttendanceMonthCard monthLabel={monthLabel} stats={stats} />
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>This month</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceCalendar cells={cells} />
        </CardContent>
      </Card>
      <AttendanceComparison you={you} rank={rank} teamCount={teamCount} teamAvgOnTime={teamAvgOnTime} teamAvgAttended={teamAvgAttended} />
    </div>
  );
}
