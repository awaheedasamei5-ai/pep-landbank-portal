import { useState } from 'react';
import { useOpsCompanionAnswer, type OpsCompanionContext, type OpsCompanionQuestion } from '../hooks/useOpsCompanion';
import styles from './OpsCompanionPanel.module.css';

const QUESTIONS: { key: OpsCompanionQuestion; label: string; emoji: string }[] = [
  { key: 'today_focus', label: 'What should I focus on right now?', emoji: '🎯' },
  { key: 'week_load', label: 'Is my week looking overloaded?', emoji: '📊' },
  { key: 'whats_next', label: "What's coming up next?", emoji: '📅' },
];

// Structural copy of features/companion/components/CompanionPanel.tsx's
// real, already-proven pattern for the Operations Tracker: fixed question
// buttons (never free-text chat), lazily fetched on tap, aggregate-counts
// context only (see useOpsCompanion.ts).
export function OpsCompanionPanel({ ctx }: { ctx: OpsCompanionContext }) {
  const [opened, setOpened] = useState<Set<OpsCompanionQuestion>>(new Set());

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.aiBadge}>AI</span>
        <span className={styles.title}>Your ops companion</span>
      </div>
      <div className={styles.answers}>
        {QUESTIONS.map((q) => (
          <CompanionAnswer key={q.key} question={q.key} label={q.label} emoji={q.emoji} ctx={ctx} enabled={opened.has(q.key)} onAsk={() => setOpened((prev) => new Set(prev).add(q.key))} />
        ))}
      </div>
    </div>
  );
}

function CompanionAnswer({ question, label, emoji, ctx, enabled, onAsk }: { question: OpsCompanionQuestion; label: string; emoji: string; ctx: OpsCompanionContext; enabled: boolean; onAsk: () => void }) {
  const { data: answer, isFetching } = useOpsCompanionAnswer(question, ctx, enabled);

  if (!enabled) {
    return (
      <button type="button" className={styles.askBtn} onClick={onAsk}>
        <span className={styles.askEmoji}>{emoji}</span>
        {label}
      </button>
    );
  }

  return (
    <div className={styles.answerRow}>
      <div className={styles.answerQ}>
        <span className={styles.answerEmoji}>{emoji}</span>
        {label}
      </div>
      {isFetching && !answer && (
        <div className={styles.thinking}>
          <span className={styles.thinkingDot} />
          <span className={styles.thinkingDot} />
          <span className={styles.thinkingDot} />
        </div>
      )}
      {answer && <div className={styles.answerText}>{answer}</div>}
      {!isFetching && !answer && <div className={styles.answerLoading}>Companion is unavailable right now.</div>}
    </div>
  );
}
