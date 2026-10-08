"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { companyClosuresForYear } from '../lib/leaveLogic';
import { ghanaHolidayMapForYear, isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import { today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveManagementCalendarScreen.module.css';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function iso(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

// Real "who's out when" company-wide calendar -- Management's own request:
// "the team wide home page with all the leave detais company wide, who
// and who is due for leave when with countdown for each staff." The
// countdown-per-staff half lives on the Management dashboard/requests
// pages (live remaining-days badges); this page is the actual calendar
// half, as its own route.
export function LeaveManagementCalendarScreen() {
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const now = new Date(today());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const all = requests ?? [];
  const relevant = all.filter((r) => r.status === 'approved' || r.status === 'pending');

  const nDays = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const holidays = config ? ghanaHolidayMapForYear(year, config.eidWindows, companyClosuresForYear(companyClosures ?? [], year)) : new Map();
  const t = today();

  const byDate = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    relevant.forEach((r) => {
      (r.dates || []).forEach((d) => {
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(r);
      });
    });
    return map;
  }, [relevant]);

  const monthEntries = useMemo(() => {
    const seen = new Map<string, { agentName: string; request: LeaveRequest }>();
    for (let d = 1; d <= nDays; d++) {
      const dayIso = iso(year, month, d);
      (byDate.get(dayIso) ?? []).forEach((r) => {
        const key = `${r.agentKey}-${r.id}`;
        if (!seen.has(key)) seen.set(key, { agentName: r.agentName, request: r });
      });
    }
    return Array.from(seen.values()).sort((a, b) => (a.request.dates[0] ?? '').localeCompare(b.request.dates[0] ?? ''));
  }, [byDate, nDays, year, month]);

  function navMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setMonth(m);
    setYear(y);
  }

  const cells: { iso: string | null; day: number }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ iso: null, day: 0 });
  for (let d = 1; d <= nDays; d++) cells.push({ iso: iso(year, month, d), day: d });

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Link href="/dashboard/leave/management" className={styles.backLink}>
          ← Management
        </Link>
        <h1 className={styles.title}>Team calendar</h1>
        <p className={styles.sub}>Who&apos;s out, company-wide</p>
      </div>

      <div className={styles.nav}>
        <button type="button" className={styles.navBtn} onClick={() => navMonth(-1)} aria-label="Previous month">
          &lsaquo;
        </button>
        <div className={styles.navLabel}>
          {MONTH_NAMES[month]} {year}
        </div>
        <button type="button" className={styles.navBtn} onClick={() => navMonth(1)} aria-label="Next month">
          &rsaquo;
        </button>
      </div>

      <div className={styles.grid}>
        {WEEKDAY_LABELS.map((w, i) => (
          <div className={styles.wd} key={i}>
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c.iso) return <div className={`${styles.cell} ${styles.empty}`} key={i} />;
          const cellIso = c.iso;
          const isToday = cellIso === t;
          const isWeekend = isWeekendIso(cellIso);
          const holiday = holidays.get(cellIso);
          const onLeave = byDate.get(cellIso) ?? [];
          const pendingOnly = onLeave.length > 0 && onLeave.every((r) => r.status === 'pending');
          return (
            <div key={cellIso} className={`${styles.cell} ${isToday ? styles.today : ''} ${holiday ? styles.holiday : ''} ${isWeekend && !holiday ? styles.weekend : ''}`}>
              <span className={styles.dayNum}>{c.day}</span>
              {onLeave.length > 0 && (
                <div className={styles.chips} title={onLeave.map((r) => r.agentName).join(', ')}>
                  {onLeave.slice(0, 3).map((r) => (
                    <span key={r.id} className={`${styles.chip} ${r.status === 'pending' ? styles.chipPending : ''}`}>
                      {initials(r.agentName)}
                    </span>
                  ))}
                  {onLeave.length > 3 && <span className={styles.chipMore}>+{onLeave.length - 3}</span>}
                </div>
              )}
              {holiday && !onLeave.length && <div className={styles.holidayLabel}>{holiday.name}</div>}
            </div>
          );
        })}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <i className={styles.legendSwatch} style={{ background: 'var(--c-accent)' }} />
          Approved
        </span>
        <span className={styles.legendItem}>
          <i className={styles.legendSwatch} style={{ background: 'var(--c-warn)' }} />
          Pending / holiday
        </span>
      </div>

      <div className={styles.sectitle}>Out this month</div>
      {monthEntries.length === 0 && <p className={styles.hint}>Nobody&apos;s leave falls in {MONTH_NAMES[month]} {year}.</p>}
      <div className={styles.list}>
        {monthEntries.map(({ agentName, request }) => {
          const first = request.dates[0] ?? '';
          const last = request.dates[request.dates.length - 1] ?? '';
          return (
            <div className={styles.row} key={request.id}>
              <div className={styles.rowMain}>
                <div className={styles.name}>
                  {agentName}
                  {request.isEmergency && <span className={styles.emergencyTag}>🚨</span>}
                </div>
                <div className={styles.meta}>
                  {first}
                  {last !== first ? ` to ${last}` : ''}
                </div>
              </div>
              <span className={request.status === 'approved' ? styles.tagApproved : styles.tagPending}>{request.status === 'approved' ? 'Approved' : 'Pending'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
