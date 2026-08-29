import { useNavigate } from 'react-router';
import { TileGrid, type TileItem } from '../../../shared/ui/TileGrid';

// Port of salesDeskGroupsForAgent()'s items (index.html:8843-8860) --
// "My pipeline" is the only tile actually wired for Phase 2; the rest are
// visible-but-inert placeholders naming what's still to come, matching the
// plan's phase-by-phase scoping instead of building all of Sales Desk at once.
export function SalesDeskScreen() {
  const navigate = useNavigate();

  const items: TileItem[] = [
    { key: 'pipeline', label: 'My pipeline', sub: 'Every client you own', color: 'purple', glyph: '📈', onOpen: () => navigate('/app/sales/pipeline') },
    { key: 'sitevisit', label: 'Site visit', sub: 'Coming in a later phase', color: 'teal', glyph: '📍' },
    { key: 'enquiry', label: 'Client enquiry', sub: 'Coming in a later phase', color: 'blue', glyph: '❓' },
    { key: 'referrals', label: 'Referrals', sub: 'Coming in a later phase', color: 'orange', glyph: '🎁' },
  ];

  return (
    <div style={{ padding: '20px 16px 90px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Sales</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20, fontSize: 13.5 }}>Leads, pipeline &amp; client touchpoints</p>
      <TileGrid items={items} />
    </div>
  );
}
