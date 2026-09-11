import { NavLink } from 'react-router';
import styles from './SegmentedTabs.module.css';

export interface SegmentedTabItem {
  key: string;
  label: string;
  to: string;
  end?: boolean;
}

// First reusable tabbed-shell primitive in web-next -- built for
// Operations Tracker (Master Spec Section 10's "My Day/Week/Month/Team
// Schedule/Task Board/Meetings" reading as one app, not six separate
// sidebar entries), but deliberately generic so any future hub screen
// can reuse it instead of each hand-rolling its own tab bar. Route-driven
// (NavLink), not local useState, so the active tab survives a refresh and
// each tab is a real, bookmarkable URL.
export function SegmentedTabs({ items }: { items: SegmentedTabItem[] }) {
  return (
    <div className={styles.wrap} role="tablist">
      {items.map((item) => (
        <NavLink key={item.key} to={item.to} end={item.end} className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
