import { useState } from 'react';
import { getCurrentPosition } from '../../../shared/lib/geolocation';
import { useAttendanceHistory, useSignIn, useSignOut, useTodayAttendance } from '../hooks/useAttendance';
import styles from './AttendanceScreen.module.css';

function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// No clock_in()/clock_out() RPC exists on production (confirmed live) --
// signIn()/signOut() in the data source do the "does today's row already
// exist" / "is sign_out_at already set" checks themselves. Late/off-site
// are self-reported (checkbox + reason), not computed, because no shift-
// start-time or office-geofence-radius config exists anywhere in the
// schema to derive them from -- see AttendanceRecord's comment in
// types/domain.ts.
export function AttendanceScreen() {
  const { data: today, isLoading } = useTodayAttendance();
  const { data: history } = useAttendanceHistory(14);
  const signIn = useSignIn();
  const signOut = useSignOut();

  const [showForm, setShowForm] = useState<'in' | 'out' | null>(null);
  const [offSite, setOffSite] = useState(false);
  const [reason, setReason] = useState('');
  const [late, setLate] = useState(false);
  const [lateReason, setLateReason] = useState('');

  function resetForm() {
    setShowForm(null);
    setOffSite(false);
    setReason('');
    setLate(false);
    setLateReason('');
  }

  async function submitSignIn() {
    const pos = await getCurrentPosition();
    await signIn.mutateAsync({ lat: pos?.lat, lng: pos?.lng, offSite, reason, late, lateReason });
    resetForm();
  }

  async function submitSignOut() {
    if (!today) return;
    const pos = await getCurrentPosition();
    await signOut.mutateAsync({ id: today.id, input: { lat: pos?.lat, lng: pos?.lng, offSite, reason } });
    resetForm();
  }

  const isPending = signIn.isPending || signOut.isPending;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Attendance</h1>
      <p className={styles.sub}>Sign in when you start work, sign out when you're done.</p>

      <div className={styles.card}>
        {!isLoading && !today && (
          <>
            <div className={styles.statusRow}>
              <div>
                <div className={styles.statusLabel}>Today</div>
                <div className={styles.statusTime}>Not signed in</div>
              </div>
            </div>
            {showForm !== 'in' ? (
              <button type="button" className={styles.actionBtn} onClick={() => setShowForm('in')}>
                Sign in
              </button>
            ) : (
              <div className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.checkLabel}>
                    <input type="checkbox" checked={offSite} onChange={(e) => setOffSite(e.target.checked)} />
                    Signing in off-site
                  </label>
                  {offSite && <input className={styles.input} placeholder="Why are you off-site today?" value={reason} onChange={(e) => setReason(e.target.value)} />}
                </div>
                <div className={styles.field}>
                  <label className={styles.checkLabel}>
                    <input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} />
                    Signing in late
                  </label>
                  {late && <input className={styles.input} placeholder="Reason for lateness" value={lateReason} onChange={(e) => setLateReason(e.target.value)} />}
                </div>
                <p className={styles.hint}>We'll try to capture your location -- it's fine if that's not available.</p>
                <button type="button" className={styles.actionBtn} onClick={submitSignIn} disabled={isPending}>
                  {isPending ? 'Signing in…' : 'Confirm sign in'}
                </button>
              </div>
            )}
          </>
        )}

        {today && !today.signOutAt && (
          <>
            <div className={styles.statusRow}>
              <div>
                <div className={styles.statusLabel}>Signed in</div>
                <div className={styles.statusTime}>{fmtTime(today.signInAt)}</div>
                {today.isOffSiteIn && <div className={styles.statusSub}>Off-site{today.signInReason ? `: ${today.signInReason}` : ''}</div>}
              </div>
            </div>
            {showForm !== 'out' ? (
              <button type="button" className={styles.actionBtn} onClick={() => setShowForm('out')}>
                Sign out
              </button>
            ) : (
              <div className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.checkLabel}>
                    <input type="checkbox" checked={offSite} onChange={(e) => setOffSite(e.target.checked)} />
                    Signing out off-site
                  </label>
                  {offSite && <input className={styles.input} placeholder="Why are you off-site?" value={reason} onChange={(e) => setReason(e.target.value)} />}
                </div>
                <button type="button" className={styles.actionBtn} onClick={submitSignOut} disabled={isPending}>
                  {isPending ? 'Signing out…' : 'Confirm sign out'}
                </button>
              </div>
            )}
          </>
        )}

        {today?.signOutAt && (
          <div className={styles.statusRow}>
            <div>
              <div className={styles.statusLabel}>Today, complete</div>
              <div className={styles.times}>
                <div>
                  <div className={styles.statusSub}>In</div>
                  <div className={styles.rowTimes}>{fmtTime(today.signInAt)}</div>
                </div>
                <div>
                  <div className={styles.statusSub}>Out</div>
                  <div className={styles.rowTimes}>{fmtTime(today.signOutAt)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {history && history.length > 0 && (
        <>
          <div className={styles.historyTitle}>Recent history</div>
          {history.map((h) => (
            <div className={styles.row} key={h.id}>
              <div className={styles.date}>{h.workDate}</div>
              <div className={styles.rowTimes}>
                {fmtTime(h.signInAt)} → {fmtTime(h.signOutAt)}
                {(h.isOffSiteIn || h.isOffSiteOut) && <span className={styles.offSite}> · off-site</span>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
