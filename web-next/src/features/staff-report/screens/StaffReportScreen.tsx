import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { reportPeriodRange, type ReportPeriodKey } from '../../manager/lib/managementReportLogic';
import { useAgentRoster, useStaffReportData } from '../hooks/useStaffReport';
import { useDownloadStaffReport } from '../hooks/useDownloadStaffReport';
import styles from './StaffReportScreen.module.css';

const PERIOD_OPTIONS: { key: ReportPeriodKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'lastyear', label: 'Last year' },
  { key: 'custom', label: 'Custom range' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Port of index.html's Staff Report (index.html:23283-23450) -- "Everything
// one staff member has done, across every app — pipeline, operations,
// attendance, and system usage, or compare everyone at once." Operations
// (task overdue/escalated counts) is out of scope here -- see
// staffReportLogic.ts's own comment for exactly why. Tasks-completed/
// attendance are real but always "last 90 days" regardless of the period
// picker -- also documented there (a real constraint of the underlying
// leaderboard_rows() RPC, verified live, not a corner cut).
export function StaffReportScreen() {
  const navigate = useNavigate();
  const { data: agents } = useAgentRoster();
  const [periodKey, setPeriodKey] = useState<ReportPeriodKey>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [staffKey, setStaffKey] = useState('');
  const downloadReport = useDownloadStaffReport();

  const range = reportPeriodRange(periodKey, customFrom, customTo);
  const { isLoading, rows, one, dayOfWeek } = useStaffReportData(range, staffKey);
  const maxDay = Math.max(1, ...(dayOfWeek ?? [1]));

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Office · Operations</div>
      <h1 className={styles.title}>Staff Report</h1>
      <p className={styles.sub}>Everything one staff member has done, across every app — pipeline, tasks, and attendance — or compare everyone at once.</p>

      <div className={styles.card}>
        <div className={styles.periodRow}>
          {PERIOD_OPTIONS.map((o) => (
            <button key={o.key} type="button" className={`${styles.chip} ${periodKey === o.key ? styles.chipOn : ''}`} onClick={() => setPeriodKey(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
        {periodKey === 'custom' && (
          <div className={styles.customRow}>
            <label className={styles.customField}>
              From
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className={styles.customField}>
              To
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}
        <select className={styles.select} value={staffKey} onChange={(e) => setStaffKey(e.target.value)}>
          <option value="">All staff (comparison)</option>
          {agents?.map((a) => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.downloadBtn}
          disabled={downloadReport.isPending || isLoading}
          onClick={() => downloadReport.mutate({ rows, one, dayOfWeek, staffKey, range })}
        >
          {downloadReport.isPending ? 'Building…' : '⬇ Download PDF report'}
        </button>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {!isLoading && !staffKey && (
        <>
          <div className={styles.sectitle}>
            Comparison <span className={styles.sectitleHint}>{rows.length} staff · {range.label}</span>
          </div>
          <div className={styles.list}>
            {rows.length === 0 && <p className={styles.emptyMsg}>No staff activity in this period.</p>}
            {rows.map((s) => (
              <div className={styles.compRow} key={s.key}>
                <div>
                  <div className={styles.compName}>{s.name}</div>
                  <div className={styles.compMeta}>
                    {s.leadsAdded} lead{s.leadsAdded === 1 ? '' : 's'} · {s.dealsClosed} deal{s.dealsClosed === 1 ? '' : 's'} · {s.tasksCompleted} task{s.tasksCompleted === 1 ? '' : 's'} done · {s.siteVisits} site visit{s.siteVisits === 1 ? '' : 's'}
                  </div>
                </div>
                <div className={styles.compAmt}>{ghs(s.revenue)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {!isLoading && staffKey && one && (
        <>
          <div className={styles.sectitle}>
            {one.name} <span className={styles.sectitleHint}>{range.label}</span>
          </div>
          <div className={styles.kpiGrid}>
            <div className={styles.kpi}>
              <div className={styles.kpiVal}>{one.leadsAdded}</div>
              <div className={styles.kpiLbl}>Leads added</div>
            </div>
            <div className={`${styles.kpi} ${styles.kpiGreen}`}>
              <div className={styles.kpiVal}>{one.dealsClosed}</div>
              <div className={styles.kpiLbl}>Deals closed</div>
            </div>
            <div className={`${styles.kpi} ${styles.kpiGold}`}>
              <div className={styles.kpiVal}>{ghs(one.revenue)}</div>
              <div className={styles.kpiLbl}>Revenue collected</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiVal}>{one.tasksCompleted}</div>
              <div className={styles.kpiLbl}>Tasks completed</div>
            </div>
          </div>

          <div className={styles.sectitle}>
            Attendance <span className={styles.sectitleHint}>last 90 days</span>
          </div>
          <div className={styles.card}>
            <p className={styles.rowcardText}>
              {one.daysAttended} day{one.daysAttended === 1 ? '' : 's'} attended · {one.onTimeDays} on time · {one.avgTaskDays != null ? `${one.avgTaskDays.toFixed(1)} avg days/task` : 'no completed tasks'}
            </p>
          </div>

          {dayOfWeek && (
            <>
              <div className={styles.sectitle}>Time on system by day of week</div>
              <div className={`${styles.card} ${styles.dayChart}`}>
                {dayOfWeek.map((v, i) => (
                  <div className={styles.dayBar} key={DAY_LABELS[i]}>
                    <div className={styles.dayBarFill} style={{ height: `${Math.max(4, (v / maxDay) * 56)}px` }} />
                    <div className={styles.dayBarLabel}>{DAY_LABELS[i]}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
