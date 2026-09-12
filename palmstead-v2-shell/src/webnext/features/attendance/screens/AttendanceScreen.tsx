"use client";

import { useState } from 'react';
import { useAttendance } from '../hooks/useAttendance';
import { AttendanceCheckInScreen } from './AttendanceCheckInScreen';
import styles from './AttendanceScreen.module.css';

function hoursWorkedStr(signInAt: string | null, signOutAt: string | null): string {
  if (!signInAt) return '--:--';
  const mins = Math.max(0, Math.round((new Date(signOutAt || Date.now()).getTime() - new Date(signInAt).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// Real user ask (2026-09-12): "these apps are complete, start afresh
// new builds" -- this dashboard (today's status + entry point into the
// real camera-first check-in flow) is new composition around the
// approved repo's own components, not a redesign of V1's or web-next's
// screen. Month KPIs, the calendar heatmap, and the team comparison
// (plan Part 4, Phase B) follow in continued work -- this covers the
// centerpiece (the actual sign-in/out flow) end to end, verified live,
// rather than a shallow pass across every planned piece at once.
export function AttendanceScreen() {
  const { today, isLoadingToday, reconcileMessage, dismissReconcileMessage } = useAttendance();
  const [checkingIn, setCheckingIn] = useState(false);

  if (checkingIn) return <AttendanceCheckInScreen onFinish={() => setCheckingIn(false)} />;

  const signedIn = !!today?.signInAt;
  const signedOut = !!today?.signOutAt;

  return (
    <div className={styles.wrap}>
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
    </div>
  );
}
