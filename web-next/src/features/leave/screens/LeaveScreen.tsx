import { Outlet } from 'react-router';
import { useCanDecideLeave } from '../hooks/useLeaveRequests';
import { SegmentedTabs, type SegmentedTabItem } from '../../../shared/ui/SegmentedTabs';
import styles from './LeaveScreen.module.css';

// Real user correction 2026-09-11 (screenshot of the sidebar, verbatim):
// "isnt leave dashbaord supposed to be inside the leave app" -- same
// mistake as Attendance/Attendance Records, same fix: one shell, one
// sidebar entry, real nested routes under a SegmentedTabs bar via
// <Outlet/>. "Dashboard" only renders for a manager session.
export function LeaveScreen() {
  const canDecide = useCanDecideLeave();

  const tabs: SegmentedTabItem[] = [
    { key: 'myleave', label: 'My Leave', to: '/app/office/leave', end: true },
    ...(canDecide ? [{ key: 'dashboard', label: 'Dashboard', to: '/app/office/leave/dashboard' }] : []),
  ];

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Leave</h1>
      {tabs.length > 1 && <SegmentedTabs items={tabs} />}
      <Outlet />
    </div>
  );
}
