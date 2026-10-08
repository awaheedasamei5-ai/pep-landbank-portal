"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useConfig, useUpdateConfig } from '../../manager/hooks/useConfigSettings';
import { useCreateLeaveHoliday, useLeaveHolidays, useRemoveLeaveHoliday } from '../hooks/useLeaveHolidays';
import type { EidWindow } from '../../../types/domain';
import styles from './LeaveManagementSettingsScreen.module.css';

// Real in-app settings for Leave -- quota, Eid windows, and ad-hoc company
// closures all live here, not in a separate global Settings app (standing
// rule). leaveTotalDays and eidWindows are both already real, already-
// wired config.update() fields read by leaveLogic.ts everywhere; this is
// the first UI that can actually edit them. leave_holidays is the new
// Phase 1 table for one-off closures outside the fixed Ghana calendar,
// merged into the same holiday map everywhere via companyClosuresForYear().
export function LeaveManagementSettingsScreen() {
  const { data: config } = useConfig();
  const updateConfig = useUpdateConfig();
  const { data: closures } = useLeaveHolidays();
  const createClosure = useCreateLeaveHoliday();
  const removeClosure = useRemoveLeaveHoliday();

  const [quotaDraft, setQuotaDraft] = useState<number | null>(null);
  const [windowForm, setWindowForm] = useState({ name: '', centerDate: '', daysBefore: 1, daysAfter: 1 });
  const [closureForm, setClosureForm] = useState({ date: '', name: '' });

  const quota = quotaDraft ?? config?.leaveTotalDays ?? 20;

  function saveQuota() {
    if (quotaDraft === null || quotaDraft === config?.leaveTotalDays) return;
    updateConfig.mutate({ leaveTotalDays: quotaDraft });
  }

  function addWindow() {
    if (!config || !windowForm.name.trim() || !windowForm.centerDate) return;
    const next: EidWindow[] = [
      ...config.eidWindows,
      { id: crypto.randomUUID(), name: windowForm.name.trim(), centerDate: windowForm.centerDate, daysBefore: windowForm.daysBefore, daysAfter: windowForm.daysAfter },
    ];
    updateConfig.mutate({ eidWindows: next });
    setWindowForm({ name: '', centerDate: '', daysBefore: 1, daysAfter: 1 });
  }

  function removeWindow(id: string) {
    if (!config) return;
    updateConfig.mutate({ eidWindows: config.eidWindows.filter((w) => w.id !== id) });
  }

  function addClosure() {
    if (!closureForm.date || !closureForm.name.trim()) return;
    createClosure.mutate({ holidayDate: closureForm.date, name: closureForm.name.trim(), isRecurringEid: false });
    setClosureForm({ date: '', name: '' });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Link href="/dashboard/leave/management" className={styles.backLink}>
          ← Management
        </Link>
        <h1 className={styles.title}>Leave settings</h1>
        <p className={styles.sub}>Quota, Eid windows, and company closures — in-app, for Leave only</p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Annual leave quota</h2>
        <p className={styles.hint}>Every staff member&apos;s pooled annual entitlement. One number, company-wide — Palmstead has no separate leave types.</p>
        <div className={styles.quotaRow}>
          <input
            type="number"
            min={0}
            className={styles.quotaInput}
            value={quota}
            onChange={(e) => setQuotaDraft(Number(e.target.value))}
          />
          <span className={styles.quotaUnit}>days / year</span>
          <button type="button" className={styles.saveBtn} disabled={quotaDraft === null || updateConfig.isPending} onClick={saveQuota}>
            {updateConfig.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Eid windows</h2>
        <p className={styles.hint}>
          Eid al-Fitr/al-Adha can&apos;t be predicted by calendar math — moon sightings shift the date. Management maintains the window each year; staff who observe Eid
          (set per-person elsewhere) are exempt from the weekday block on these dates.
        </p>
        <div className={styles.list}>
          {(config?.eidWindows ?? []).length === 0 && <p className={styles.hint}>No Eid windows configured yet.</p>}
          {(config?.eidWindows ?? []).map((w) => (
            <div className={styles.row} key={w.id}>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>{w.name}</div>
                <div className={styles.rowMeta}>
                  Centered {w.centerDate} · {w.daysBefore} day(s) before, {w.daysAfter} day(s) after
                </div>
              </div>
              <button type="button" className={styles.removeBtn} onClick={() => removeWindow(w.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className={styles.addForm}>
          <input className={styles.input} placeholder="Window name (e.g. Eid al-Fitr 2027)" value={windowForm.name} onChange={(e) => setWindowForm((f) => ({ ...f, name: e.target.value }))} />
          <input className={styles.input} type="date" value={windowForm.centerDate} onChange={(e) => setWindowForm((f) => ({ ...f, centerDate: e.target.value }))} />
          <div className={styles.inlineNums}>
            <label className={styles.numLabel}>
              Before
              <input className={styles.numInput} type="number" min={0} value={windowForm.daysBefore} onChange={(e) => setWindowForm((f) => ({ ...f, daysBefore: Number(e.target.value) }))} />
            </label>
            <label className={styles.numLabel}>
              After
              <input className={styles.numInput} type="number" min={0} value={windowForm.daysAfter} onChange={(e) => setWindowForm((f) => ({ ...f, daysAfter: Number(e.target.value) }))} />
            </label>
          </div>
          <button type="button" className={styles.saveBtn} disabled={!windowForm.name.trim() || !windowForm.centerDate || updateConfig.isPending} onClick={addWindow}>
            + Add window
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Company closures</h2>
        <p className={styles.hint}>One-off days off that aren&apos;t on the fixed Ghana public-holiday list (a company anniversary, a declared closure). Shown on every leave calendar once added.</p>
        <div className={styles.list}>
          {(closures ?? []).length === 0 && <p className={styles.hint}>No ad-hoc closures added yet.</p>}
          {(closures ?? []).map((h) => (
            <div className={styles.row} key={h.id}>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>{h.name}</div>
                <div className={styles.rowMeta}>{h.holidayDate}</div>
              </div>
              <button type="button" className={styles.removeBtn} disabled={removeClosure.isPending} onClick={() => removeClosure.mutate(h.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className={styles.addForm}>
          <input className={styles.input} type="date" value={closureForm.date} onChange={(e) => setClosureForm((f) => ({ ...f, date: e.target.value }))} />
          <input className={styles.input} placeholder="Closure name" value={closureForm.name} onChange={(e) => setClosureForm((f) => ({ ...f, name: e.target.value }))} />
          <button type="button" className={styles.saveBtn} disabled={!closureForm.date || !closureForm.name.trim() || createClosure.isPending} onClick={addClosure}>
            {createClosure.isPending ? 'Adding…' : '+ Add closure'}
          </button>
        </div>
      </div>
    </div>
  );
}
