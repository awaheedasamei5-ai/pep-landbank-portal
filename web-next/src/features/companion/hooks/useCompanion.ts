import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';

export type CompanionQuestion = 'next_action' | 'month_progress' | 'pipeline_health';

export interface CompanionContext {
  leadCount: number;
  pipelineValue: number;
  coldCount: number;
  nearTriggerCount: number;
  readyForAllocationCount: number;
  stalledHighCount: number;
  collectedThisMonth: number;
  collectedLastMonth: number;
  forecastNextMonth: number | null;
}

// Real per-agent "ask your companion" answers, via the shared ai-insights
// function (kind='companion_qa', added 2026-09-04). Deliberately NOT
// free-text chat: `question` is one of three fixed values the UI picks
// via buttons, never something the user types -- so this can never
// become a channel for leaking a client's name/phone/payment details
// into the model, matching the master spec's privacy rule exactly the
// same way streak coaching / manager briefing already do (aggregate
// counts and this agent's own name only, never a client's). Each
// question is its own query, fetched lazily on tap (`enabled`) rather
// than all three firing at once on page load.
export function useCompanionAnswer(question: CompanionQuestion, ctx: CompanionContext | undefined, enabled: boolean) {
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['companionAnswer', question, profile?.key, ctx],
    enabled: enabled && !!ctx && !!profile,
    staleTime: 1000 * 60 * 15,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !ctx || !profile) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'companion_qa',
          context: {
            question,
            agentName: profile.name,
            leadCount: ctx.leadCount,
            pipelineValue: ctx.pipelineValue,
            coldCount: ctx.coldCount,
            nearTriggerCount: ctx.nearTriggerCount,
            readyForAllocationCount: ctx.readyForAllocationCount,
            stalledHighCount: ctx.stalledHighCount,
            collectedThisMonth: ctx.collectedThisMonth,
            collectedLastMonth: ctx.collectedLastMonth,
            forecastNextMonth: ctx.forecastNextMonth,
          },
        },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
