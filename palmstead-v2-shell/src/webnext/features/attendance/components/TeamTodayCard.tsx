"use client";

import type { AttendanceRecord } from '../../../types/domain';
import styles from './TeamTodayCard.module.css';

function statusOf(rec: AttendanceRecord): { label: string; cls: string } {
  if (rec.signOutAt) return { label: 'Done for the day', cls: styles.done };
  if (rec.signInAt) return { label: 'Signed in', cls: styles.in };
  return { label: 'Not signed in', cls: styles.out };
}

function timeStr(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Management's real first question ("is anything wrong today, and who
// do I need to deal with") -- Attendance plan Part 4. Backed by
// attendance.listToday(), the same real attendance_log rows Records
// reads, just narrowed to today so this loads as a glance, not a report.
export function TeamTodayCard({ records, isLoading }: { records: AttendanceRecord[]; isLoading: boolean }) {
  const signedIn = records.filter((r) => r.signInAt).length;
  const lateCount = records.filter((r) => r.lateReason).length;
  const offSiteCount = records.filter((r) => r.isOffSiteIn || r.isOffSiteOut).length;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h3>Team today</h3>
        <div className={styles.summary}>
          <span><strong>{signedIn}</strong> in</span>
          {lateCount > 0 && <span className={styles.warnTag}><strong>{lateCount}</strong> late</span>}
          {offSiteCount > 0 && <span className={styles.infoTag}><strong>{offSiteCount}</strong> off-site</span>}
        </div>
      </div>

      {isLoading ? (
        <p className={styles.empty}>Loading…</p>
      ) : !records.length ? (
        <p className={styles.empty}>Nobody has signed in yet today.</p>
      ) : (
        <div className={styles.grid}>
          {records.map((rec) => {
            const st = statusOf(rec);
            return (
              <div key={rec.id} className={styles.person}>
                <div className={styles.personTop}>
                  <span className={styles.name}>{rec.staffName ?? rec.staffKey}</span>
                  <span className={`${styles.pill} ${st.cls}`}>{st.label}</span>
                </div>
                <div className={styles.meta}>
                  {timeStr(rec.signInAt)}
                  {rec.signOutAt && ` — ${timeStr(rec.signOutAt)}`}
                  {rec.lateReason && <span className={styles.flag}> · Late</span>}
                  {(rec.isOffSiteIn || rec.isOffSiteOut) && <span className={styles.flag}> · Off-site</span>}
                </div>
                {(rec.signInReason || rec.lateReason) && (
                  <div className={styles.reason}>{rec.signInReason || rec.lateReason}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
