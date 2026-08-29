import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useConversations } from '../hooks/useChat';
import styles from './ChatScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// 1:1 staff-to-staff only (confirmed live: real production chat has no
// group/company-wide channel) -- reuses the same real `messages` table
// production's own Team Chat uses, kind IS NULL rows only. See the
// ChatMessage type's comment in types/domain.ts.
export function ChatScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const { data: conversations, isLoading } = useConversations();
  const { data: staff } = useStaffDirectory();
  const [picking, setPicking] = useState(false);

  const existingKeys = new Set(conversations?.map((c) => c.otherKey) ?? []);
  const pickable = (staff ?? []).filter((s) => s.key !== profile?.key && !existingKeys.has(s.key));

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Chat</h1>
          <p className={styles.sub}>{conversations?.length ?? 0} conversations</p>
        </div>
        <button type="button" className={styles.newBtn} onClick={() => setPicking((p) => !p)}>
          + New chat
        </button>
      </div>

      {picking && (
        <div className={styles.pickerCard}>
          {pickable.length === 0 && <p style={{ color: 'var(--muted)', margin: '8px 12px', fontSize: 13 }}>Everyone's already in your conversation list.</p>}
          {pickable.map((s) => (
            <button key={s.key} type="button" className={styles.pickerRow} onClick={() => navigate(`/app/chat/${s.key}`)}>
              {s.name} {s.role === 'manager' ? '(Management)' : ''}
            </button>
          ))}
        </div>
      )}

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {conversations?.map((c) => (
        <div className={styles.row} key={c.otherKey} onClick={() => navigate(`/app/chat/${c.otherKey}`)} role="button" tabIndex={0}>
          <div className={styles.avatar}>{initials(c.otherName)}</div>
          <div className={styles.info}>
            <div className={styles.name}>{c.otherName}</div>
            {c.lastMessage && <div className={styles.preview}>{c.lastMessage.senderKey === profile?.key ? 'You: ' : ''}{c.lastMessage.body}</div>}
          </div>
          <div className={styles.right}>
            {c.lastMessage && <div className={styles.time}>{fmtTime(c.lastMessage.createdAt)}</div>}
            {c.unreadCount > 0 && <div className={styles.unread}>{c.unreadCount}</div>}
          </div>
        </div>
      ))}
      {conversations && conversations.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>No conversations yet -- start one above.</p>}
    </div>
  );
}
