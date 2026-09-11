import { Outlet } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { SegmentedTabs, type SegmentedTabItem } from '../../../shared/ui/SegmentedTabs';
import { useOpsTrackerRealtime } from '../hooks/useOpsTrackerRealtime';
import styles from './OperationsTrackerScreen.module.css';

// Real user ask (2026-09-06): "the my day task board etc in the operation
// tracker are supposed to be parts of a single app... in the sidebar it
// supposed to be only operation tracker as the app... when u click on ops
// tracker u are able to see all this parts connected as a single app."
// One shell, one sidebar entry, six real routes nested underneath via
// react-router's own <Outlet/> (matching the nested-route convention
// already used for CompanyLeadsScreen's own :id child) -- not a fake
// tab-switcher over local state, so each tab is still a real, bookmarkable
// URL and the browser back button works the way a real app's tabs should.
export function OperationsTrackerScreen() {
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  useOpsTrackerRealtime();

  const tabs: SegmentedTabItem[] = [
    { key: 'dashboard', label: 'Dashboard', to: '/app/office/operations', end: true },
    { key: 'myday', label: 'My Day', to: '/app/office/operations/myday' },
    { key: 'week', label: 'Week', to: '/app/office/operations/week' },
    { key: 'month', label: 'Month', to: '/app/office/operations/month' },
    { key: 'tasks', label: 'Task Board', to: '/app/office/operations/tasks' },
    ...(isManager ? [{ key: 'team', label: 'Team Schedule', to: '/app/office/operations/team' }] : []),
    { key: 'meetings', label: 'Meetings', to: '/app/office/operations/meetings' },
  ];

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Operations Tracker</h1>
      <p className={styles.sub}>Your day, your week, your team -- one place, powered by AI</p>
      <SegmentedTabs items={tabs} />
      <Outlet />
    </div>
  );
}
