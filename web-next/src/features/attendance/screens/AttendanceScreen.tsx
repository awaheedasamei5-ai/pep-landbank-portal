import { useState } from 'react';
import { getCurrentPosition, haversineMeters } from '../../../shared/lib/geolocation';
import { resizeSelfieToDataUri } from '../../../shared/lib/selfiePhoto';
import { useAttendanceHistory, useSignIn, useSignOut, useTodayAttendance } from '../hooks/useAttendance';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { SegmentedGauge } from '../../../shared/ui/SegmentedGauge';
import { today as todayIso } from '../../../shared/lib/format';
import styles from './AttendanceScreen.module.css';

function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function weekdaysElapsedThisMonth(): number {
  const now = new Date(todayIso() + 'T00:00:00');
  let count = 0;
  for (let d = 1; d <= now.getDate(); d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// Real geofence/cutoff check (Master Spec 11.1), ported from index.html's
// checkOffSite()/late-cutoff logic -- Config.officeLat/officeLng null means
// the office location was never configured, so off-site can never be
// determined (matches index.html: "if(CONFIG.officeLat==null...) return
// not off-site" rather than treating an unset office as (0,0)).
function computeOffSite(lat: number | undefined, lng: number | undefined, officeLat: number | null, officeLng: number | null, radiusMeters: number): boolean {
  if (lat == null || lng == null || officeLat == null || officeLng == null) return false;
  return haversineMeters(lat, lng, officeLat, officeLng) > (radiusMeters || 150);
}

// No clock_in()/clock_out() RPC exists on production (confirmed live) --
// signIn()/signOut() in the data source do the "does today's row already
// exist" / "is sign_out_at already set" checks themselves. Late/off-site
// used to be pure self-report; now computed for real against Config's
// geofence + cutoff-time (see AttendanceRecord's comment in types/domain.ts
// for the correction) -- a genuine reason is REQUIRED, not optional, when
// either is detected, and sign-in requires a real photo, matching
// index.html's captureSelfie() gate exactly. Deliberately NOT ported:
// device/session metadata (no column for it) and the 10am/7pm scheduled
// report SMS/PDF (Section 11.4 -- a separate, server-side feature).
export function AttendanceScreen() {
  const { data: today, isLoading } = useTodayAttendance();
  const { data: history } = useAttendanceHistory(31);
  const { data: config } = useConfig();
  const signIn = useSignIn();
  const signOut = useSignOut();

  const cutoff = config?.attendanceCutoffTime ?? '09:00';
  const monthKey = todayIso().slice(0, 7);
  const monthHistory = (history ?? []).filter((h) => h.workDate.slice(0, 7) === monthKey);
  const daysAttended = monthHistory.filter((h) => h.signInAt).length;
  const onTimeDays = monthHistory.filter((h) => h.signInAt && h.signInAt.slice(11, 16) <= cutoff).length;
  const workingDaysSoFar = weekdaysElapsedThisMonth();

  const [showForm, setShowForm] = useState<'in' | 'out' | null>(null);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});
  const [isLate, setIsLate] = useState(false);
  const [lateReason, setLateReason] = useState('');
  const [isOffSite, setIsOffSite] = useState(false);
  const [offSiteReason, setOffSiteReason] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function resetForm() {
    setShowForm(null);
    setCoords({});
    setIsLate(false);
    setLateReason('');
    setIsOffSite(false);
    setOffSiteReason('');
    setPhoto(null);
    setPhotoError(null);
  }

  async function beginSignIn() {
    setLocating(true);
    setIsLate(nowHHMM() > cutoff);
    const pos = await getCurrentPosition();
    setCoords({ lat: pos?.lat, lng: pos?.lng });
    setIsOffSite(computeOffSite(pos?.lat, pos?.lng, config?.officeLat ?? null, config?.officeLng ?? null, config?.officeRadiusMeters ?? 250));
    setLocating(false);
    setShowForm('in');
  }

  async function beginSignOut() {
    setLocating(true);
    const pos = await getCurrentPosition();
    setCoords({ lat: pos?.lat, lng: pos?.lng });
    setIsOffSite(computeOffSite(pos?.lat, pos?.lng, config?.officeLat ?? null, config?.officeLng ?? null, config?.officeRadiusMeters ?? 250));
    setLocating(false);
    setShowForm('out');
  }

  async function handlePhotoFile(file: File | null) {
    if (!file) return;
    try {
      setPhoto(await resizeSelfieToDataUri(file));
      setPhotoError(null);
    } catch {
      setPhotoError('Could not read that photo -- try again.');
    }
  }

  const canConfirmSignIn = !!photo && (!isLate || lateReason.trim()) && (!isOffSite || offSiteReason.trim());
  const canConfirmSignOut = !isOffSite || offSiteReason.trim();

  async function submitSignIn() {
    if (!canConfirmSignIn) return;
    await signIn.mutateAsync({
      lat: coords.lat,
      lng: coords.lng,
      offSite: isOffSite,
      reason: isOffSite ? offSiteReason.trim() : undefined,
      late: isLate,
      lateReason: isLate ? lateReason.trim() : undefined,
      photo: photo ?? undefined,
    });
    resetForm();
  }

  async function submitSignOut() {
    if (!today || !canConfirmSignOut) return;
    await signOut.mutateAsync({ id: today.id, input: { lat: coords.lat, lng: coords.lng, offSite: isOffSite, reason: isOffSite ? offSiteReason.trim() : undefined } });
    resetForm();
  }

  const isPending = signIn.isPending || signOut.isPending;
  const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const nowDateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const clockPhase: 'in' | 'out' | 'done' = !today ? 'in' : !today.signOutAt ? 'out' : 'done';
  const circleLabel = clockPhase === 'in' ? 'Clock in' : clockPhase === 'out' ? 'Clock out' : 'Complete';
  const circleSub = clockPhase === 'in' ? nowDateLabel : clockPhase === 'out' ? `In at ${fmtTime(today?.signInAt ?? null)}` : `${fmtTime(today?.signInAt ?? null)} — ${fmtTime(today?.signOutAt ?? null)}`;

  function handleCircleClick() {
    if (clockPhase === 'done' || locating) return;
    if (showForm) {
      resetForm();
      return;
    }
    if (clockPhase === 'in') beginSignIn();
    else beginSignOut();
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
          <button type="button" className={`${styles.clockCircle} ${styles[`phase_${clockPhase}`]}`} onClick={handleCircleClick} disabled={isPending || clockPhase === 'done' || locating}>
            <span className={styles.clockCircleTime}>{locating ? 'Locating…' : clockPhase === 'in' ? nowLabel : circleLabel}</span>
            <span className={styles.clockCircleLabel}>{locating ? '' : clockPhase === 'in' ? circleLabel : circleSub}</span>
          </button>
        )}
        {!isLoading && clockPhase !== 'in' && <div className={styles.clockCaption}>{circleSub}</div>}

        {showForm === 'in' && (
          <div className={styles.form}>
            {isLate && (
              <div className={styles.field}>
                <label className={styles.checkLabel}>You're signing in after {cutoff} -- why?</label>
                <input className={styles.input} placeholder="Reason for lateness" value={lateReason} onChange={(e) => setLateReason(e.target.value)} />
              </div>
            )}
            {isOffSite && (
              <div className={styles.field}>
                <label className={styles.checkLabel}>You appear to be outside the office area -- why?</label>
                <input className={styles.input} placeholder="e.g. working from a site visit today" value={offSiteReason} onChange={(e) => setOffSiteReason(e.target.value)} />
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.checkLabel}>Photo proof</label>
              {photo ? <img src={photo} alt="Sign-in selfie" className={styles.selfiePreview} /> : <p className={styles.hint}>Take a quick selfie to confirm it's really you signing in.</p>}
              <input className={styles.input} type="file" accept="image/*" capture="user" onChange={(e) => handlePhotoFile(e.target.files?.[0] ?? null)} />
              {photoError && <p className={styles.hint}>{photoError}</p>}
            </div>
            <button type="button" className={styles.confirmBtn} onClick={submitSignIn} disabled={isPending || !canConfirmSignIn}>
              {isPending ? 'Signing in…' : 'Confirm sign in'}
            </button>
          </div>
        )}

        {showForm === 'out' && (
          <div className={styles.form}>
            {isOffSite && (
              <div className={styles.field}>
                <label className={styles.checkLabel}>You appear to be outside the office area -- why?</label>
                <input className={styles.input} placeholder="e.g. working from a site visit today" value={offSiteReason} onChange={(e) => setOffSiteReason(e.target.value)} />
              </div>
            )}
            <button type="button" className={styles.confirmBtn} onClick={submitSignOut} disabled={isPending || !canConfirmSignOut}>
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
              const onTime = !!h.signInAt && h.signInAt.slice(11, 16) <= cutoff;
              const weekday = new Date(h.workDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
              const dayNum = new Date(h.workDate + 'T00:00:00').getDate();
              return (
                <div className={styles.row} key={h.id}>
                  {h.signInPhoto ? <img src={h.signInPhoto} alt="" className={styles.historyPhoto} /> : <div className={styles.dateBadge}>
                    <span className={styles.dateBadgeDay}>{dayNum}</span>
                    <span className={styles.dateBadgeWeekday}>{weekday}</span>
                  </div>}
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
