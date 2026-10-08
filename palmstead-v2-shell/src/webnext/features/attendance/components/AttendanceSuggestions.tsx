"use client";

import { useState } from 'react';
import type { SuggestedNote } from '../lib/attendanceRosterLogic';
import styles from './AttendanceSuggestions.module.css';

// Master Spec 11.3 -- the judgement (is this pattern note-worthy) comes
// from real counted data (attendanceRosterLogic.ts), never a language
// model's guess. The AI's only real job is drafting the wording; here
// Management can still edit that draft or dismiss it outright before
// anything is written to attendance_notes -- never a blind one-click
// approve.
export function AttendanceSuggestions({
  suggestions,
  onIssue,
}: {
  suggestions: SuggestedNote[];
  onIssue: (s: SuggestedNote, editedReason: string) => Promise<void>;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const keyOf = (s: SuggestedNote) => `${s.staffKey}:${s.kind}:${s.workDate}`;
  const visible = suggestions.filter((s) => !dismissed.has(keyOf(s)));
  if (!visible.length) return null;

  async function handleIssue(s: SuggestedNote) {
    const k = keyOf(s);
    setBusy(k);
    try {
      await onIssue(s, drafts[k] ?? s.reason);
      setDismissed((prev) => new Set(prev).add(k));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <h3>Suggested notes</h3>
      <p className={styles.sub}>Detected from the last 10 working days' real attendance data — review, edit, or dismiss each before it's issued.</p>
      <div className={styles.list}>
        {visible.map((s) => {
          const k = keyOf(s);
          return (
            <div key={k} className={`${styles.card} ${s.kind === 'warning' ? styles.warning : styles.praise}`}>
              <div className={styles.cardTop}>
                <span className={styles.badge}>{s.kind === 'warning' ? 'Suggested warning' : 'Suggested praise'}</span>
                <span className={styles.staffName}>{s.staffName}</span>
              </div>
              <textarea
                className={styles.textarea}
                value={drafts[k] ?? s.reason}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [k]: e.target.value }))}
                rows={3}
              />
              <div className={styles.actions}>
                <button type="button" className={styles.dismissBtn} onClick={() => setDismissed((prev) => new Set(prev).add(k))} disabled={busy === k}>
                  Dismiss
                </button>
                <button type="button" className={styles.issueBtn} onClick={() => handleIssue(s)} disabled={busy === k}>
                  {busy === k ? 'Issuing…' : `Issue ${s.kind}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
