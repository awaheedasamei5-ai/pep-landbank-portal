import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { redactPII } from '../../../shared/lib/redact';
import { daysSince } from '../../../shared/lib/format';
import type { Lead } from '../../../types/domain';

// Real LLM-drafted follow-up message for one lead -- kind='follow_up_draft'
// on the shared ai-insights function (added 2026-09-04), directly the
// master spec's own named safe use ("summarize long lead notes and
// recommend follow-up wording", Section 22). A mutation, not a query --
// this is an explicit "draft this for me" tap, not something that should
// auto-fire on every screen open. Notes go through redactPII first (strips
// phone-number-shaped and email-shaped runs) and the client's real name is
// never sent at all -- the model gets a {ClientName} placeholder to write
// around instead, filled back in client-side once the draft comes back.
export function useFollowUpDraft() {
  return useMutation({
    mutationFn: async (lead: Lead) => {
      const client = getSupabaseClient();
      if (!client) return null;
      const pctPaid = lead.grandTotal > 0 ? Math.round((lead.amtPaid / lead.grandTotal) * 100) : 0;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'follow_up_draft',
          context: {
            stage: lead.stage,
            daysSinceLastContact: daysSince(lead.date),
            pctPaid,
            priority: lead.priority ?? 'Normal',
            nextAction: lead.nextAction ?? '',
            notesRedacted: redactPII(lead.notes ?? ''),
          },
        },
      });
      if (error) throw error;
      const message = (data as { message?: string } | null)?.message ?? '';
      return message.replace(/\{ClientName\}/g, lead.name.split(' ')[0] || lead.name);
    },
  });
}
