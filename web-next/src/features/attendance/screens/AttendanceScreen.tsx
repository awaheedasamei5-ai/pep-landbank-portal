import { useState } from 'react';
import { getCurrentPosition } from '../../../shared/lib/geolocation';
import { useAttendanceHistory, useSignIn, useSignOut, useTodayAttendance } from '../hooks/useAttendance';
import { SegmentedGauge } from '../../../shared/ui/SegmentedGauge';
import { today as todayIso } from '../../../shared/lib/format';
import styles from './AttendanceScreen.module.css';

function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Same 09:00 on-time cutoff the Leaderboard's onTimeDays already assumes
// (source.ts's manager-overview aggregation) -- no shift-start-time config
// exists anywhere in the schema (see this file's own top comment), so every
// "on time" reading in this app deliberately uses the same hardcoded
// convention rather than each screen inventing its own.
const ON_TIME_CUTOFF = '09:00';

function weekdaysElapsedThisMonth(): number {
  const now = new Date(todayIso() + 'T00:00:00');
  let count = 0;
  for (let d = 1; d <= now.getDate(); d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
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
  const { data: history } = useAttendanceHistory(31);
  const signIn = useSignIn();
  const signOut = useSignOut();

  const thisMonth = todayIso().slice(0, 7);
  const monthHistory = (history ?? []).filter((h) => h.workDate.slice(0, 7) === thisMonth);
  const daysAttended = monthHistory.filter((h) => h.signInAt).length;
  const onTimeDays = monthHistory.filter((h) => h.signInAt && h.signInAt.slice(11, 16) <= ON_TIME_CUTOFF).length;
  const workingDaysSoFar = weekdaysElapsedThisMonth();

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
  const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const nowDateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const clockPhase: 'in' | 'out' | 'done' = !today ? 'in' : !today.signOutAt ? 'out' : 'done';
  const circleLabel = clockPhase === 'in' ? 'Clock in' : clockPhase === 'out' ? 'Clock out' : 'Complete';
  const circleSub = clockPhase === 'in' ? nowDateLabel : clockPhase === 'out' ? `In at ${fmtTime(today?.signInAt ?? null)}` : `${fmtTime(today?.signInAt ?? null)} — ${fmtTime(today?.signOutAt ?? null)}`;

  function handleCircleClick() {
    if (clockPhase === 'done') return;
    setShowForm((f) => (f ? null : clockPhase));
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Attendance</h1>
      <p className={styles.sub}>Sign in when you start work, sign out when you're done.</p>

      <div className={styles.clockCard}>
        {isLoading ? (
          <div className={`${styles.clockCircle} ${styles.phase_loading}`}>
            <span className={styles.clockCircleLabel}>Loading…</span>
          </div>
        ) : (
          <button type="button" className={`${styles.clockCircle} ${styles[`phase_${clockPhase}`]}`} onClick={handleCircleClick} disabled={isPending || clockPhase === 'done'}>
            <span className={styles.clockCircleTime}>{clockPhase === 'in' ? nowLabel : circleLabel}</span>
            <span className={styles.clockCircleLabel}>{clockPhase === 'in' ? circleLabel : circleSub}</span>
          </button>
        )}
        {!isLoading && clockPhase !== 'in' && <div className={styles.clockCaption}>{circleSub}</div>}

        {showForm === 'in' && (
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
            <button type="button" className={styles.confirmBtn} onClick={submitSignIn} disabled={isPending}>
              {isPending ? 'Signing in…' : 'Confirm sign in'}
            </button>
          </div>
        )}

        {showForm === 'out' && (
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={offSite} onChange={(e) => setOffSite(e.target.checked)} />
                Signing out off-site
              </label>
              {offSite && <input className={styles.input} placeholder="Why are you off-site?" value={reason} onChange={(e) => setReason(e.target.value)} />}
            </div>
            <button type="button" className={styles.confirmBtn} onClick={submitSignOut} disabled={isPending}>
              {isPending ? 'Signing out…' : 'Confirm sign out'}
            </button>
          </div>
        )}
      </div>

      <div className={styles.gaugeCard}>
        <SegmentedGauge value={daysAttended} max={Math.max(workingDaysSoFar, daysAttended, 1)} label="days this month" sublabel={`${onTimeDays} on time`} />
      </div>

      {history && history.length > 0 && (
        <>
          <div className={styles.historyTitle}>Recent history</div>
          <div className={styles.historyCard}>
            {history.map((h) => {
              const onTime = !!h.signInAt && h.signInAt.slice(11, 16) <= ON_TIME_CUTOFF;
              const weekday = new Date(h.workDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
              const dayNum = new Date(h.workDate + 'T00:00:00').getDate();
              return (
                <div className={styles.row} key={h.id}>
                  <div className={styles.dateBadge}>
                    <span className={styles.dateBadgeDay}>{dayNum}</span>
                    <span className={styles.dateBadgeWeekday}>{weekday}</span>
                  </div>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTimes}>
                      {fmtTime(h.signInAt)} <span className={styles.arrow}>→</span> {fmtTime(h.signOutAt)}
                    </div>
                    {(h.isOffSiteIn || h.isOffSiteOut) && <div className={styles.offSite}>Off-site</div>}
                  </div>
                  <span className={`${styles.statusDot} ${onTime ? styles.dotOk : styles.dotLate}`} title={onTime ? 'On time' : 'Late'} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
