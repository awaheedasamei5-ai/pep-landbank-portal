"use client";

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/submit-button';
import type { SuggestedNote } from '../lib/attendanceRosterLogic';

// Master Spec 11.3 -- the judgement (is this pattern note-worthy) comes
// from real counted data (attendanceRosterLogic.ts), never a language
// model's guess. The AI's only real job is drafting the wording; here
// Management can still edit that draft or dismiss it outright before
// anything is written to attendance_notes -- never a blind one-click
// approve. Rebuilt on the shell's real Card/Textarea after the
// 2026-10-08/09 correction.
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
    <Card>
      <CardHeader>
        <CardTitle>Suggested notes</CardTitle>
        <p className="text-sm text-muted-foreground">Detected from the last 10 working days&apos; real attendance data — review, edit, or dismiss each before it&apos;s issued.</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {visible.map((s) => {
          const k = keyOf(s);
          return (
            <div key={k} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant={s.kind === 'warning' ? 'destructive' : 'default'}>{s.kind === 'warning' ? 'Suggested warning' : 'Suggested praise'}</Badge>
                <span className="text-sm font-medium">{s.staffName}</span>
              </div>
              <Textarea value={drafts[k] ?? s.reason} onChange={(e) => setDrafts((prev) => ({ ...prev, [k]: e.target.value }))} rows={3} />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDismissed((prev) => new Set(prev).add(k))} disabled={busy === k}>
                  Dismiss
                </Button>
                <SubmitButton type="button" size="sm" loading={busy === k} onClick={() => handleIssue(s)}>
                  Issue {s.kind}
                </SubmitButton>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
