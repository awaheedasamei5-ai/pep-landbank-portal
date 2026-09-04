import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { redactPII } from '../../../shared/lib/redact';
import type { FundRequestType } from '../../../types/domain';

// Real LLM-expanded expense justification -- kind='expense_justification_
// draft' on the shared ai-insights function, same tap-to-generate/fill-
// in-place pattern as memo_draft/leave_letter_draft. The requester's own
// amount is sent read-only context (the model is explicitly told never
// to touch it) -- never delegates the actual approval decision or any
// financial total, matching Section 22's guardrails exactly.
export function useExpenseJustificationDraft() {
  return useMutation({
    mutationFn: async (input: { type: FundRequestType; amount: number; note: string }) => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'expense_justification_draft', context: { type: input.type, amount: input.amount, noteRedacted: redactPII(input.note) } },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
  });
}
