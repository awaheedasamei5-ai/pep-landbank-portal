import { NavLink } from 'react-router';
import { useSessionStore } from '../../auth/useSessionStore';
import { useConversations } from '../../features/chat/hooks/useChat';
import { Icon, type IconName } from './Icon';
import styles from './BottomNav.module.css';

// Port of computeNavTabDefs()'s agent/manager tab list (index.html:8280-8286).
export function BottomNav() {
  const role = useSessionStore((s) => s.profile?.role);
  const isMgr = role === 'manager';
  const { data: conversations } = useConversations();
  const unreadTotal = conversations?.reduce((s, c) => s + c.unreadCount, 0) ?? 0;

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
          <span className={styles.iconWrap}>
            <Icon name={t.icon} />
            {t.key === 'chat' && unreadTotal > 0 && <span className={styles.badge}>{unreadTotal > 9 ? '9+' : unreadTotal}</span>}
          </span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
