import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';

// Structural copy of features/companion/hooks/useCompanion.ts's real,
// already-proven pattern (kind='companion_qa') -- fixed question buttons,
// never free-text chat, lazily fetched per question, aggregate-counts-only
// context (never a client's name/contact, since a linked lead/site visit
// is never included here either). New kind 'ops_companion_qa', scoped to
// this staff member's own real schedule instead of their pipeline.
export type OpsCompanionQuestion = 'today_focus' | 'week_load' | 'whats_next';

export interface OpsCompanionContext {
  openCount: number;
  inProgressCount: number;
  blockedCount: number;
  overdueCount: number;
  weekRemainingCount: number;
  daysRemainingInWeek: number;
  nextMeetingTitle: string | null;
  nextMeetingTime: string | null;
  // Real, current task titles (own tasks, never a client's) -- without
  // these the model only ever saw counts and produced generic, "boring"
  // answers like "clear one of your two open tasks" instead of naming
  // which one. Up to 3, most urgent (overdue first) leading.
  topTasks: string[];
}

export function useOpsCompanionAnswer(question: OpsCompanionQuestion, ctx: OpsCompanionContext | undefined, enabled: boolean) {
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['opsCompanionAnswer', question, profile?.key, ctx],
    enabled: enabled && !!ctx && !!profile,
    staleTime: 1000 * 60 * 15,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !ctx || !profile) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'ops_companion_qa',
          context: {
            question,
            name: profile.name,
            openCount: ctx.openCount,
            inProgressCount: ctx.inProgressCount,
            blockedCount: ctx.blockedCount,
            overdueCount: ctx.overdueCount,
            weekRemainingCount: ctx.weekRemainingCount,
            daysRemainingInWeek: ctx.daysRemainingInWeek,
            nextMeetingTitle: ctx.nextMeetingTitle,
            nextMeetingTime: ctx.nextMeetingTime,
            topTasks: ctx.topTasks,
          },
        },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}

export function useOpsDailyBriefing(ctx: (OpsCompanionContext & { todayTotal: number; todayCompleted: number }) | undefined) {
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['opsDailyBriefing', profile?.key, ctx],
    enabled: !!ctx && !!profile,
    staleTime: 1000 * 60 * 15,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !ctx || !profile) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'ops_daily_briefing',
          context: {
            name: profile.name,
            todayTotal: ctx.todayTotal,
            todayCompleted: ctx.todayCompleted,
            todayOverdue: ctx.overdueCount,
            weekTasksRemaining: ctx.weekRemainingCount,
            nextMeetingTitle: ctx.nextMeetingTitle,
            nextMeetingTime: ctx.nextMeetingTime,
            topTasks: ctx.topTasks,
          },
        },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
