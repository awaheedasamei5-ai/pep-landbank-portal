import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { redactPII } from '../../../shared/lib/redact';

// Real LLM-drafted leave request letter -- kind='leave_letter_draft' on
// the shared ai-insights function, same tap-to-generate/fill-the-textarea
// pattern as memo_draft. reason goes through the same redactPII backstop
// used everywhere else free text reaches this function.
export function useLeaveLetterDraft() {
  return useMutation({
    mutationFn: async (input: { agentName: string; daysCount: number; firstDate: string; lastDate: string; reason: string }) => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'leave_letter_draft',
          context: {
            agentName: input.agentName,
            daysCount: input.daysCount,
            firstDate: input.firstDate,
            lastDate: input.lastDate,
            reasonRedacted: redactPII(input.reason),
          },
        },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
  });
}
