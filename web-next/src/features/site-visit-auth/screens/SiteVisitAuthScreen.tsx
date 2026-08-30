import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import type { SiteVisit, WeeklyVisitForm } from '../../../types/domain';
import { accompaniedText, allowedDayIsos, COST_ROWS, costTotal, currentWeekStartIso, fmtLongDate, weekRangeLabel } from '../lib/siteVisitAuthLogic';
import { useCanViewSiteVisitAuth, useFinalizeWeeklyVisitForm, useSaveWeeklyVisitCosts, useWeeklyVisitForm, useWeekSiteVisits } from '../hooks/useSiteVisitAuth';
import { useSessionStore } from '../../../auth/useSessionStore';
import styles from './SiteVisitAuthScreen.module.css';

// Real table `weekly_visit_forms` -- Site Visit Authorization's Logistics
// half (the other half, Site Visit Experience, already shipped as
// SveManagementScreen). See the WeeklyVisitForm type's comment in
// types/domain.ts for exactly what's deliberately deferred (PDF download,
// "remove a visit from this form"). One form per (week, day), created on
// demand -- matches index.html's apiLoadOrCreateWeeklyVisitForm exactly.
export function SiteVisitAuthScreen() {
  const navigate = useNavigate();
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
        <button type="button" className={styles.backBtn} onClick={() => navigate('/app/office')}>
          ← Back
        </button>
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
      <button type="button" className={styles.backBtn} onClick={() => navigate('/app/office')}>
        ← Back
      </button>
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
      {form && (
        <FormBody form={form} visits={visits} activeDay={activeDay} isManager={profile?.role === 'manager'} />
      )}
    </div>
  );
}

function FormBody({ form, visits, activeDay, isManager }: { form: WeeklyVisitForm; visits: SiteVisit[]; activeDay: string; isManager: boolean }) {
  const saveCosts = useSaveWeeklyVisitCosts();
  const finalize = useFinalizeWeeklyVisitForm();
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
      setError(e instanceof Error ? e.message : 'Failed to save');
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

      <div className={styles.smCard}>
        <label className={styles.label}>Site manager in charge</label>
        <input className={styles.input} placeholder="e.g. Abdul Waheed" value={siteManagerName} onChange={(e) => setSiteManagerName(e.target.value)} disabled={!costsEditable} />
      </div>

      <div className={styles.visitList}>
        {visits.length === 0 && <p className={styles.emptyMsg}>No site visits logged for this day yet.</p>}
        {visits.map((v) => (
          <div className={styles.visitCard} key={v.id}>
            <div className={styles.visitName}>{v.name}</div>
            <div className={styles.visitMeta}>
              {v.contact} · {accompaniedText(v.people, v.accompanied)} accompanied
            </div>
            {v.purpose && <div className={styles.visitField}>Purpose: {v.purpose}</div>}
            {v.pickup && <div className={styles.visitField}>Pick-up: {v.pickup}</div>}
            {v.transport && <div className={styles.visitField}>Transport: {v.transport}</div>}
            {v.feedbackAfter && <div className={styles.visitField}>Feedback: {v.feedbackAfter}</div>}
            <div className={styles.visitField}>Staff: {v.agentName}</div>
          </div>
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
