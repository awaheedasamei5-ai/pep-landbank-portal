import { useMemo, useState } from 'react';
import { Avatar } from '../../../shared/ui/Avatar';
import { CameraCapture } from '../../../shared/ui/CameraCapture';
import { Modal } from '../../../shared/ui/Modal';
import { OfficeMapSnippet } from '../../../shared/ui/OfficeMapSnippet';
import { PresetReasonPicker } from '../components/PresetReasonPicker';
import { AttendanceDetailModal } from '../components/AttendanceDetailModal';
import { MonthKpiCard } from '../components/MonthKpiCard';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { TeamComparisonCard } from '../components/TeamComparisonCard';
import { getCurrentPosition, haversineMeters } from '../../../shared/lib/geolocation';
import { useOfficeLocations } from '../../manager/hooks/useOfficeLocations';
import type { AttendanceRecord } from '../../../types/domain';
import {
  useAllAttendanceRange,
  useAllAttendanceToday,
  useAttendanceHistory,
  useAttendanceNotes,
  useAttendancePatternReason,
  useCoordinateFlagReason,
  useAttendanceReviews,
  useIssueAttendanceNote,
  useResetAllAttendance,
  useSignIn,
  useSignOut,
  useTodayAttendance,
} from '../hooks/useAttendance';
import { useAttendanceExceptions, useCreateAttendanceException, useDecideAttendanceException } from '../hooks/useAttendanceExceptions';
import { useAttendancePolicy } from '../../manager/hooks/useAttendancePolicy';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useAgentRoster } from '../../staff-report/hooks/useStaffReport';
import { useLeaveRequests } from '../../leave/hooks/useLeaveRequests';
import { useSessionStore } from '../../../auth/useSessionStore';
import { today as todayIso } from '../../../shared/lib/format';
import {
  computeAttendanceRoster,
  computeMonthStats,
  detectAttendancePatterns,
  detectSuspiciousCoordinates,
  isConfiguredWorkday,
  ROSTER_CATEGORIES,
  tallyRoster,
  type AttendancePatternSuggestion,
  type SuspiciousCoordinateSuggestion,
  type RosterEntry,
  type RosterCategory,
} from '../lib/attendanceRosterLogic';
import styles from './AttendanceTodayScreen.module.css';

function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// New 2026-09-10: the real cutoff a sign-in is checked against is now
// work start + grace period, once a real attendance_policy exists --
// wiring the policy admin screen's fields into an actual decision,
// rather than leaving them saved but unused. Falls back to the legacy
// flat Config.attendanceCutoffTime when no policy has been set yet
// (demo mode's fresh state, or a real install before its first save).
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Real geofence/cutoff check (Master Spec 11.1), ported from index.html's
// checkOffSite()/late-cutoff logic. Prefers the nearest active real
// `office_locations` row (each with its own radius) and falls back to the
// legacy flat Config.officeLat/officeLng single point only when no active
// office_locations exist -- the same precedence the server's own trigger
// uses (see below), now finally mirrored client-side instead of the
// client only ever checking the legacy single point.
//
// IMPORTANT 2026-09-10: this client-side result is UX only (it decides
// whether to show the "why are you off-site?" reason box before
// submitting, and which office to show on the map). It is NOT the
// authoritative value -- a real DB trigger (recompute_attendance_offsite(),
// fires on attendance_log insert/update) recomputes is_off_site_in/
// is_off_site_out server-side from the submitted coordinates against the
// live office_locations table, overriding whatever this function or the
// client claims. See project-attendance-v3-chapter01-gap memory --
// confirmed via a real rollback-wrapped INSERT that a client claiming the
// wrong value gets corrected by the server either direction.
interface OffSiteResolution {
  offSite: boolean;
  office: { name: string; lat: number; lng: number } | null;
  distance: number | null;
}

