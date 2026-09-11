import { useMemo, useState } from 'react';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useAgentRoster } from '../../staff-report/hooks/useStaffReport';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved, leaveUpcomingForAll } from '../lib/leaveLogic';
import { fmtLongDate, today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveDashboardScreen.module.css';

const STATUS_LABEL: Record<LeaveRequest['status'], string> = { planned: 'Planned', pending: 'Pending', approved: 'Approved', declined: 'Declined', rescheduled: 'Reschedule requested' };
const STATUS_CLASS: Record<LeaveRequest['status'], string> = {
  planned: styles.tagMuted,
  pending: styles.tagPending,
  approved: styles.tagApproved,
  declined: styles.tagDeclined,
  rescheduled: styles.tagPending,
};

function dateRangeLabel(r: LeaveRequest): string {
  const first = r.dates[0] ?? '';
  const last = r.dates[r.dates.length - 1] ?? '';
  if (!first) return '';
  return last && last !== first ? `${fmtLongDate(first)} to ${fmtLongDate(last)}` : fmtLongDate(first);
}

// User ask, verbatim (2026-09-05): "management has an extra screen that
// contains every staffs leave plan and a live dashboard that counts the
// leave per staff remaining, alert for leaves that are getting near,
// emergency leaves." Genuinely new -- v1 has no company-wide leave
// overview at all, only the shared request/decide list this screen sits
// alongside (LeaveScreen.tsx). Quota math is the existing faithful port
// in leaveLogic.ts, not reinvented here. Deliberately compact rows
// throughout, never a block-grid calendar -- explicit, frustrated user
// correction elsewhere in this app ("ur calender view ... stupid, big
// blocks and ugly"), same discipline LeaveScreen/AttendanceScreen already
// follow.
export function LeaveDashboardScreen() {
  const { data: config } = useConfig();
  const { data: roster } = useAgentRoster();
  const { data: requests } = useLeaveRequests();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const year = new Date(today()).getFullYear();
  const all = requests ?? [];
  // A 'planned' row is still v1's real private pre-submission draft (see
  // LeaveScreen's own header comment) -- Management can't see it here
  // either, same filter that screen already applies.
  const visible = all.filter((r) => r.status !== 'planned');

  const upcoming = useMemo(() => leaveUpcomingForAll(visible, today(), 7), [visible]);
  const emergencies = useMemo(
    () => [...visible.filter((r) => r.isEmergency)].sort((a, b) => (a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : b.createdAt.localeCompare(a.createdAt))),
    [visible]
  );
  const pendingEmergencyCount = emergencies.filter((r) => r.status === 'pending').length;

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
        <p className={styles.sub}>Every staff member&apos;s {year} leave plan, at a glance</p>
      </div>

      <div className={styles.summaryRow}>
        <div className={styles.summaryTile}>
          <div className={styles.summaryCount}>{roster?.length ?? 0}</div>
          <div className={styles.summaryLabel}>Staff</div>
        </div>
        <div className={styles.summaryTile}>
          <div className={styles.summaryCount}>{upcoming.length}</div>
          <div className={styles.summaryLabel}>Leave coming up</div>
        </div>
        <div className={`${styles.summaryTile} ${pendingEmergencyCount > 0 ? styles.summaryEmergency : ''}`}>
          <div className={styles.summaryCount}>{pendingEmergencyCount}</div>
          <div className={styles.summaryLabel}>Emergency pending</div>
        </div>
      </div>

      {upcoming.length > 0 && (
        <>
          <div className={styles.sectitle}>Coming up in the next 7 days</div>
          <div className={styles.list}>
            {upcoming.map(({ request, startDate }) => (
              <div className={styles.row} key={request.id}>
                <div className={styles.rowMain}>
                  <div className={styles.name}>
                    {request.agentName}
                    {request.isEmergency && <span className={styles.emergencyTag}>🚨 Emergency</span>}
                  </div>
                  <div className={styles.meta}>
                    Starts {fmtLongDate(startDate)} &middot; {dateRangeLabel(request)}
                  </div>
                </div>
                <span className={STATUS_CLASS[request.status]}>{STATUS_LABEL[request.status]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {emergencies.length > 0 && (
        <>
          <div className={styles.sectitle}>🚨 Emergency leave</div>
          <div className={styles.list}>
            {emergencies.map((r) => (
              <div className={styles.row} key={r.id}>
                <div className={styles.rowMain}>
                  <div className={styles.name}>{r.agentName}</div>
                  <div className={styles.meta}>
                    {r.daysCount} day{r.daysCount === 1 ? '' : 's'} &middot; {dateRangeLabel(r)}
                  </div>
                </div>
                <span className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.sectitle}>Every staff member</div>
      {!roster && <p className={styles.hint}>Loading roster…</p>}
      {roster && roster.length === 0 && <p className={styles.hint}>No active staff on the roster.</p>}
      <div className={styles.list}>
        {(roster ?? []).map((s) => {
          const reserved = config ? leaveDaysReserved(visible, s.key, year) : 0;
          const confirmedUsed = leaveDaysConfirmedUsed(visible, s.key, year, today());
          const remaining = config ? leaveDaysRemaining(config, visible, s.key, year) : null;
          const own = visible.filter((r) => r.agentKey === s.key).sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
          const isOpen = expanded.has(s.key);
          return (
            <div className={styles.staffRow} key={s.key}>
              <button type="button" className={styles.staffHead} onClick={() => toggle(s.key)}>
                <div className={styles.rowMain}>
                  <div className={styles.name}>{s.name}</div>
                  <div className={styles.meta}>
                    {own.length} request{own.length === 1 ? '' : 's'} in {year}
                  </div>
                </div>
                <span className={styles.remainingBadge}>
                  {remaining ?? '--'}/{config?.leaveTotalDays ?? '--'} left
                </span>
                <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className={styles.staffDates}>
                  {own.length === 0 && <p className={styles.hint}>No leave requests yet.</p>}
                  {own.map((r) => (
                    <div className={styles.dateRow} key={r.id}>
                      <span>
                        {dateRangeLabel(r)}
                        {r.isEmergency ? ' · 🚨' : ''}
                      </span>
                      <span className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</span>
                    </div>
                  ))}
                  <div className={styles.usedNote}>
                    {reserved} reserved &middot; {confirmedUsed} confirmed used of {config?.leaveTotalDays ?? 20} in {year}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
