import { useNavigate } from 'react-router';
import { useCanLogPayments } from '../../payments/hooks/useLogPayment';
import { useCanManageExpenses } from '../../expenses/hooks/useFundRequests';
import { useCanViewSiteVisitAuth } from '../../site-visit-auth/hooks/useSiteVisitAuth';
import { useCanViewStaffReport } from '../../staff-report/hooks/useStaffReport';
import { useCanDecideLeave } from '../../leave/hooks/useLeaveRequests';
import { useSessionStore } from '../../../auth/useSessionStore';
import { TileGrid, type TileItem } from '../../../shared/ui/TileGrid';
import styles from './OfficeDeskScreen.module.css';

// Port of officeDeskGroups()'s items (index.html:8965-8994) -- "Operations
// Tracker" is the only tile wired for this slice; the rest are inert
// placeholders, matching the same phase-scoping discipline as Sales Desk.
export function OfficeDeskScreen() {
  const navigate = useNavigate();
  const canLogPayments = useCanLogPayments();
  const canManageExpenses = useCanManageExpenses();
  const canViewSiteVisitAuth = useCanViewSiteVisitAuth();
  const canViewStaffReport = useCanViewStaffReport();
  const canDecideLeave = useCanDecideLeave();
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');

  const items: TileItem[] = [
    // Real user ask (2026-09-06): My Day/Task Board/Week/Month/Team
    // Schedule/Meetings are one app, not six tiles -- one tile into the
    // OperationsTrackerScreen shell, which owns its own tab navigation.
    { key: 'operations', label: 'Operations Tracker', sub: 'Your day, week, tasks, team & meetings -- one app', color: 'purple', icon: 'checklist', onOpen: () => navigate('/app/office/operations') },
    { key: 'memo', label: 'Memorandum', sub: 'Internal correspondence', color: 'teal', icon: 'note', onOpen: () => navigate('/app/office/memos') },
    { key: 'attendance', label: 'Attendance', sub: 'Sign in & out for the day', color: 'blue', icon: 'check', onOpen: () => navigate('/app/office/attendance') },
    ...(isManager
      ? [
          {
            key: 'attendanceRecords',
            label: 'Attendance Records',
            sub: 'Filter, compare staff & pull a report',
            color: 'blue',
            icon: 'check',
            onOpen: () => navigate('/app/office/attendance/records'),
          } satisfies TileItem,
        ]
      : []),
    ...(canLogPayments
      ? [{ key: 'payment', label: 'Log Payment', sub: 'Record & approve client payments', color: 'orange', icon: 'card', onOpen: () => navigate('/app/office/payments') } satisfies TileItem]
      : []),
    { key: 'contracts', label: 'Contract requests', sub: 'Request & track contracts of sale', color: 'red', icon: 'document', onOpen: () => navigate('/app/office/contracts') },
    { key: 'quotation', label: 'Quotation', sub: 'Full or Half Plot pricing & payment plans', color: 'green', icon: 'calculator', onOpen: () => navigate('/app/office/quotation') },
    { key: 'leave', label: 'Leave', sub: 'Request & approve staff leave', color: 'blue', icon: 'palm', onOpen: () => navigate('/app/office/leave') },
    ...(canDecideLeave
      ? [
          {
            key: 'leaveDashboard',
            label: 'Leave Dashboard',
            sub: 'Every staff plan, remaining days & upcoming alerts',
            color: 'blue',
            icon: 'palm',
            onOpen: () => navigate('/app/office/leave/dashboard'),
          } satisfies TileItem,
        ]
      : []),
    { key: 'notes', label: 'Notes', sub: 'Quick private notes, just for you', color: 'purple', icon: 'notepad', onOpen: () => navigate('/app/office/notes') },
    { key: 'banners', label: 'Banner Tracking', sub: 'Add, track & route to every placement', color: 'orange', icon: 'pin', onOpen: () => navigate('/app/office/banners') },
    ...(canManageExpenses
      ? [{ key: 'expenses', label: 'Expenses', sub: 'Request funds & track approvals', color: 'green', icon: 'wallet', onOpen: () => navigate('/app/office/expenses') } satisfies TileItem]
      : []),
    ...(canViewSiteVisitAuth
      ? [{ key: 'sitevisitauth', label: 'Site Visit Authorization', sub: "Daily logistics cost estimate & approval", color: 'teal', icon: 'ruler', onOpen: () => navigate('/app/office/sitevisitauth') } satisfies TileItem]
      : []),
    ...(canViewStaffReport
      ? [{ key: 'staffreport', label: 'Staff Report', sub: 'One staff member across every app, or compare everyone', color: 'purple', icon: 'team', onOpen: () => navigate('/app/office/staffreport') } satisfies TileItem]
      : []),
  ];

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Office</h1>
      <p className={styles.sub}>Documents, operations &amp; feedback</p>
      <TileGrid items={items} />
    </div>
  );
}
