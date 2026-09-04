import { useNavigate } from 'react-router';
import { useCanLogPayments } from '../../payments/hooks/useLogPayment';
import { useCanManageExpenses } from '../../expenses/hooks/useFundRequests';
import { useCanViewSiteVisitAuth } from '../../site-visit-auth/hooks/useSiteVisitAuth';
import { useCanViewStaffReport } from '../../staff-report/hooks/useStaffReport';
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

  const items: TileItem[] = [
    { key: 'duties', label: 'My Day', sub: "Today's to-do list", color: 'purple', icon: 'checklist', onOpen: () => navigate('/app/office/myday') },
    { key: 'taskboard', label: 'Task Board', sub: 'Assign & track ongoing work, kanban-style', color: 'purple', icon: 'checklist', onOpen: () => navigate('/app/office/tasks') },
    { key: 'memo', label: 'Memorandum', sub: 'Internal correspondence', color: 'teal', icon: 'note', onOpen: () => navigate('/app/office/memos') },
    { key: 'attendance', label: 'Attendance', sub: 'Sign in & out for the day', color: 'blue', icon: 'check', onOpen: () => navigate('/app/office/attendance') },
    ...(canLogPayments
      ? [{ key: 'payment', label: 'Log Payment', sub: 'Record & approve client payments', color: 'orange', icon: 'card', onOpen: () => navigate('/app/office/payments') } satisfies TileItem]
      : []),
    { key: 'contracts', label: 'Contract requests', sub: 'Request & track contracts of sale', color: 'red', icon: 'document', onOpen: () => navigate('/app/office/contracts') },
    { key: 'quotation', label: 'Quotation', sub: 'Full or Half Plot pricing & payment plans', color: 'green', icon: 'calculator', onOpen: () => navigate('/app/office/quotation') },
    { key: 'leave', label: 'Leave', sub: 'Request & approve staff leave', color: 'blue', icon: 'palm', onOpen: () => navigate('/app/office/leave') },
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
