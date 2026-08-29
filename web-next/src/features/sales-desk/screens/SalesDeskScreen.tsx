import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { TileGrid, type TileItem } from '../../../shared/ui/TileGrid';

// Port of salesDeskGroupsForAgent()'s items (index.html:8843-8860) --
// "My pipeline" is the only tile actually wired for Phase 2; the rest are
// visible-but-inert placeholders naming what's still to come, matching the
// plan's phase-by-phase scoping instead of building all of Sales Desk at once.
export function SalesDeskScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const hasPlotAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel');

  const items: TileItem[] = [
    { key: 'pipeline', label: 'My pipeline', sub: 'Every client you own', color: 'purple', glyph: '📈', onOpen: () => navigate('/app/sales/pipeline') },
    { key: 'clients', label: 'Client Database', sub: 'Search & browse by client', color: 'blue', glyph: '🗂️', onOpen: () => navigate('/app/sales/clients') },
    ...(hasPlotAccess
      ? [{ key: 'plots', label: 'Plot Inventory', sub: 'Browse every plot & status', color: 'green', glyph: '🗺️', onOpen: () => navigate('/app/sales/plots') } satisfies TileItem]
      : []),
    { key: 'sitevisit', label: 'Site visit', sub: 'Log & review client visits', color: 'teal', glyph: '📍', onOpen: () => navigate('/app/sales/sitevisits') },
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
