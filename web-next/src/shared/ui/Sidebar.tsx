import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { useSessionStore } from '../../auth/useSessionStore';
import { useConversations } from '../../features/chat/hooks/useChat';
import { useCanManageCompanyLeads } from '../../features/company-leads/hooks/useCompanyLeads';
import { useCanLogPayments } from '../../features/payments/hooks/useLogPayment';
import { useCanManageExpenses } from '../../features/expenses/hooks/useFundRequests';
import { useCanViewSiteVisitAuth } from '../../features/site-visit-auth/hooks/useSiteVisitAuth';
import { useCanViewStaffReport } from '../../features/staff-report/hooks/useStaffReport';
import { Icon, type IconName } from './Icon';
import styles from './Sidebar.module.css';

interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: IconName;
  badge?: number;
}
interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

// Master Spec ("Premium UI Rebuild"), Section 5's required desktop nav
// model: "Persistent left sidebar with brand, primary modules, collapsible
// section groups, active route indicator... Main content gets the full
// remaining canvas" -- replacing bottom-tab dominance on desktop, which
// this app had zero responsive alternative to before this. Item lists and
// role gates are copied verbatim from SalesDeskScreen/OfficeDeskScreen's
// own TileGrid definitions (the existing, already-correct source of
// truth for what each role can reach) rather than re-derived, so the
// sidebar can never drift from what those hub screens actually allow.
export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const logout = useSessionStore((s) => s.logout);
  const isMgr = profile?.role === 'manager';
  const { data: conversations } = useConversations();
  const unreadTotal = conversations?.reduce((s, c) => s + c.unreadCount, 0) ?? 0;

  const hasPlotAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel');
  const canManageCompanyLeads = useCanManageCompanyLeads();
  const canLogPayments = useCanLogPayments();
  const canManageExpenses = useCanManageExpenses();
  const canViewSiteVisitAuth = useCanViewSiteVisitAuth();
  const canViewStaffReport = useCanViewStaffReport();

  const groups: NavGroup[] = [
    {
      key: 'overview',
      label: 'Overview',
      items: [{ key: 'home', label: 'Home', to: isMgr ? '/app/mgr' : '/app/home', icon: 'home' }],
    },
    {
      key: 'sales',
      label: 'Sales',
      items: [
        { key: 'pipeline', label: 'My Pipeline', to: '/app/sales/pipeline', icon: 'chartLine' },
        { key: 'clients', label: 'Client Database', to: '/app/sales/clients', icon: 'folder' },
        ...(hasPlotAccess ? [{ key: 'plots', label: 'Plot Inventory', to: '/app/sales/plots', icon: 'map' as IconName }] : []),
        ...(hasPlotAccess ? [{ key: 'allocations', label: 'Allocations', to: '/app/sales/allocations', icon: 'ruler' as IconName }] : []),
        { key: 'sitevisits', label: 'Site Visits', to: '/app/sales/sitevisits', icon: 'pin' },
        { key: 'enquiries', label: 'Enquiries', to: '/app/sales/enquiries', icon: 'question' },
        { key: 'referrals', label: 'Referrals', to: '/app/sales/referrals', icon: 'gift' },
        { key: 'complaints', label: 'Complaints', to: '/app/sales/complaints', icon: 'warning' },
        ...(canManageCompanyLeads ? [{ key: 'companyleads', label: 'Company Leads', to: '/app/sales/company-leads', icon: 'building' as IconName }] : []),
      ],
    },
    {
      key: 'office',
      label: 'Office',
      items: [
        { key: 'myday', label: 'My Day', to: '/app/office/myday', icon: 'checklist' },
        { key: 'tasks', label: 'Task Board', to: '/app/office/tasks', icon: 'checklist' },
        { key: 'memos', label: 'Memorandum', to: '/app/office/memos', icon: 'note' },
        { key: 'attendance', label: 'Attendance', to: '/app/office/attendance', icon: 'check' },
        ...(canLogPayments ? [{ key: 'payments', label: 'Log Payment', to: '/app/office/payments', icon: 'card' as IconName }] : []),
        { key: 'contracts', label: 'Contract Requests', to: '/app/office/contracts', icon: 'document' },
        { key: 'quotation', label: 'Quotation', to: '/app/office/quotation', icon: 'calculator' },
        { key: 'leave', label: 'Leave', to: '/app/office/leave', icon: 'palm' },
        { key: 'notes', label: 'Notes', to: '/app/office/notes', icon: 'notepad' },
        { key: 'banners', label: 'Banner Tracking', to: '/app/office/banners', icon: 'pin' },
        ...(canManageExpenses ? [{ key: 'expenses', label: 'Expenses', to: '/app/office/expenses', icon: 'wallet' as IconName }] : []),
        ...(canViewSiteVisitAuth ? [{ key: 'sitevisitauth', label: 'Site Visit Authorization', to: '/app/office/sitevisitauth', icon: 'ruler' as IconName }] : []),
        ...(canViewStaffReport ? [{ key: 'staffreport', label: 'Staff Report', to: '/app/office/staffreport', icon: 'team' as IconName }] : []),
      ],
    },
    {
      key: 'comms',
      label: 'Communication',
      items: [
        { key: 'chat', label: 'Chat', to: '/app/chat', icon: 'chat', badge: unreadTotal },
      ],
    },
    {
      key: 'insights',
      label: 'Insights',
      items: [
        { key: 'smartinsights', label: 'Smart Insights', to: '/app/insights', icon: 'bulb' },
        { key: 'datacheck', label: 'Data Check', to: '/app/data-check', icon: 'check' },
        { key: 'vault', label: 'Document Vault', to: '/app/vault', icon: 'document' },
        { key: 'portfolio', label: 'My Portfolio', to: '/app/portfolio', icon: 'trophy' },
        { key: 'commission', label: isMgr ? 'Commission' : 'My Commission', to: isMgr ? '/app/mgr/commission' : '/app/commission', icon: 'wallet' },
        ...(isMgr
          ? [
              { key: 'analytics', label: 'Analytics', to: '/app/mgr/analytics', icon: 'barChart' as IconName },
              { key: 'reports', label: 'Reports', to: '/app/mgr/reports', icon: 'document' as IconName },
              { key: 'leaderboard', label: 'Leaderboard', to: '/app/mgr/leaderboard', icon: 'trophy' as IconName },
            ]
          : []),
      ],
    },
    ...(isMgr
      ? [
          {
            key: 'management',
            label: 'Management',
            items: [
              { key: 'mgrpipeline', label: 'Company Pipeline', to: '/app/mgr/pipeline', icon: 'chartLine' as IconName },
              { key: 'team', label: 'Team Roster', to: '/app/mgr/team', icon: 'team' as IconName },
              { key: 'health', label: 'System Health', to: '/app/mgr/health', icon: 'shield' as IconName },
              { key: 'settings', label: 'Settings', to: '/app/mgr/settings', icon: 'settings' as IconName },
            ],
          },
        ]
      : []),
  ];

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  function isGroupActive(g: NavGroup): boolean {
    return g.items.some((i) => location.pathname === i.to || (i.to !== '/app/home' && i.to !== '/app/mgr' && location.pathname.startsWith(i.to + '/')));
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  if (!profile) return null;

  return (
    <nav className={styles.sidebar} aria-label="Primary">
      <div className={styles.brand}>
        <div className={styles.brandMark}>P</div>
        <span className={styles.brandName}>Palmstead</span>
      </div>

      <div className={styles.scroll}>
        {groups.map((g) => {
          const active = isGroupActive(g);
          const isOpen = collapsed[g.key] === undefined ? true : !collapsed[g.key];
          return (
            <div className={styles.group} key={g.key}>
              <button
                type="button"
                className={`${styles.groupHead} ${active ? styles.groupHeadActive : ''}`}
                onClick={() => setCollapsed((c) => ({ ...c, [g.key]: isOpen }))}
                aria-expanded={isOpen}
              >
                <span>{g.label}</span>
                <span className={`${styles.chev} ${isOpen ? styles.chevOpen : ''}`}>
                  <Icon name="chevronDown" size={14} />
                </span>
              </button>
              {isOpen && (
                <div className={styles.items}>
                  {g.items.map((item) => (
                    <NavLink key={item.key} to={item.to} className={({ isActive }) => `${styles.item} ${isActive ? styles.itemOn : ''}`}>
                      <span className={styles.itemIcon}>
                        <Icon name={item.icon} size={18} />
                      </span>
                      <span className={styles.itemLabel}>{item.label}</span>
                      {!!item.badge && <span className={styles.badge}>{item.badge > 9 ? '9+' : item.badge}</span>}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <NavLink to="/app/more" className={({ isActive }) => `${styles.item} ${styles.footerItem} ${isActive ? styles.itemOn : ''}`}>
          <span className={styles.avatar}>{profile.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')}</span>
          <span className={styles.itemLabel}>
            <span className={styles.footerName}>{profile.name}</span>
            <span className={styles.footerRole}>{isMgr ? 'Management' : 'Agent'}</span>
          </span>
        </NavLink>
        <button type="button" className={styles.logoutBtn} onClick={handleLogout} title="Sign out">
          <Icon name="logout" size={18} />
        </button>
      </div>
    </nav>
  );
}
