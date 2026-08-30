import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useCanManageCompanyLeads } from '../../company-leads/hooks/useCompanyLeads';
import { TileGrid, type TileItem } from '../../../shared/ui/TileGrid';

// Port of salesDeskGroupsForAgent()'s items (index.html:8843-8860) --
// "My pipeline" is the only tile actually wired for Phase 2; the rest are
// visible-but-inert placeholders naming what's still to come, matching the
// plan's phase-by-phase scoping instead of building all of Sales Desk at once.
export function SalesDeskScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const hasPlotAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel');
  const canManageCompanyLeads = useCanManageCompanyLeads();

  const items: TileItem[] = [
    { key: 'pipeline', label: 'My pipeline', sub: 'Every client you own', color: 'purple', icon: 'chartLine', onOpen: () => navigate('/app/sales/pipeline') },
    { key: 'clients', label: 'Client Database', sub: 'Search & browse by client', color: 'blue', icon: 'folder', onOpen: () => navigate('/app/sales/clients') },
    ...(hasPlotAccess
      ? [{ key: 'plots', label: 'Plot Inventory', sub: 'Browse every plot & status', color: 'green', icon: 'map', onOpen: () => navigate('/app/sales/plots') } satisfies TileItem]
      : []),
    ...(hasPlotAccess
      ? [{ key: 'allocations', label: 'Allocations', sub: 'Request & confirm plot allocations', color: 'orange', icon: 'ruler', onOpen: () => navigate('/app/sales/allocations') } satisfies TileItem]
      : []),
    { key: 'sitevisit', label: 'Site visit', sub: 'Log & review client visits', color: 'teal', icon: 'pin', onOpen: () => navigate('/app/sales/sitevisits') },
    { key: 'enquiry', label: 'Client enquiry', sub: 'Log what prospects ask about', color: 'blue', icon: 'question', onOpen: () => navigate('/app/sales/enquiries') },
    { key: 'referrals', label: 'Referrals', sub: 'Track who your clients bring in', color: 'orange', icon: 'gift', onOpen: () => navigate('/app/sales/referrals') },
    { key: 'complaints', label: 'Complaints', sub: 'Log & resolve client issues', color: 'red', icon: 'warning', onOpen: () => navigate('/app/sales/complaints') },
    ...(canManageCompanyLeads
      ? [{ key: 'companyleads', label: 'Company Leads', sub: 'Leads shared company-wide, not tied to one agent', color: 'purple', icon: 'building', onOpen: () => navigate('/app/sales/company-leads') } satisfies TileItem]
      : []),
  ];

  return (
    <div style={{ padding: '20px 16px 90px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Sales</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 20, fontSize: 13.5 }}>Leads, pipeline &amp; client touchpoints</p>
      <TileGrid items={items} />
    </div>
  );
}
