import { NavLink } from 'react-router';
import { useSessionStore } from '../../auth/useSessionStore';
import { Icon, type IconName } from './Icon';
import styles from './BottomNav.module.css';

// Port of computeNavTabDefs()'s agent/manager tab list (index.html:8280-8286).
// Badges (unread counts etc.) are out of scope for Phase 1's stub tabs.
export function BottomNav() {
  const role = useSessionStore((s) => s.profile?.role);
  const isMgr = role === 'manager';

  const tabs: { key: string; label: string; icon: IconName; to: string }[] = [
    { key: 'home', label: 'Home', icon: 'home', to: isMgr ? '/app/mgr' : '/app/home' },
    { key: 'sales', label: 'Sales', icon: 'briefcase2', to: '/app/sales' },
    { key: 'office', label: 'Office', icon: 'desk', to: '/app/office' },
    { key: 'chat', label: 'Chat', icon: 'chat', to: '/app/chat' },
    { key: 'more', label: 'More', icon: 'more', to: '/app/more' },
  ];

  return (
    <nav className={styles.nav}>
      {tabs.map((t) => (
        <NavLink key={t.key} to={t.to} className={({ isActive }) => `${styles.tab} ${isActive ? styles.on : ''}`}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
