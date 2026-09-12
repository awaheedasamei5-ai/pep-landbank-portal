"use client";

import { useState } from 'react';
import { useAttendanceManagement } from '../hooks/useAttendanceManagement';
import { TeamTodayCard } from '../components/TeamTodayCard';
import { AttendanceSuggestions } from '../components/AttendanceSuggestions';
import { AttendanceExceptionsQueue } from '../components/AttendanceExceptionsQueue';
import { AttendanceRecordsTable } from '../components/AttendanceRecordsTable';
import { AttendancePolicyCard } from '../components/AttendancePolicyCard';
import { OfficeLocationsCard } from '../components/OfficeLocationsCard';
import styles from './AttendanceManagementScreen.module.css';

type Tab = 'today' | 'records' | 'exceptions' | 'settings';

// Attendance plan Part 4 -- "Management's real question is almost never
// 'show me a table' -- it's 'is anything wrong today, and who do I need
// to deal with.'" Everything about how attendance is judged (policy,
// office locations) lives inside this same view, per the user's own
// explicit correction: not a separate Settings app.
export function AttendanceManagementScreen() {
  const mgmt = useAttendanceManagement();
  const [tab, setTab] = useState<Tab>('today');

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        <button type="button" className={tab === 'today' ? styles.tabActive : styles.tab} onClick={() => setTab('today')}>
          Today
        </button>
        <button type="button" className={tab === 'records' ? styles.tabActive : styles.tab} onClick={() => setTab('records')}>
          Records
        </button>
        <button type="button" className={tab === 'exceptions' ? styles.tabActive : styles.tab} onClick={() => setTab('exceptions')}>
          Exceptions {mgmt.pendingExceptions.length > 0 && <span className={styles.tabBadge}>{mgmt.pendingExceptions.length}</span>}
        </button>
        <button type="button" className={tab === 'settings' ? styles.tabActive : styles.tab} onClick={() => setTab('settings')}>
          Policy &amp; Locations
        </button>
      </div>

      {tab === 'today' && (
        <>
          <TeamTodayCard records={mgmt.today} isLoading={mgmt.isLoadingToday} />
          <AttendanceSuggestions
            suggestions={mgmt.suggestions}
            onIssue={async (s, reason) => {
              await mgmt.issueNote(s.staffKey, s.staffName, s.kind, reason, s.workDate);
            }}
          />
        </>
      )}

      {tab === 'records' && (
        <AttendanceRecordsTable
          records={mgmt.recent30}
          onCorrect={mgmt.correctRecord}
          onRemove={mgmt.removeRecord}
          onResetAll={mgmt.resetAll}
        />
      )}

      {tab === 'exceptions' && (
        <AttendanceExceptionsQueue pending={mgmt.pendingExceptions} onDecide={mgmt.decideException} />
      )}

      {tab === 'settings' && (
        <>
          <AttendancePolicyCard policy={mgmt.policy} onUpdate={mgmt.updatePolicy} />
          <OfficeLocationsCard
            locations={mgmt.officeLocations}
            onCreate={mgmt.createOfficeLocation}
            onUpdate={mgmt.updateOfficeLocation}
            onRemove={mgmt.removeOfficeLocation}
          />
        </>
      )}
    </div>
  );
}