function resolveOffSite(
  lat: number | undefined,
  lng: number | undefined,
  officeLocations: { name: string; lat: number; lng: number; radiusMeters: number; isActive: boolean }[],
  legacyLat: number | null,
  legacyLng: number | null,
  legacyRadius: number
): OffSiteResolution {
  if (lat == null || lng == null) return { offSite: false, office: null, distance: null };
  const active = officeLocations.filter((o) => o.isActive);
  if (active.length > 0) {
    let best = active[0];
    let bestDist = haversineMeters(lat, lng, best.lat, best.lng);
    for (const o of active.slice(1)) {
      const d = haversineMeters(lat, lng, o.lat, o.lng);
      if (d < bestDist) {
        best = o;
        bestDist = d;
      }
    }
    return { offSite: bestDist > (best.radiusMeters || 150), office: { name: best.name, lat: best.lat, lng: best.lng }, distance: bestDist };
  }
  if (legacyLat != null && legacyLng != null) {
    const distance = haversineMeters(lat, lng, legacyLat, legacyLng);
    return { offSite: distance > (legacyRadius || 250), office: { name: 'the office', lat: legacyLat, lng: legacyLng }, distance };
  }
  return { offSite: false, office: null, distance: null };
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
//
// UPDATED 2026-09-10: the effective cutoff/work-days now prefer the real
// `attendance_policy` table (work start + grace period, see
// addMinutesToTime()) once a manager has saved one, falling back to the
// legacy flat Config fields otherwise -- this is what finally makes the
// policy admin screen's saved fields actually decide something, not just
// sit recorded. This client-side value is still UX-only, same as
// computeOffSite() -- the server-side off-site trigger is the real
// authority for that flag; late-ness has no stored boolean at all (see
// project-attendance-v3-chapter01-gap memory).
export function AttendanceTodayScreen() {
  const { data: today, isLoading } = useTodayAttendance();
  const { data: history } = useAttendanceHistory(31);
  const { data: config } = useConfig();
  const { data: policy } = useAttendancePolicy();
  const { data: allExceptions } = useAttendanceExceptions();
  const { data: officeLocations } = useOfficeLocations();
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const signIn = useSignIn();
  const signOut = useSignOut();

  // An approved pre-authorization for today suppresses the reactive
  // "why are you off-site?" prompt below -- Management already knew and
  // said yes ahead of time. This is UX only: the server's off-site
  // trigger still records the real geographic fact regardless, an
  // exception explains it rather than erasing it.
  const todaysApprovedException = (allExceptions ?? []).find((e) => e.staffKey === profile?.key && e.exceptionDate === todayIso() && e.status === 'approved');

  const cutoff = policy ? addMinutesToTime(policy.workStartTime, policy.graceMinutes) : (config?.attendanceCutoffTime ?? '09:00');
  const workDays = policy ? policy.workDays : (config?.workDays ?? [1, 2, 3, 4, 5]);
  // ATTENDANCE_BLUEPRINT.md §8 -- the on-site/off-site line in the detail
  // modal is only meaningful once an office to compare against actually
  // exists (matches v1's own guard against a meaningless tag).
  const hasOfficeConfigured = (officeLocations ?? []).some((o) => o.isActive) || (config?.officeLat != null && config?.officeLng != null);
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null);
  const { data: myLeaveRequests } = useLeaveRequests();
  const monthKey = todayIso().slice(0, 7);
  const monthStats = useMemo(
    () => computeMonthStats(history ?? [], myLeaveRequests ?? [], profile?.key ?? '', workDays, cutoff, monthKey, todayIso()),
    [history, myLeaveRequests, profile?.key, workDays, cutoff, monthKey]
  );

  // ATTENDANCE_BLUEPRINT.md §3 "Decision" -- sign-in/out is a real
  // sequential wizard now, one blocking Modal step at a time, matching the
  // 59-page spec's own numbered flow exactly (late check -> geolocate ->
  // off-site check -> photo -> submit) instead of the old single combined
  // form. `flow` tracks which action is in progress; `step` tracks which
  // modal (if any) is currently blocking; cancelling any step's Modal
  // (backdrop or ✕) aborts the whole thing via resetForm(), never a
  // partial submission.
  const [flow, setFlow] = useState<'in' | 'out' | null>(null);
  const [step, setStep] = useState<'lateReason' | 'offSiteReason' | 'photo' | 'reviewOut' | null>(null);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat?: number; lng?: number; accuracy?: number }>({});
  const [isLate, setIsLate] = useState(false);
  const [lateReason, setLateReason] = useState('');
  const [isOffSite, setIsOffSite] = useState(false);
  const [offSiteReason, setOffSiteReason] = useState('');
  const [matchedOffice, setMatchedOffice] = useState<{ name: string; lat: number; lng: number; distance: number } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  function resetForm() {
    setFlow(null);
    setStep(null);
    setCoords({});
    setIsLate(false);
    setLateReason('');
    setIsOffSite(false);
    setOffSiteReason('');
    setMatchedOffice(null);
    setPhoto(null);
  }

  // Shared step-3/4 tail for both sign-in and sign-out: geolocate, resolve
  // off-site against the real office_locations table, then either land on
  // `nextStepIfClear` directly or detour through the off-site-reason modal
  // first. A same-day approved exception (see OffSiteExceptionsCard) skips
  // the reactive prompt entirely -- Management already said yes.
  async function locate(nextStepIfClear: 'photo' | 'reviewOut') {
    setLocating(true);
    const pos = await getCurrentPosition();
    setCoords({ lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy });
    const { offSite, office, distance } = resolveOffSite(pos?.lat, pos?.lng, officeLocations ?? [], config?.officeLat ?? null, config?.officeLng ?? null, config?.officeRadiusMeters ?? 250);
    setLocating(false);
    setIsOffSite(offSite);
    setMatchedOffice(office && distance != null ? { ...office, distance } : null);
    if (offSite && todaysApprovedException) {
      setOffSiteReason(`Pre-approved ${EXCEPTION_TYPE_LABELS[todaysApprovedException.exceptionType].toLowerCase()}: ${todaysApprovedException.reason}`);
      setStep(nextStepIfClear);
    } else if (offSite) {
      setStep('offSiteReason');
    } else {
      setStep(nextStepIfClear);
    }
  }

  function beginSignIn() {
    setFlow('in');
    const late = nowHHMM() > cutoff;
    setIsLate(late);
    if (late) setStep('lateReason');
    else locate('photo');
  }

  function beginSignOut() {
    setFlow('out');
    locate('reviewOut');
  }

  function handleLateContinue(reason: string) {
    setLateReason(reason);
    locate('photo');
  }

  function handleOffSiteContinue(reason: string) {
    setOffSiteReason(reason);
    setStep(flow === 'in' ? 'photo' : 'reviewOut');
  }

  async function submitSignIn() {
    if (!photo) return;
    await signIn.mutateAsync({
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      deviceInfo: navigator.userAgent,
      offSite: isOffSite,
      reason: isOffSite ? offSiteReason.trim() : undefined,
      late: isLate,
      lateReason: isLate ? lateReason.trim() : undefined,
      photo,
    });
    resetForm();
  }

  async function submitSignOut() {
    if (!today) return;
    await signOut.mutateAsync({ id: today.id, input: { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy, offSite: isOffSite, reason: isOffSite ? offSiteReason.trim() : undefined } });
    resetForm();
  }

  const isPending = signIn.isPending || signOut.isPending;
  const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const nowDateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const clockPhase: 'in' | 'out' | 'done' = !today ? 'in' : !today.signOutAt ? 'out' : 'done';
  const circleLabel = clockPhase === 'in' ? 'Clock in' : clockPhase === 'out' ? 'Clock out' : 'Complete';
  const circleSub = clockPhase === 'in' ? nowDateLabel : clockPhase === 'out' ? `In at ${fmtTime(today?.signInAt ?? null)}` : `${fmtTime(today?.signInAt ?? null)} — ${fmtTime(today?.signOutAt ?? null)}`;

  function handleCircleClick() {
    if (clockPhase === 'done' || locating || flow) return;
    if (clockPhase === 'in') beginSignIn();
    else beginSignOut();
  }

  return (
    <div className={styles.wrap}>
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
      </div>

      {step === 'lateReason' && (
        <Modal title="Late sign-in" onClose={resetForm}>
          <PresetReasonPicker
            prompt={`You're signing in after ${cutoff} — please tell us why.`}
            options={['Traffic', 'Personal', 'Transport', 'Other']}
            continueLabel="Continue sign-in"
            onContinue={handleLateContinue}
          />
        </Modal>
      )}

      {step === 'offSiteReason' && (
        <Modal title="You appear to be off-site" onClose={resetForm}>
          <OfficeMapSnippet lat={coords.lat} lng={coords.lng} officeName={matchedOffice?.name} distanceMeters={matchedOffice?.distance} />
          <PresetReasonPicker
            prompt="You appear to be outside the office area. If you're working for the company elsewhere, tell us why."
            options={['Company errand', 'Client/site assignment', 'Working from home', 'Other']}
            continueLabel="Continue"
            onContinue={handleOffSiteContinue}
          />
        </Modal>
      )}

      {step === 'photo' && (
        <Modal title="Photo proof" onClose={resetForm}>
          {isOffSite && todaysApprovedException && <p className={styles.hint}>✓ {offSiteReason} — approved by {todaysApprovedException.decidedByName ?? 'Management'} ahead of time.</p>}
          {!photo && <p className={styles.hint}>Take a quick selfie to confirm it's really you signing in.</p>}
          <CameraCapture value={photo} onChange={setPhoto} label="Sign-in selfie" />
          <button type="button" className={styles.confirmBtn} onClick={submitSignIn} disabled={isPending || !photo}>
            {isPending ? 'Signing in…' : 'Confirm sign in'}
          </button>
        </Modal>
      )}

      {step === 'reviewOut' && (
        <Modal title="Confirm sign out" onClose={resetForm}>
          {isOffSite && (
            <p className={styles.hint}>
              {todaysApprovedException ? `✓ ${offSiteReason} — approved by ${todaysApprovedException.decidedByName ?? 'Management'} ahead of time.` : `Off-site: ${offSiteReason}`}
            </p>
          )}
          <button type="button" className={styles.confirmBtn} onClick={submitSignOut} disabled={isPending}>
            {isPending ? 'Signing out…' : 'Confirm sign out'}
          </button>
        </Modal>
      )}

      <MonthKpiCard stats={monthStats} />

      <AttendanceCalendar staffKey={profile?.key ?? ''} workDays={workDays} cutoff={cutoff} onSelectRecord={setDetailRecord} />

      {!isManager && <TeamComparisonCard staffKey={profile?.key ?? ''} monthKey={monthKey} cutoff={cutoff} />}

      {history && history.length > 0 && (
        <>
          <div className={styles.historyTitle}>Recent history</div>
          <div className={styles.historyCard}>
            {history.map((h) => {
              const onTime = !!h.signInAt && h.signInAt.slice(11, 16) <= cutoff;
              const weekday = new Date(h.workDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
              const dayNum = new Date(h.workDate + 'T00:00:00').getDate();
              return (
                <button type="button" className={styles.row} key={h.id} onClick={() => setDetailRecord(h)}>
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
                </button>
              );
            })}
          </div>
        </>
      )}

      <OffSiteExceptionsCard />

      {isManager && <ManagementAttendanceDashboard cutoff={cutoff} workDays={workDays} onSelectRecord={setDetailRecord} />}

      {detailRecord && <AttendanceDetailModal record={detailRecord} isManager={isManager} hasOfficeConfigured={hasOfficeConfigured} onClose={() => setDetailRecord(null)} />}
    </div>
  );
}

const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  errand: 'Errand',
  site_visit: 'Site visit',
  field_assignment: 'Field assignment',
  other: 'Other',
};

