import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { redactPII } from '../../../shared/lib/redact';

// Real LLM-expanded memo draft -- kind='memo_draft' on the shared
// ai-insights function, directly the master spec's own named safe use
// (Section 22: "generate draft company news/memo text for human
// approval"). A mutation the sender taps deliberately, and the result
// lands in the editable Message field rather than being sent -- the
// human review this feature's own name promises happens for free,
// since Compose Memo already has no auto-send path. brief goes through
// the same redactPII backstop as follow_up_draft.
export function useMemoDraft() {
  return useMutation({
    mutationFn: async ({ subject, brief }: { subject: string; brief: string }) => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'memo_draft', context: { subject, briefRedacted: redactPII(brief) } },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
  });
}
