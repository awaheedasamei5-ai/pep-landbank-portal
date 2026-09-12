"use client";

import { useState } from 'react';
import { ghs } from '../../../shared/lib/format';
import type { SiteVisit, WeeklyVisitForm } from '../../../types/domain';
import { accompaniedText, allowedDayIsos, COST_ROWS, costTotal, currentWeekStartIso, fmtLongDate, weekRangeLabel } from '../lib/siteVisitAuthLogic';
import { useCanViewSiteVisitAuth, useFinalizeWeeklyVisitForm, useSaveWeeklyVisitCosts, useWeeklyVisitForm, useWeekSiteVisits } from '../hooks/useSiteVisitAuth';
import { useCancelSiteVisit, useRescheduleSiteVisit } from '../../site-visits/hooks/useSiteVisits';
import { useDownloadSiteVisitAuthPdf } from '../hooks/useSiteVisitAuthPdf';
import { useSessionStore } from '../../../auth/useSessionStore';
import { friendlyError } from '../../../shared/lib/friendlyError';
import styles from './SiteVisitAuthScreen.module.css';

// Real user ask (2026-09-11): "note that u havent copied(duplicate) the
// banner app from v1 and paste and merge into this version, same as
// site visit authorization." Literal port of web-next's own
// SiteVisitAuthScreen.tsx -- the real "weekly_visit_forms" table's own
// UI (Site Visit Authorization's Logistics half; the other half, Site
// Visit Experience, already shipped as SveManagementScreen). One form
// per (week, day), created on demand, matching v1's own
// apiLoadOrCreateWeeklyVisitForm exactly. Same one real adaptation as
// Banner Tracking's own port: web-next's "← Back" button (to its own
// /app/office hub, which doesn't exist here) is dropped -- this is now
// a direct top-level sidebar link like every other app in this shell.
export function SiteVisitAuthScreen() {
  const canView = useCanViewSiteVisitAuth();
  const profile = useSessionStore((s) => s.profile);
  const [weekStart, setWeekStart] = useState(currentWeekStartIso());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const days = allowedDayIsos(weekStart);
  const { data: weekVisits } = useWeekSiteVisits(weekStart);
  const activeDay = selectedDay && days.includes(selectedDay) ? selectedDay : days.find((d) => (weekVisits ?? []).some((v) => v.visitDate === d)) ?? days[0] ?? weekStart;

  const { data: form, isLoading: formLoading } = useWeeklyVisitForm(weekStart, activeDay);
  const visits = (weekVisits ?? []).filter((v) => v.visitDate === activeDay);

  if (!canView) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Site Visit Authorization</h1>
        <p className={styles.sub}>Restricted to Management, Elias, Emmanuel and Elizabeth.</p>
      </div>
    );
  }

  function shiftWeek(deltaDays: number) {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    setWeekStart(d.toISOString().slice(0, 10));
    setSelectedDay(null);
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Site Visit Authorization</h1>
      <p className={styles.sub}>Pick a day, estimate and reconcile that day&apos;s site-visit costs, then get Management&apos;s approval.</p>

      <div className={styles.weekCard}>
        <div className={styles.weekTop}>
          <div className={styles.weekNav}>
            <button type="button" className={styles.navBtn} onClick={() => shiftWeek(-7)} aria-label="Previous week">
              ‹
            </button>
            <div>
              <div className={styles.weekLabel}>{weekRangeLabel(weekStart)}</div>
              <div className={styles.weekSub}>Week of {weekStart}</div>
            </div>
            <button type="button" className={styles.navBtn} onClick={() => shiftWeek(7)} aria-label="Next week">
              ›
            </button>
          </div>
          {form && <span className={`${styles.statusTag} ${form.status === 'Finalized' ? styles.statusOk : styles.statusWarn}`}>{form.status}</span>}
        </div>
        <div className={styles.dayRow}>
          {days.map((iso) => {
            const count = (weekVisits ?? []).filter((v) => v.visitDate === iso).length;
            const label = new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
            const dayNum = new Date(`${iso}T00:00:00`).getDate();
            return (
              <button key={iso} type="button" className={`${styles.dayChip} ${iso === activeDay ? styles.dayChipOn : ''}`} onClick={() => setSelectedDay(iso)}>
                {label} {dayNum}
                {count ? ` · ${count}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {formLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {form && <FormBody form={form} visits={visits} activeDay={activeDay} isManager={profile?.role === 'manager'} />}
    </div>
  );
}

function FormBody({ form, visits, activeDay, isManager }: { form: WeeklyVisitForm; visits: SiteVisit[]; activeDay: string; isManager: boolean }) {
  const saveCosts = useSaveWeeklyVisitCosts();
  const finalize = useFinalizeWeeklyVisitForm();
  const downloadPdf = useDownloadSiteVisitAuthPdf();
  const costsEditable = form.status !== 'Finalized';

  const [siteManagerName, setSiteManagerName] = useState(form.siteManagerName ?? '');
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(COST_ROWS.flatMap((r) => [[r.estKey, String(form[r.estKey] ?? 0)], [r.actKey, String(form[r.actKey] ?? 0)]])));
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftForm: WeeklyVisitForm = { ...form, ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v) || 0])) };
  const totalEst = costTotal(draftForm, 'Est');
  const totalAct = costTotal(draftForm, 'Act');

  async function save() {
    setError(null);
    const patch: Record<string, number | string | null> = { siteManagerName: siteManagerName.trim() || null };
    COST_ROWS.forEach((r) => {
      patch[r.estKey] = Number(values[r.estKey]) || 0;
      patch[r.actKey] = Number(values[r.actKey]) || 0;
    });
    try {
      await saveCosts.mutateAsync({ id: form.id, patch });
    } catch (e) {
      setError(friendlyError(e, 'Failed to save'));
    }
  }

  return (
    <>
      <div className={styles.sectitle}>
        Authorization form — Tsopoli site visit
        <span className={styles.sectitleCnt}>
          {fmtLongDate(activeDay)} · {visits.length} visit{visits.length === 1 ? '' : 's'}
        </span>
      </div>
      <button type="button" className={styles.pdfDownloadBtn} disabled={downloadPdf.isPending} onClick={() => downloadPdf.mutate({ form, visits })}>
        {downloadPdf.isPending ? 'Preparing PDF…' : '⬇ Download authorization form (PDF)'}
      </button>

      <div className={styles.smCard}>
        <label className={styles.label}>Site manager in charge</label>
        <input className={styles.input} placeholder="e.g. Abdul Waheed" value={siteManagerName} onChange={(e) => setSiteManagerName(e.target.value)} disabled={!costsEditable} />
      </div>

      <div className={styles.visitList}>
        {visits.length === 0 && <p className={styles.emptyMsg}>No site visits logged for this day yet.</p>}
        {visits.map((v) => (
          <VisitCard key={v.id} visit={v} canCancel={costsEditable} />
        ))}
      </div>

      <div className={styles.sectitle}>Cost breakdown</div>
      <div className={styles.costCard}>
        <div className={styles.costColTitle}>Estimated Cost</div>
        {COST_ROWS.map((r) => (
          <div className={styles.costRow} key={r.estKey}>
            <span className={styles.costLabel}>{r.estLabel}</span>
            <input
              className={styles.costInput}
              type="number"
              min="0"
              step="0.01"
              value={values[r.estKey]}
              disabled={!costsEditable}
              onChange={(e) => setValues((v) => ({ ...v, [r.estKey]: e.target.value }))}
            />
          </div>
        ))}
        <div className={styles.costTotalRow}>
          <span>TOTAL COST GHS</span>
          <span>{ghs(totalEst)}</span>
        </div>

        <div className={styles.costColTitle} style={{ marginTop: 16 }}>
          Actual Expenses
        </div>
        {COST_ROWS.map((r) => (
          <div className={styles.costRow} key={r.actKey}>
            <span className={styles.costLabel}>{r.actLabel}</span>
            <input
              className={styles.costInput}
              type="number"
              min="0"
              step="0.01"
              value={values[r.actKey]}
              disabled={!costsEditable}
              onChange={(e) => setValues((v) => ({ ...v, [r.actKey]: e.target.value }))}
            />
          </div>
        ))}
        <div className={styles.costTotalRow}>
          <span>TOTAL COST GHS</span>
          <span>{ghs(totalAct)}</span>
        </div>
      </div>

      {form.status === 'Finalized' && (
        <div className={styles.approvedCard}>
          <div className={styles.sectitle} style={{ margin: 0 }}>
            Approved
          </div>
          <div className={styles.approvedRow}>
            <div>
              <div className={styles.fieldHint}>Approved by</div>
              <div className={styles.approvedName}>{form.approvedByName}</div>
              <div className={styles.fieldHint}>{(form.finalizedAt ?? '').slice(0, 16).replace('T', ' ')}</div>
            </div>
            {form.approvedSignature && <img src={form.approvedSignature} alt="Signature" className={styles.signatureImg} />}
          </div>
        </div>
      )}

      {error && <p className={styles.errorMsg}>{error}</p>}

      <div className={styles.actionsCol}>
        {costsEditable && (
          <button type="button" className={styles.saveBtn} disabled={saveCosts.isPending} onClick={save}>
            {saveCosts.isPending ? 'Saving…' : 'Save cost estimate'}
          </button>
        )}
        {form.status === 'Open' && isManager && !confirmingFinalize && (
          <button type="button" className={styles.finalizeBtn} onClick={() => setConfirmingFinalize(true)}>
            Finalize &amp; approve
          </button>
        )}
        {confirmingFinalize && (
          <div className={styles.confirmBox}>
            <p className={styles.fieldHint}>Finalize and approve this day&apos;s site visit costs? This locks the form and stamps your signature.</p>
            <div className={styles.confirmRow}>
              <button type="button" className={styles.cancelBtn} onClick={() => setConfirmingFinalize(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.finalizeBtn}
                style={{ flex: 1 }}
                disabled={finalize.isPending}
                onClick={() => finalize.mutateAsync(form.id).then(() => setConfirmingFinalize(false))}
              >
                {finalize.isPending ? 'Approving…' : 'Yes, finalize'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Master Spec 9.4: "Delete icon must work. Deletion requires confirmation
// and reason; it archives/cancels the visit and preserves audit history."
// Gated by the same costsEditable a day's cost inputs already respect --
// once a day's form is Finalized, its visit list is part of the approved
// record and shouldn't change underneath it.
type VisitCardMode = 'none' | 'menu' | 'cancel' | 'reschedule';

// Real user ask (2026-09-12): clicking the delete icon on a lead in the
// weekly authorization list should offer a choice -- "Remove from list
// completely" (the existing reason-required soft cancel) or
// "Reschedule" (pick a new date, the visit moves there and is tagged
// Rescheduled). Both close over the same visit; reschedule additionally
// surfaces the previous date so a reviewer can see what changed.
function VisitCard({ visit, canCancel }: { visit: SiteVisit; canCancel: boolean }) {
  const cancelVisit = useCancelSiteVisit();
  const rescheduleVisit = useRescheduleSiteVisit();
  const [mode, setMode] = useState<VisitCardMode>('none');
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState(visit.visitDate);
  const [newTime, setNewTime] = useState(visit.visitTime ?? '');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode('none');
    setReason('');
    setNewDate(visit.visitDate);
    setNewTime(visit.visitTime ?? '');
    setError(null);
  }

  async function confirmCancel() {
    setError(null);
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    try {
      await cancelVisit.mutateAsync({ id: visit.id, reason: reason.trim() });
    } catch (e) {
      setError(friendlyError(e, 'Failed to cancel this visit'));
    }
  }

  async function confirmReschedule() {
    setError(null);
    if (!newDate) {
      setError('Pick the new date.');
      return;
    }
    try {
      await rescheduleVisit.mutateAsync({ id: visit.id, newDate, newTime: newTime.trim() || null });
      reset();
    } catch (e) {
      setError(friendlyError(e, 'Failed to reschedule this visit'));
    }
  }

  return (
    <div className={styles.visitCard}>
      <div className={styles.visitTop}>
        <div className={styles.visitName}>{visit.name}</div>
        {canCancel && mode === 'none' && (
          <button type="button" className={styles.visitCancelIcon} title="Remove or reschedule this visit" aria-label={`Remove or reschedule visit for ${visit.name}`} onClick={() => setMode('menu')}>
            ✕
          </button>
        )}
      </div>
      <div className={styles.visitMeta}>
        {visit.contact} · {accompaniedText(visit.people, visit.accompanied)} accompanied
      </div>
      {visit.purpose && <div className={styles.visitField}>Purpose: {visit.purpose}</div>}
      {visit.pickup && <div className={styles.visitField}>Pick-up: {visit.pickup}</div>}
      {visit.transport && <div className={styles.visitField}>Transport: {visit.transport}</div>}
      {visit.feedbackAfter && <div className={styles.visitField}>Feedback: {visit.feedbackAfter}</div>}
      <div className={styles.visitField}>Staff: {visit.agentName}</div>
      {visit.status === 'Rescheduled' && visit.previousVisitDate && (
        <span className={styles.rescheduleTag}>Rescheduled from {visit.previousVisitDate}</span>
      )}

      {mode === 'menu' && (
        <div className={styles.cancelBox}>
          <div className={styles.menuBox}>
            <button type="button" className={styles.menuOption} onClick={() => setMode('reschedule')}>
              📅 Reschedule to another day
            </button>
            <button type="button" className={`${styles.menuOption} ${styles.menuOptionDanger}`} onClick={() => setMode('cancel')}>
              ✕ Remove from list completely
            </button>
            <button type="button" className={styles.cancelBtn} onClick={reset}>
              Back
            </button>
          </div>
        </div>
      )}

      {mode === 'cancel' && (
        <div className={styles.cancelBox}>
          <label className={styles.fieldHint}>Reason for cancelling (required)</label>
          <input className={styles.input} placeholder="e.g. Client no longer coming" value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.confirmRow}>
            <button type="button" className={styles.cancelBtn} onClick={reset}>
              Back
            </button>
            <button type="button" className={styles.visitCancelConfirmBtn} disabled={cancelVisit.isPending} onClick={confirmCancel}>
              {cancelVisit.isPending ? 'Cancelling…' : 'Yes, cancel visit'}
            </button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className={styles.cancelBox}>
          <label className={styles.fieldHint}>New date</label>
          <input className={styles.input} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <label className={styles.fieldHint} style={{ marginTop: 8, display: 'block' }}>
            New time (optional)
          </label>
          <input className={styles.input} type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.confirmRow}>
            <button type="button" className={styles.cancelBtn} onClick={reset}>
              Back
            </button>
            <button type="button" className={styles.finalizeBtn} style={{ flex: 1 }} disabled={rescheduleVisit.isPending} onClick={confirmReschedule}>
              {rescheduleVisit.isPending ? 'Rescheduling…' : 'Move this visit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