// New 2026-09-10, V3 chapter-01 gap: a pre-authorized off-site request,
// decided by Management ahead of time -- distinct from the reactive
// "why are you off-site?" box on the sign-in form itself, which only
// ever fires after the fact. Not yet wired into computeOffSite() at
// sign-in time (an approved exception for today doesn't currently
// suppress that prompt) -- see project-attendance-v3-chapter01-gap
// memory for that and the rest of the still-open list.
function OffSiteExceptionsCard() {
  const profile = useSessionStore((s) => s.profile);
  const { data: allExceptions } = useAttendanceExceptions();
  const create = useCreateAttendanceException();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [type, setType] = useState<'errand' | 'site_visit' | 'field_assignment' | 'other'>('errand');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mine = (allExceptions ?? []).filter((e) => e.staffKey === profile?.key);

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    try {
      await create.mutateAsync({ exceptionDate: date, exceptionType: type, reason: reason.trim() });
      setReason('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit that request');
    }
  }

  return (
    <div className={styles.exceptionCard}>
      <div className={styles.exceptionHead}>
        Off-site requests
        <button type="button" className={styles.exceptionNewBtn} onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : '+ New request'}
        </button>
      </div>

      {open && (
        <div className={styles.exceptionForm}>
          <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select className={styles.input} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {Object.entries(EXCEPTION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input className={styles.input} placeholder="Reason -- what's taking you off-site" value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <p className={styles.hint}>{error}</p>}
          <button type="button" className={styles.confirmBtn} disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      )}

      {mine.length === 0 && !open && <p className={styles.hint}>Planning to work off-site? Request it ahead of time so Management already knows.</p>}
      {mine.map((e) => (
        <div className={styles.exceptionRow} key={e.id}>
          <div className={styles.rowMain}>
            <div className={styles.rowTimes}>
              {e.exceptionDate} &middot; {EXCEPTION_TYPE_LABELS[e.exceptionType]}
            </div>
            <div className={styles.exceptionReason}>{e.reason}</div>
          </div>
          <span className={`${styles.exceptionTag} ${styles[`exceptionTag_${e.status}`]}`}>{e.status}</span>
        </div>
      ))}
    </div>
  );
}

