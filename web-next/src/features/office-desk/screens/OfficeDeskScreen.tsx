import { useNavigate } from 'react-router';
import { useCanLogPayments } from '../../payments/hooks/useLogPayment';
import { TileGrid, type TileItem } from '../../../shared/ui/TileGrid';

// Port of officeDeskGroups()'s items (index.html:8965-8994) -- "Operations
// Tracker" is the only tile wired for this slice; the rest are inert
// placeholders, matching the same phase-scoping discipline as Sales Desk.
export function OfficeDeskScreen() {
  const navigate = useNavigate();
  const canLogPayments = useCanLogPayments();

  const items: TileItem[] = [
    { key: 'duties', label: 'Operations Tracker', sub: "Your tasks, and today's to-do list", color: 'purple', icon: 'checklist', onOpen: () => navigate('/app/office/myday') },
    { key: 'memo', label: 'Memorandum', sub: 'Internal correspondence', color: 'teal', icon: 'note', onOpen: () => navigate('/app/office/memos') },
    { key: 'attendance', label: 'Attendance', sub: 'Sign in & out for the day', color: 'blue', icon: 'check', onOpen: () => navigate('/app/office/attendance') },
    ...(canLogPayments
      ? [{ key: 'payment', label: 'Log Payment', sub: 'Record & approve client payments', color: 'orange', icon: 'card', onOpen: () => navigate('/app/office/payments') } satisfies TileItem]
      : []),
    { key: 'contracts', label: 'Contract requests', sub: 'Request & track contracts of sale', color: 'red', icon: 'document', onOpen: () => navigate('/app/office/contracts') },
    { key: 'quotation', label: 'Quotation', sub: 'Full or Half Plot pricing & payment plans', color: 'green', icon: 'calculator', onOpen: () => navigate('/app/office/quotation') },
    { key: 'leave', label: 'Leave', sub: 'Request & approve staff leave', color: 'blue', icon: 'palm', onOpen: () => navigate('/app/office/leave') },
    { key: 'notes', label: 'Notes', sub: 'Quick private notes, just for you', color: 'purple', icon: 'notepad', onOpen: () => navigate('/app/office/notes') },
  ];

  return (
    <div style={{ padding: '20px 16px 90px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Office</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20, fontSize: 13.5 }}>Documents, operations &amp; feedback</p>
      <TileGrid items={items} />
    </div>
  );
}
