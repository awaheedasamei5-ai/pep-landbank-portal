import { useNavigate } from 'react-router';
import { TileGrid, type TileItem } from '../../../shared/ui/TileGrid';

// Port of officeDeskGroups()'s items (index.html:8965-8994) -- "Operations
// Tracker" is the only tile wired for this slice; the rest are inert
// placeholders, matching the same phase-scoping discipline as Sales Desk.
export function OfficeDeskScreen() {
  const navigate = useNavigate();

  const items: TileItem[] = [
    { key: 'duties', label: 'Operations Tracker', sub: "Your tasks, and today's to-do list", color: 'purple', glyph: '🗂️', onOpen: () => navigate('/app/office/myday') },
    { key: 'memo', label: 'Memorandum', sub: 'Coming in a later phase', color: 'teal', glyph: '📝' },
    { key: 'attendance', label: 'Attendance', sub: 'Sign in & out for the day', color: 'blue', glyph: '✅', onOpen: () => navigate('/app/office/attendance') },
    { key: 'payment', label: 'Log Payment', sub: 'Coming in a later phase', color: 'orange', glyph: '💳' },
  ];

  return (
    <div style={{ padding: '20px 16px 90px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Office</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20, fontSize: 13.5 }}>Documents, operations &amp; feedback</p>
      <TileGrid items={items} />
    </div>
  );
}