// Master Spec 11.3's Management dashboard, folded into the same screen
// rather than a separate route -- there's no other "Attendance" screen for
// it to live under, and a manager still clocks in/out themselves above.
// Roster is `useAgentRoster()` (active agents only, role==='agent') --
// same active-only staff-report scope already used for Staff Report's own
// comparisons; Management isn't itself part of the roster being tallied.
function ManagementAttendanceDashboard({ cutoff, workDays, onSelectRecord }: { cutoff: string; workDays: number[]; onSelectRecord: (r: AttendanceRecord) => void }) {
  const { data: attendanceToday } = useAllAttendanceToday();
  const { data: attendanceRange } = useAllAttendanceRange(21);
  const { data: roster } = useAgentRoster();
  const { data: leaveRequests } = useLeaveRequests();
  const { data: attendanceNotes } = useAttendanceNotes();
  const workDate = todayIso();
  const isWorkday = isConfiguredWorkday(workDate, workDays);

  const entries = useMemo(
    () => computeAttendanceRoster(roster ?? [], attendanceToday ?? [], leaveRequests ?? [], cutoff, workDate, nowHHMM()),
    [roster, attendanceToday, leaveRequests, cutoff, workDate]
  );
  const tally = useMemo(() => tallyRoster(entries), [entries]);
  // AI Suggestions -- user correction 2026-09-07, verbatim: "management
  // doesnt have the time to be clicking buttons to be warning or praizing
  // staffs for their attendance... create an ai powered intelligent
  // system." The verdict is real, deterministic pattern detection (see
  // attendanceRosterLogic.ts's header comment on why an LLM never decides
  // this); only the reason text is AI-drafted, one tap to send.
  const suggestions = useMemo(
    () => detectAttendancePatterns(roster ?? [], attendanceRange ?? [], leaveRequests ?? [], attendanceNotes ?? [], workDays, cutoff, workDate),
    [roster, attendanceRange, leaveRequests, attendanceNotes, workDays, cutoff, workDate]
  );
  // V3 chapter-01's 4th named AI capability: "detect repeated patterns
  // such as ... suspiciously identical coordinates" -- see
  // detectSuspiciousCoordinates()'s own comment in attendanceRosterLogic.ts
  // for why an exact-repeat GPS reading is itself the anomaly.
  const coordinateFlags = useMemo(() => detectSuspiciousCoordinates(roster ?? [], attendanceRange ?? [], workDate), [roster, attendanceRange, workDate]);

  return (
    <>
      <div className={styles.mgrTitleRow}>
        <div className={styles.mgrTitle}>Management dashboard</div>
      </div>

      <PendingExceptionsQueue />

      <OffSiteReviewQueue attendanceRange={attendanceRange ?? []} onSelectRecord={onSelectRecord} />

      {!isWorkday ? (
        <p className={styles.hint}>Today isn't a scheduled work day (see Settings &gt; Work days) -- nobody is expected to sign in.</p>
      ) : (
        <>
          <div className={styles.tallyGrid}>
            {ROSTER_CATEGORIES.map((c) => (
              <div key={c.key} className={`${styles.tallyTile} ${styles[`tally_${c.key}`]}`}>
                <div className={styles.tallyCount}>{tally[c.key]}</div>
                <div className={styles.tallyLabel}>{c.label}</div>
              </div>
            ))}
          </div>

          {suggestions.length > 0 && (
            <>
              <div className={styles.mgrSubTitle}>AI suggestions</div>
              <div className={styles.suggestionList}>
                {suggestions.map((s) => (
                  <SuggestionCard key={`${s.staffKey}_${s.kind}`} suggestion={s} />
                ))}
              </div>
            </>
          )}

          {coordinateFlags.length > 0 && (
            <>
              <div className={styles.mgrSubTitle}>Suspicious coordinates</div>
              <div className={styles.suggestionList}>
                {coordinateFlags.map((f) => (
                  <CoordinateFlagCard key={`${f.staffKey}_${f.lat}_${f.lng}`} flag={f} />
                ))}
              </div>
            </>
          )}

          {!roster && <p className={styles.hint}>Loading roster…</p>}
          {roster && roster.length === 0 && <p className={styles.hint}>No active staff on the roster.</p>}
          <div className={styles.rosterList}>
            {entries.map((e) => (
              <RosterRow key={e.staffKey} entry={e} onSelectRecord={onSelectRecord} />
            ))}
          </div>
        </>
      )}

      <ResetAttendanceDangerZone />
    </>
  );
}

