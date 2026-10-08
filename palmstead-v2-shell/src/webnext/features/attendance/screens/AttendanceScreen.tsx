"use client";

import { useState } from 'react';
import { useAttendance } from '../hooks/useAttendance';
import { useAttendanceMonth } from '../hooks/useAttendanceMonth';
import { useAttendanceComparison } from '../hooks/useAttendanceComparison';
import { useSessionStore } from '../../../auth/useSessionStore';
import { AttendanceCheckInScreen } from './AttendanceCheckInScreen';
import { AttendanceManagementScreen } from './AttendanceManagementScreen';
import { AttendanceMonthCard } from '../components/AttendanceMonthCard';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { AttendanceComparison } from '../components/AttendanceComparison';
import styles from './AttendanceScreen.module.css';

function hoursWorkedStr(signInAt: string | null, signOutAt: string | null): string {
  if (!signInAt) return '--:--';
  const mins = Math.max(0, Math.round((new Date(signOutAt || Date.now()).getTime() - new Date(signInAt).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// Real user ask (2026-09-12): "these apps are complete, start afresh
// new builds" -- this dashboard (today's status + entry point into the
// real camera-first check-in flow, plus the month KPI/on-time ring,
// leave-aware calendar heatmap, and you-vs-team comparison) is new
// composition around the approved repo's own components, not a
// redesign of V1's or web-next's screen.
export function AttendanceScreen() {
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  const [view, setView] = useState<'mine' | 'management'>('mine');
  const { today, isLoadingToday, reconcileMessage, dismissReconcileMessage } = useAttendance();
  const { monthStart, monthKey, cells, stats } = useAttendanceMonth();
  const { you, rank, teamCount, teamAvgOnTime, teamAvgAttended } = useAttendanceComparison(monthKey);
  const monthLabel = monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const [checkingIn, setCheckingIn] = useState(false);

  if (checkingIn) return <AttendanceCheckInScreen onFinish={() => setCheckingIn(false)} />;

  if (isManager && view === 'management') {
    return (
      <div>
        <div className={styles.viewSwitchOuter}>
          <div className={styles.viewSwitch}>
            <button type="button" className={styles.viewBtn} onClick={() => setView('mine')}>My Attendance</button>
            <button type="button" className={styles.viewBtnActive}>Management</button>
          </div>
        </div>
        <AttendanceManagementScreen />
      </div>
    );
  }

  const signedIn = !!today?.signInAt;
  const signedOut = !!today?.signOutAt;

  return (
    <div className={styles.wrap}>
      {isManager && (
        <div className={styles.viewSwitch}>
          <button type="button" className={styles.viewBtnActive}>My Attendance</button>
          <button type="button" className={styles.viewBtn} onClick={() => setView('management')}>Management</button>
        </div>
      )}
      <h1 className={styles.title}>Attendance</h1>
      <p className={styles.sub}>Sign in when you arrive, sign out when you leave — your location is captured automatically.</p>

      {reconcileMessage && (
        <div className={styles.reconcileBanner}>
          <span>{reconcileMessage}</span>
          <button type="button" onClick={dismissReconcileMessage} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {isLoadingToday ? (
        <p className={styles.emptyMsg}>Loading…</p>
      ) : (
        <div className={styles.todayCard}>
          <div className={styles.todayStatus}>
            {!signedIn ? 'Not signed in yet' : !signedOut ? 'Signed in' : 'Day complete'}
          </div>
          {signedIn && (
            <div className={styles.todayMeta}>
              In {new Date(today!.signInAt!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {signedOut && ` · Out ${new Date(today!.signOutAt!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
              {' · '}
              {hoursWorkedStr(today!.signInAt, today!.signOutAt)}
            </div>
          )}
          {!signedOut && (
            <button type="button" className={styles.actionBtn} onClick={() => setCheckingIn(true)}>
              {!signedIn ? 'Check In' : 'Check Out'}
            </button>
          )}
        </div>
      )}

      <AttendanceMonthCard monthLabel={monthLabel} stats={stats} />
      <AttendanceCalendar cells={cells} />
      <AttendanceComparison you={you} rank={rank} teamCount={teamCount} teamAvgOnTime={teamAvgOnTime} teamAvgAttended={teamAvgAttended} />
    </div>
  );
}
