import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useConversations, useMarkThreadRead, useSendMessage, useThread } from '../hooks/useChat';
import type { ChatMessage } from '../../../types/domain';
import styles from './ChatThreadScreen.module.css';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function snippet(body: string, max = 60): string {
  return body.length > max ? `${body.slice(0, max)}…` : body;
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
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const otherName = conversations?.find((c) => c.otherKey === otherKey)?.otherName ?? staff?.find((s) => s.key === otherKey)?.name ?? otherKey;
  const messagesById = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);

  useEffect(() => {
    if (otherKey) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  function handleSend() {
    if (!draft.trim() || !otherKey) return;
    sendMessage.mutate({ otherKey, body: draft.trim(), replyToId: replyTarget?.id ?? null });
    setDraft('');
    setReplyTarget(null);
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
          const quoted = m.replyToId ? messagesById.get(m.replyToId) : null;
          return (
            <div className={`${styles.bubbleRow} ${mine ? styles.bubbleRowMine : ''}`} key={m.id}>
              <div className={styles.bubbleGroup}>
                {quoted && (
                  <div className={styles.quoteStrip}>
                    <span className={styles.quoteSender}>{quoted.senderKey === profile?.key ? 'You' : quoted.senderName}</span>
                    <span className={styles.quoteBody}>{snippet(quoted.body)}</span>
                  </div>
                )}
                <div className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                  {m.body}
                  <span className={styles.bubbleTime}>{fmtTime(m.createdAt)}</span>
                </div>
                <button type="button" className={styles.replyBtn} onClick={() => setReplyTarget(m)} aria-label="Reply">
                  ↩ Reply
                </button>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {replyTarget && (
        <div className={styles.replyPreview}>
          <div className={styles.replyPreviewText}>
            <span className={styles.quoteSender}>Replying to {replyTarget.senderKey === profile?.key ? 'yourself' : replyTarget.senderName}</span>
            <span className={styles.quoteBody}>{snippet(replyTarget.body)}</span>
          </div>
          <button type="button" className={styles.replyCancelBtn} onClick={() => setReplyTarget(null)} aria-label="Cancel reply">
            ✕
          </button>
        </div>
      )}

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