// ATTENDANCE_BLUEPRINT.md §9. Two sequential confirm() dialogs, exact v1
// pattern for this specific company-wide destructive action -- a real,
// considered double-check, not excessive caution to remove.
function ResetAttendanceDangerZone() {
  const reset = useResetAllAttendance();

  async function handleReset() {
    if (!confirm("Clear every sign-in/out record for every staff member so days-present/absent counts start at zero. Only affects attendance -- no other app or data is touched. This can't be undone.")) return;
    if (!confirm('Are you absolutely sure? This will permanently delete ALL attendance history for everyone.')) return;
    await reset.mutateAsync();
  }

  return (
    <div className={styles.dangerZone}>
      <p className={styles.dangerTitle}>Reset attendance data</p>
      <p className={styles.dangerHint}>Clears every sign-in/out record for every staff member so days-present/absent counts start at zero. Only affects attendance — no other app or data is touched. This can't be undone.</p>
      <button type="button" className={styles.dangerBtn} onClick={handleReset} disabled={reset.isPending}>
        {reset.isPending ? 'Resetting…' : 'Reset attendance data'}
      </button>
    </div>
  );
}

// New 2026-09-10, V3 chapter-01 gap: the approval half of the staff-facing
// OffSiteExceptionsCard above. Shown regardless of whether today happens
// to be a scheduled work day -- a request can be for any future date.
function PendingExceptionsQueue() {
  const { data: allExceptions } = useAttendanceExceptions();
  const decide = useDecideAttendanceException();
  const pending = (allExceptions ?? []).filter((e) => e.status === 'pending');

  if (pending.length === 0) return null;

  return (
    <>
      <div className={styles.mgrSubTitle}>Pending exception requests</div>
      <div className={styles.suggestionList}>
        {pending.map((e) => (
          <div className={styles.suggestionCard} key={e.id}>
            <div className={styles.suggestionHead}>
              <span className={styles.suggestionIcon}>📍</span>
              <div>
                <div className={styles.suggestionName}>
                  {e.staffName} &middot; {e.exceptionDate}
                </div>
                <div className={styles.suggestionDetail}>
                  {EXCEPTION_TYPE_LABELS[e.exceptionType]}: {e.reason}
                </div>
              </div>
            </div>
            <div className={styles.rosterActions}>
              <button type="button" className={styles.praiseBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: e.id, status: 'approved' })}>
                Approve
              </button>
              <button type="button" className={styles.warningBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: e.id, status: 'declined' })}>
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ATTENDANCE_BLUEPRINT.md §13 -- lists every off-site record from the
// trailing window with no linked review yet, so Management doesn't have
// to remember to check each one individually. The actual authorize/flag
// decision happens in the per-record detail modal (§8), not here -- each
// row is a button that opens it.
function OffSiteReviewQueue({ attendanceRange, onSelectRecord }: { attendanceRange: AttendanceRecord[]; onSelectRecord: (r: AttendanceRecord) => void }) {
  const { data: reviews } = useAttendanceReviews();
  const reviewedIds = new Set((reviews ?? []).map((r) => r.attendanceLogId));
  const awaiting = attendanceRange.filter((a) => (a.isOffSiteIn || a.isOffSiteOut) && !reviewedIds.has(a.id));

  if (awaiting.length === 0) return null;

  return (
    <>
      <div className={styles.mgrSubTitle}>Off-site records awaiting review</div>
      <div className={styles.suggestionList}>
        {awaiting.map((a) => (
          <button type="button" className={`${styles.suggestionCard} ${styles.suggestionCardBtn}`} key={a.id} onClick={() => onSelectRecord(a)}>
            <div className={styles.suggestionHead}>
              <span className={styles.suggestionIcon}>📍</span>
              <div>
                <div className={styles.suggestionName}>
                  {a.staffName} &middot; {a.workDate}
                </div>
                <div className={styles.suggestionDetail}>{a.isOffSiteIn ? (a.signInReason ?? 'Off-site sign-in') : (a.signOutReason ?? 'Off-site sign-out')}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AttendancePatternSuggestion }) {
  const { data: aiReason, isLoading } = useAttendancePatternReason(suggestion);
  const issueNote = useIssueAttendanceNote();
  const [reason, setReason] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);

  const effectiveReason = reason || aiReason || '';
  const detail =
    suggestion.kind === 'warning'
      ? `${suggestion.lateCount} late, ${suggestion.absentCount} absent in the last ${suggestion.windowDays} work day(s)`
      : `Perfect on-time attendance over the last ${suggestion.windowDays} work day(s)`;

  async function send() {
    if (!effectiveReason.trim()) return;
    await issueNote.mutateAsync({ staffKey: suggestion.staffKey, staffName: suggestion.staffName, kind: suggestion.kind, reason: effectiveReason.trim(), workDate: todayIso() });
    setSent(true);
  }

  if (dismissed || sent) return null;

  return (
    <div className={`${styles.suggestionCard} ${suggestion.kind === 'warning' ? styles.suggestionWarning : styles.suggestionPraise}`}>
      <div className={styles.suggestionHead}>
        <span className={styles.suggestionIcon}>{suggestion.kind === 'warning' ? '⚠' : '👍'}</span>
        <div>
          <div className={styles.suggestionName}>{suggestion.staffName}</div>
          <div className={styles.suggestionDetail}>{detail}</div>
        </div>
      </div>
      <textarea
        className={styles.reasonInput}
        placeholder={isLoading ? 'Drafting a reason…' : 'Reason'}
        value={effectiveReason}
        onChange={(e) => setReason(e.target.value)}
        disabled={isLoading}
        rows={2}
      />
      <div className={styles.rosterActions}>
        <button type="button" className={suggestion.kind === 'praise' ? styles.praiseBtn : styles.warningBtn} disabled={issueNote.isPending || isLoading || !effectiveReason.trim()} onClick={send}>
          {issueNote.isPending ? 'Sending…' : `Send ${suggestion.kind}`}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Informational only -- there's no "send" action here (unlike
// SuggestionCard's Praise/Warning), this is Management's own manual
// investigation to make, the AI only drafts the flag sentence explaining
// WHY it's worth a look. Dismiss is session-local, same as
// SuggestionCard's own Dismiss.
function CoordinateFlagCard({ flag }: { flag: SuspiciousCoordinateSuggestion }) {
  const { data: aiReason, isLoading } = useCoordinateFlagReason(flag);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className={`${styles.suggestionCard} ${styles.suggestionWarning}`}>
      <div className={styles.suggestionHead}>
        <span className={styles.suggestionIcon}>📍</span>
        <div>
          <div className={styles.suggestionName}>{flag.staffName}</div>
          <div className={styles.suggestionDetail}>
            {isLoading ? 'Checking…' : (aiReason ?? `Same exact sign-in location on ${flag.matchedDates.length} different days in the last two weeks.`)}
          </div>
        </div>
      </div>
      <div className={styles.rosterActions}>
        <button type="button" className={styles.cancelBtn} onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

const CATEGORY_LABEL: Record<RosterCategory, string> = Object.fromEntries(ROSTER_CATEGORIES.map((c) => [c.key, c.label])) as Record<RosterCategory, string>;

function RosterRow({ entry, onSelectRecord }: { entry: RosterEntry; onSelectRecord: (r: AttendanceRecord) => void }) {
  const issueNote = useIssueAttendanceNote();
  const [acting, setActing] = useState<'praise' | 'warning' | null>(null);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState<'praise' | 'warning' | null>(null);

  async function submit() {
    if (!acting || !reason.trim()) return;
    await issueNote.mutateAsync({ staffKey: entry.staffKey, staffName: entry.staffName, kind: acting, reason: reason.trim(), workDate: entry.record?.workDate ?? todayIso() });
    setSent(acting);
    setActing(null);
    setReason('');
  }

  return (
    <div className={styles.rosterRow}>
      <div className={styles.rosterTop}>
        <Avatar name={entry.staffName} size={32} />
        <div className={styles.rosterMain}>
          <div className={styles.rosterName}>{entry.staffName}</div>
          <div className={styles.rosterDetail}>{entry.detail}</div>
        </div>
        <span className={`${styles.rosterTag} ${styles[`tag_${entry.category}`]}`}>{CATEGORY_LABEL[entry.category]}</span>
      </div>

      {acting ? (
        <div className={styles.rosterActionForm}>
          <textarea
            className={styles.reasonInput}
            placeholder={acting === 'praise' ? 'What did they do well?' : 'Reason for this warning'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <div className={styles.rosterActions}>
            <button type="button" className={acting === 'praise' ? styles.praiseBtn : styles.warningBtn} disabled={issueNote.isPending || !reason.trim()} onClick={submit}>
              {issueNote.isPending ? 'Sending…' : `Confirm ${acting}`}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setActing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.rosterActions}>
          <button type="button" className={styles.praiseBtn} onClick={() => setActing('praise')}>
            👍 Praise
          </button>
          <button type="button" className={styles.warningBtn} onClick={() => setActing('warning')}>
            ⚠ Warning
          </button>
          {entry.record && (
            <button type="button" className={styles.cancelBtn} onClick={() => onSelectRecord(entry.record!)}>
              Details
            </button>
          )}
          {sent && <span className={styles.sentTag}>{sent === 'praise' ? 'Praise sent' : 'Warning sent'}</span>}
        </div>
      )}
    </div>
  );
}
