"use client";

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/submit-button';
import type { AttendanceException } from '../../../types/domain';

const TYPE_LABELS: Record<string, string> = {
  errand: 'Errand',
  site_visit: 'Site visit',
  field_assignment: 'Field assignment',
  other: 'Other',
};

// Attendance plan Part 4 -- "a staff member's one-off exception request
// ... a real, small queue to clear, not something that has to become a
// whole leave day". Rebuilt on the shell's real Badge/Button after the
// 2026-10-08/09 correction.
export function AttendanceExceptionsQueue({
  pending,
  onDecide,
}: {
  pending: AttendanceException[];
  onDecide: (id: string, status: 'approved' | 'declined') => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, status: 'approved' | 'declined') {
    setBusy(id);
    try {
      await onDecide(id, status);
    } finally {
      setBusy(null);
    }
  }

  if (!pending.length) return <p className="text-sm text-muted-foreground">No exception requests waiting.</p>;

  return (
    <div className="grid gap-3">
      {pending.map((exc) => (
        <div key={exc.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-56 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-medium">{exc.staffName}</strong>
              <Badge variant="outline">{TYPE_LABELS[exc.exceptionType] ?? exc.exceptionType}</Badge>
              <span className="text-xs text-muted-foreground">{exc.exceptionDate}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{exc.reason}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy === exc.id} onClick={() => decide(exc.id, 'declined')}>
              Decline
            </Button>
            <SubmitButton type="button" size="sm" loading={busy === exc.id} onClick={() => decide(exc.id, 'approved')}>
              Approve
            </SubmitButton>
          </div>
        </div>
      ))}
    </div>
  );
}
