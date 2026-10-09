"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { LeaveRequestsDataTable } from '../components/LeaveRequestsDataTable';
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

// Real "who's out when" company-wide calendar. The day-chip grid is a
// genuinely specialized widget (no equivalent in the reference repo or
// the shell's own shadcn library), kept as its own CSS module; the
// surrounding chrome and the "out this month" list are rebuilt on the
// shell's real shadcn Card/Table after the 2026-10-08 correction.
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
    const seen = new Map<string, LeaveRequest>();
    for (let d = 1; d <= nDays; d++) {
      const dayIso = iso(year, month, d);
      (byDate.get(dayIso) ?? []).forEach((r) => {
        const key = `${r.agentKey}-${r.id}`;
        if (!seen.has(key)) seen.set(key, r);
      });
    }
    return Array.from(seen.values()).sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
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
    <div className="p-4 pb-24 md:p-8">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/leave/management">
          <ArrowLeft />
          Management
        </Link>
      </Button>
      <PageHeader title="Team calendar" description="Who's out, company-wide" />

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon-sm" onClick={() => navMonth(-1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <CardTitle>
              {MONTH_NAMES[month]} {year}
            </CardTitle>
            <Button variant="outline" size="icon-sm" onClick={() => navMonth(1)} aria-label="Next month">
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Out in {MONTH_NAMES[month]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveRequestsDataTable requests={monthEntries} showAgent emptyMessage={`Nobody's leave falls in ${MONTH_NAMES[month]} ${year}.`} />
        </CardContent>
      </Card>
    </div>
  );
}
