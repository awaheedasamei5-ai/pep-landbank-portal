import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useConversations, useMarkThreadRead, useSendMessage, useThread } from '../hooks/useChat';
import styles from './ChatThreadScreen.module.css';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatThreadScreen() {
  const { otherKey } = useParams<{ otherKey: string }>();
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const { data: messages } = useThread(otherKey ?? '');
  const { data: conversations } = useConversations();
  const { data: staff } = useStaffDirectory();
  const sendMessage = useSendMessage();
  const markRead = useMarkThreadRead(otherKey ?? '');
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const otherName = conversations?.find((c) => c.otherKey === otherKey)?.otherName ?? staff?.find((s) => s.key === otherKey)?.name ?? otherKey;

  useEffect(() => {
    if (otherKey) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  function handleSend() {
    if (!draft.trim() || !otherKey) return;
    sendMessage.mutate({ otherKey, body: draft.trim() });
    setDraft('');
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/app/chat')} aria-label="Back">
          ←
        </button>
        <div className={styles.headName}>{otherName}</div>
      </div>

      <div className={styles.messages}>
        {messages?.map((m) => {
          const mine = m.senderKey === profile?.key;
          return (
            <div className={`${styles.bubbleRow} ${mine ? styles.bubbleRowMine : ''}`} key={m.id}>
              <div className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                {m.body}
                <span className={styles.bubbleTime}>{fmtTime(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.input}
          rows={1}
          placeholder="Message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button type="button" className={styles.sendBtn} onClick={handleSend} disabled={!draft.trim() || sendMessage.isPending}>
          ➤
        </button>
      </div>
    </div>
  );
}
