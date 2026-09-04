import { useState } from 'react';
import type { Lead } from '../../../types/domain';
import { getInsightLists } from '../../smart-insights/lib/smartInsightsLogic';
import { linearForecastNextMonth } from '../../../shared/lib/forecast';
import { useCompanionAnswer, type CompanionQuestion, type CompanionContext } from '../hooks/useCompanion';
import styles from './CompanionPanel.module.css';

const QUESTIONS: { key: CompanionQuestion; label: string }[] = [
  { key: 'next_action', label: "What should I focus on right now?" },
  { key: 'month_progress', label: "How's my month going?" },
  { key: 'pipeline_health', label: 'How healthy is my pipeline?' },
];

// The real per-person AI companion, upgrading Smart Insights' single
// deterministic nudge line into something an agent can actually ask
// things of -- three fixed questions (never free text, see useCompanion.
// ts for why), each answered fresh from this agent's own real, already-
// computed numbers via companion_qa. `next_action` loads immediately
// (the same "one line, always there" feel StreakCard's coaching line
// has); the other two are lazy -- tap to ask, matching a real
// conversational panel rather than three simultaneous Groq calls no one
// asked for.
export function CompanionPanel({ leads, collectedTrend, leadCount, pipelineValue }: { leads: Lead[]; collectedTrend: number[]; leadCount: number; pipelineValue: number }) {
  const [opened, setOpened] = useState<Set<CompanionQuestion>>(new Set(['next_action']));

  const { cold, nearTrigger, readyForAllocation, stalledHigh } = getInsightLists(leads);
  const collectedThisMonth = collectedTrend[collectedTrend.length - 1] ?? 0;
  const collectedLastMonth = collectedTrend[collectedTrend.length - 2] ?? 0;
  const last3 = collectedTrend.slice(-3);
  const padded3 = [last3[0] ?? 0, last3[1] ?? 0, last3[2] ?? 0] as [number, number, number];

  const ctx: CompanionContext = {
    leadCount,
    pipelineValue,
    coldCount: cold.length,
    nearTriggerCount: nearTrigger.length,
    readyForAllocationCount: readyForAllocation.length,
    stalledHighCount: stalledHigh.length,
    collectedThisMonth,
    collectedLastMonth,
    forecastNextMonth: linearForecastNextMonth(padded3),
  };

  function ask(q: CompanionQuestion) {
    setOpened((prev) => new Set(prev).add(q));
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.aiBadge}>AI</span>
        <span className={styles.title}>Your companion</span>
      </div>
      <div className={styles.answers}>
        {QUESTIONS.map((q) => (
          <CompanionAnswer key={q.key} question={q.key} label={q.label} ctx={ctx} enabled={opened.has(q.key)} onAsk={() => ask(q.key)} />
        ))}
      </div>
    </div>
  );
}

function CompanionAnswer({ question, label, ctx, enabled, onAsk }: { question: CompanionQuestion; label: string; ctx: CompanionContext; enabled: boolean; onAsk: () => void }) {
  const { data: answer, isFetching } = useCompanionAnswer(question, ctx, enabled);

  if (!enabled) {
    return (
      <button type="button" className={styles.askBtn} onClick={onAsk}>
        {label}
      </button>
    );
  }

  return (
    <div className={styles.answerRow}>
      <div className={styles.answerQ}>{label}</div>
      {isFetching && !answer && <div className={styles.answerLoading}>Thinking…</div>}
      {answer && <div className={styles.answerText}>{answer}</div>}
      {!isFetching && !answer && <div className={styles.answerLoading}>Companion is unavailable right now.</div>}
    </div>
  );
}
