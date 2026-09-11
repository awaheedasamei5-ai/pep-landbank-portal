import { Outlet } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { SegmentedTabs, type SegmentedTabItem } from '../../../shared/ui/SegmentedTabs';
import styles from './AttendanceScreen.module.css';

// Real user correction 2026-09-11 (screenshot of the sidebar, verbatim):
// "how can attendance and attendance records be two different apps on
// the side bar... arent they supoosed to be single apps each with
// attendance records being inside attendance app." Exactly the same
// mistake the project had already fixed once for Operations Tracker
// (see that screen's own header comment) -- one shell, one sidebar
// entry, real nested routes under a SegmentedTabs bar via <Outlet/>, not
// two independent top-level apps. "Records" only renders for a manager
// session; a staff session never sees the tab at all.
export function AttendanceScreen() {
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');

  const tabs: SegmentedTabItem[] = [
    { key: 'today', label: 'Today', to: '/app/office/attendance', end: true },
    ...(isManager ? [{ key: 'records', label: 'Records', to: '/app/office/attendance/records' }] : []),
  ];

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Attendance</h1>
      <p className={styles.sub}>Sign in when you start work, sign out when you're done.</p>
      {tabs.length > 1 && <SegmentedTabs items={tabs} />}
      <Outlet />
    </div>
  );
}
