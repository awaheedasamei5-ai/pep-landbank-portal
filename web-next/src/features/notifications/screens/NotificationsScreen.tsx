import { useNavigate } from 'react-router';
import type { ChatMessage } from '../../../types/domain';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '../hooks/useNotifications';
import styles from './NotificationsScreen.module.css';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
}

// Every notification kind's real target route -- extend this map, not the
// row-click handler, whenever a new kind starts calling notify(). refId is
// the allocation_requests.id (or whatever refType names); the Allocations
// screen itself does the actual scroll-to/open, so this only needs to land
// on the right list.
function targetRoute(n: ChatMessage): string | null {
  if (n.refType === 'allocation_request') return '/app/sales/allocations';
  return null;
}

// Master Spec 7.5's in-app half of "Management receives in-app
// notification + SMS that an allocation request is awaiting review" --
// reuses the same real `messages` table chat.* already reads, filtered to
// kind IS NOT NULL rows (see notifications.* in data/source.ts). A fresh,
// dedicated inbox screen rather than folding into Chat, since a system
// notification has no thread/reply concept and a different visual weight.
export function NotificationsScreen() {
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  function openNotification(n: ChatMessage) {
    if (!n.read) markRead.mutate(n.id);
    const to = targetRoute(n);
    if (to) navigate(to);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Notifications</h1>
          <p className={styles.sub}>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className={styles.markAllBtn} disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {notifications && notifications.length === 0 && !isLoading && <p className={styles.emptyMsg}>Nothing here yet -- system alerts (like an allocation awaiting your review) will show up here.</p>}

      <div className={styles.list}>
        {notifications?.map((n) => (
          <button key={n.id} type="button" className={`${styles.row} ${n.read ? '' : styles.rowUnread}`} onClick={() => openNotification(n)}>
            {!n.read && <span className={styles.dot} />}
            <div className={styles.rowMain}>
              <div className={styles.rowTop}>
                <span className={styles.sender}>{n.senderName}</span>
                <span className={styles.time}>{fmtTime(n.createdAt)}</span>
              </div>
              <div className={styles.body}>{n.body}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
