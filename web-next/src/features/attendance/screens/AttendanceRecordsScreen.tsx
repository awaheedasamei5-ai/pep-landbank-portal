import { useMemo, useState } from 'react';
import { Avatar } from '../../../shared/ui/Avatar';
import { AreaChart } from '../../../shared/ui/AreaChart';
import { useAttendanceAnomalyExplainer, useAttendanceBetween } from '../hooks/useAttendance';
import { useDownloadAttendanceRecordsPdf } from '../hooks/useAttendanceRecordsPdf';
import { useAgentRoster } from '../../staff-report/hooks/useStaffReport';
import { useLeaveRequests } from '../../leave/hooks/useLeaveRequests';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { attendanceRecordRows, computeAvgHoursByWeekday, computePunctualityTrend, computeStaffAttendanceSummaries, type AttendanceRecordRow } from '../lib/attendanceRecordsLogic';
import { fmtLongDate, today } from '../../../shared/lib/format';
import styles from './AttendanceRecordsScreen.module.css';

function isoDaysAgo(n: number): string {
  const d = new Date(today() + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Module-level so it's the same array reference every render -- an inline
// `config?.workDays ?? [1,2,3,4,5]` fallback would otherwise create a new
// array each time and defeat useMemo's dependency check below.
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

// New 2026-09-10, user correction, verbatim: "the attandance app doenst
// have a records page, analytics nothing and managemnt cant even pull
// filter or compare staff attendance trends or even pull a report on
// attendance." A dedicated Management-only screen (V3 spec's own
// Attendance screen map names "History"/"Staff drill-down"/"Reports" as
// distinct surfaces, not one scrolling page -- see palmstead-v3-master-
// rebuild-pdf memory) -- date-range filter, per-staff comparison, a
// filterable detailed record list, and a real downloadable PDF report.
export function AttendanceRecordsScreen() {
  const [startDate, setStartDate] = useState(isoDaysAgo(30));
  const [endDate, setEndDate] = useState(today());
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: config } = useConfig();
  const { data: roster } = useAgentRoster();
  const { data: leaveRequests } = useLeaveRequests();
  const { data: records, isLoading } = useAttendanceBetween(startDate, endDate);
  const downloadPdf = useDownloadAttendanceRecordsPdf();

  const cutoff = config?.attendanceCutoffTime ?? '09:00';
  const workDays = config?.workDays ?? DEFAULT_WORK_DAYS;

  const summaries = useMemo(
    () => computeStaffAttendanceSummaries(roster ?? [], records ?? [], leaveRequests ?? [], workDays, cutoff, startDate, endDate, today()),
    [roster, records, leaveRequests, workDays, cutoff, startDate, endDate]
  );
  const visibleSummaries = staffFilter === 'all' ? summaries : summaries.filter((s) => s.staffKey === staffFilter);

  const filteredRecords = (records ?? []).filter((r) => staffFilter === 'all' || r.staffKey === staffFilter);
  const rows = useMemo(() => attendanceRecordRows(filteredRecords, cutoff), [filteredRecords, cutoff]);

  const totalPresent = summaries.reduce((s, r) => s + r.present, 0);
  const totalLate = summaries.reduce((s, r) => s + r.late, 0);
  const totalAbsent = summaries.reduce((s, r) => s + r.absent, 0);

  const punctualityTrend = useMemo(() => computePunctualityTrend(filteredRecords, cutoff), [filteredRecords, cutoff]);
  const weekdayHours = useMemo(() => computeAvgHoursByWeekday(filteredRecords, workDays), [filteredRecords, workDays]);
  const maxWeekdayHours = Math.max(1, ...weekdayHours.map((w) => w.avgHours));

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.sub}>
          {fmtLongDate(startDate)} to {fmtLongDate(endDate)}
        </p>
        <button
          type="button"
          className={styles.downloadBtn}
          disabled={downloadPdf.isPending || summaries.length === 0}
          onClick={() => downloadPdf.mutate({ summaries: visibleSummaries, startDate, endDate, companyName: config?.quoteCompanyName })}
        >
          {downloadPdf.isPending ? 'Preparing…' : '📄 Download report'}
        </button>
      </div>

      <div className={styles.filterRow}>
        <div className={styles.field}>
          <label className={styles.label}>From</label>
          <input className={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>To</label>
          <input className={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Staff</label>
          <select className={styles.input} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
            <option value="all">All staff</option>
            {(roster ?? []).map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.summaryRow}>
        <div className={styles.summaryTile}>
          <div className={styles.summaryCount}>{totalPresent}</div>
          <div className={styles.summaryLabel}>Present</div>
        </div>
        <div className={`${styles.summaryTile} ${styles.summaryWarn}`}>
          <div className={styles.summaryCount}>{totalLate}</div>
          <div className={styles.summaryLabel}>Late</div>
        </div>
        <div className={`${styles.summaryTile} ${styles.summaryDanger}`}>
          <div className={styles.summaryCount}>{totalAbsent}</div>
          <div className={styles.summaryLabel}>Absent</div>
        </div>
      </div>

      {punctualityTrend.length >= 2 && (
        <div className={styles.chartCard}>
          <div className={styles.sectitle}>Punctuality trend, by week</div>
          <AreaChart values={punctualityTrend.map((p) => p.value)} labels={punctualityTrend.map((p) => p.label)} color="var(--c-success)" height={80} />
        </div>
      )}

      {weekdayHours.some((w) => w.avgHours > 0) && (
        <div className={styles.chartCard}>
          <div className={styles.sectitle}>Average hours on-site, by day</div>
          <div className={styles.bars}>
            {weekdayHours.map((w) => (
              <div key={w.label} className={styles.barCol}>
                <span className={styles.barValue}>{w.avgHours > 0 ? `${w.avgHours}h` : ''}</span>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ height: `${(w.avgHours / maxWeekdayHours) * 100}%` }} />
                </div>
                <span className={styles.barLabel}>{w.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.sectitle}>Compare staff</div>
      {isLoading && <p className={styles.hint}>Loading…</p>}
      {!isLoading && summaries.length === 0 && <p className={styles.hint}>No active staff on the roster.</p>}
      <div className={styles.list}>
        {visibleSummaries.map((s) => {
          const isOpen = expanded.has(s.staffKey);
          const staffRecords = rows.filter((r) => r.staffKey === s.staffKey);
          return (
            <div className={styles.staffRow} key={s.staffKey}>
              <button type="button" className={styles.staffHead} onClick={() => toggle(s.staffKey)}>
                <Avatar name={s.staffName} size={32} />
                <div className={styles.rowMain}>
                  <div className={styles.name}>{s.staffName}</div>
                  <div className={styles.meta}>
                    {s.present}/{s.workDays} present &middot; {s.late} late &middot; {s.absent} absent{s.onLeave ? ` · ${s.onLeave} on leave` : ''}
                  </div>
                </div>
                <span className={`${styles.rateBadge} ${s.onTimeRate < 80 ? styles.rateBadgeLow : ''}`}>{s.onTimeRate}% on-time</span>
                <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className={styles.staffDates}>
                  {staffRecords.length === 0 && <p className={styles.hint}>No sign-ins in this range.</p>}
                  {staffRecords.map((r) => (
                    <RecordDateRow key={r.id} r={r} staffName={s.staffName} cutoff={cutoff} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cutoffMinutesLate(signInAt: string | null, cutoff: string): number | null {
  if (!signInAt) return null;
  const signInHHMM = signInAt.slice(11, 16);
  const [ch, cm] = cutoff.split(':').map(Number);
  const [sh, sm] = signInHHMM.split(':').map(Number);
  const diff = sh * 60 + sm - (ch * 60 + cm);
  return diff > 0 ? diff : null;
}

// V3 chapter-01's "explain attendance anomalies in plain English" AI
// capability -- only fetched once Management actually asks, for a
// specific already-flagged day, never auto-loaded for every row in a
// potentially long list.
function RecordDateRow({ r, staffName, cutoff }: { r: AttendanceRecordRow; staffName: string; cutoff: string }) {
  const [explaining, setExplaining] = useState(false);
  const isLate = !r.onTime;
  const isOffSite = !!r.isOffSiteIn;
  const explainInput = explaining
    ? {
        staffName,
        workDate: r.workDate,
        isLate,
        lateMinutes: isLate ? cutoffMinutesLate(r.signInAt, cutoff) : null,
        lateReason: r.lateReason,
        isOffSite,
        offSiteReason: r.signInReason,
        signInAt: r.signInAt,
        signOutAt: r.signOutAt,
      }
    : null;
  const { data: explanation, isLoading } = useAttendanceAnomalyExplainer(explainInput);

  return (
    <div className={styles.dateRow}>
      <div className={styles.dateRowTop}>
        <span>{fmtLongDate(r.workDate)}</span>
        <span>
          {fmtTime(r.signInAt)} → {fmtTime(r.signOutAt)}
          {isOffSite ? ' · Off-site' : ''}
        </span>
        <span className={r.onTime ? styles.tagApproved : styles.tagPending}>{r.onTime ? 'On time' : 'Late'}</span>
      </div>
      {(isLate || isOffSite) &&
        (explaining ? (
          <p className={styles.hint}>{isLoading ? 'Explaining…' : (explanation ?? 'Could not get an explanation.')}</p>
        ) : (
          <button type="button" className={styles.explainBtn} onClick={() => setExplaining(true)}>
            Explain
          </button>
        ))}
    </div>
  );
}
