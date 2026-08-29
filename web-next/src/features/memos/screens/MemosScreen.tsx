import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useDeleteMemo, useDraftMemos, useMarkMemoRead, useReceivedMemos, useSendMemo, useSentMemos } from '../hooks/useMemos';
import styles from './MemosScreen.module.css';

type Tab = 'received' | 'sent' | 'drafts';

// Real tables `memos`/`memo_recipients` -- see the Memo type's comment in
// types/domain.ts for the full RLS/draft/CC shape this mirrors. Delete is
// only offered where production RLS would actually allow it (sender, or
// manager on a direct-received item) -- memo_recipients has no DELETE
// policy at all, so a CC'd item never gets a delete action here.
export function MemosScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const [tab, setTab] = useState<Tab>('received');
  const [expanded, setExpanded] = useState<string | null>(null);

  const received = useReceivedMemos();
  const sent = useSentMemos();
  const drafts = useDraftMemos();
  const sendMemo = useSendMemo();
  const deleteMemo = useDeleteMemo();
  const markRead = useMarkMemoRead();

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  const counts = { received: received.data?.length ?? 0, sent: sent.data?.length ?? 0, drafts: drafts.data?.length ?? 0 };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Memorandum</h1>
          <p className={styles.sub}>Internal correspondence</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/app/office/memos/new')}>
          + Compose
        </button>
      </div>

      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${tab === 'received' ? styles.tabActive : ''}`} onClick={() => setTab('received')}>
          Received ({counts.received})
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'sent' ? styles.tabActive : ''}`} onClick={() => setTab('sent')}>
          Sent ({counts.sent})
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'drafts' ? styles.tabActive : ''}`} onClick={() => setTab('drafts')}>
          Drafts ({counts.drafts})
        </button>
      </div>

      {tab === 'received' &&
        (received.data?.length ? (
          received.data.map((item) => {
            const isOpen = expanded === item.memo.id;
            const isRead = item.viaCC ? false : item.memo.read;
            const canDelete = isManager && !item.viaCC;
            return (
              <div className={styles.card} key={item.memo.id + (item.recipientRowId ?? '')}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => {
                    toggle(item.memo.id);
                    if (!isOpen) markRead.mutate(item);
                  }}
                >
                  <div>
                    <div className={styles.subject}>
                      {!isRead && <span className={styles.unreadDot} />}
                      {item.memo.subject}
                      {item.viaCC && <span className={styles.ccBadge}>CC</span>}
                    </div>
                    <div className={styles.meta}>From {item.memo.fromName}</div>
                  </div>
                  <div className={styles.date}>{item.memo.createdAt.slice(0, 10)}</div>
                </button>
                {isOpen && (
                  <>
                    <div className={styles.body}>{item.memo.bodyHtml}</div>
                    {canDelete && (
                      <div className={styles.actions}>
                        <button type="button" className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => deleteMemo.mutate(item.memo.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        ) : (
          <p style={{ color: 'var(--muted)' }}>Nothing received yet.</p>
        ))}

      {tab === 'sent' &&
        (sent.data?.length ? (
          sent.data.map((m) => {
            const isOpen = expanded === m.id;
            return (
              <div className={styles.card} key={m.id}>
                <button type="button" className={styles.row} onClick={() => toggle(m.id)}>
                  <div>
                    <div className={styles.subject}>{m.subject}</div>
                    <div className={styles.meta}>To {m.toName}</div>
                  </div>
                  <div className={styles.date}>{m.createdAt.slice(0, 10)}</div>
                </button>
                {isOpen && (
                  <>
                    <div className={styles.body}>{m.bodyHtml}</div>
                    <div className={styles.actions}>
                      <button type="button" className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => deleteMemo.mutate(m.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <p style={{ color: 'var(--muted)' }}>Nothing sent yet.</p>
        ))}

      {tab === 'drafts' &&
        (drafts.data?.length ? (
          drafts.data.map((m) => {
            const isOpen = expanded === m.id;
            return (
              <div className={styles.card} key={m.id}>
                <button type="button" className={styles.row} onClick={() => toggle(m.id)}>
                  <div>
                    <div className={styles.subject}>{m.subject || '(no subject)'}</div>
                    <div className={styles.meta}>To {m.toName}</div>
                  </div>
                  <div className={styles.date}>{m.createdAt.slice(0, 10)}</div>
                </button>
                {isOpen && (
                  <>
                    <div className={styles.body}>{m.bodyHtml}</div>
                    <div className={styles.actions}>
                      <button type="button" className={`${styles.actionBtn} ${styles.sendBtn}`} onClick={() => sendMemo.mutate(m.id)} disabled={sendMemo.isPending}>
                        Send
                      </button>
                      <button type="button" className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => deleteMemo.mutate(m.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <p style={{ color: 'var(--muted)' }}>No drafts.</p>
        ))}
    </div>
  );
}
