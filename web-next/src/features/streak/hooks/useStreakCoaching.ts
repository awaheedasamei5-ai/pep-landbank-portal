import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { TodayStreak } from './useTodayStreak';

// Real LLM-backed coaching line, via the ai-insights Edge Function
// (Groq, server-side only -- see supabase/functions/ai-insights). This
// is genuinely orthogonal to the demo/live DataSource split: it never
// touches this app's own tables, just relays an already-computed streak
// summary to an external model, so it calls the Supabase client
// directly (anon key only, no real session needed -- verify_jwt on the
// function accepts any valid Supabase-issued JWT, and the anon key is
// one) rather than going through getDataSource(). Fails silently (react-
// query just leaves `data` undefined) if the function isn't deployed,
// the GROQ_API_KEY secret hasn't been set yet, or the network call
// times out -- the streak card must never break because the AI layer
// is unavailable, only quietly not show the coaching line.
export function useStreakCoaching(streak: TodayStreak | undefined) {
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['streakCoaching', profile?.key, streak?.streakLen, streak?.moodKey, streak?.risk.tier],
    enabled: !!streak && !!profile,
    staleTime: 1000 * 60 * 15,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !streak || !profile) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'streak_coaching',
          context: {
            agentName: profile.name,
            currentStreakDays: streak.streakLen,
            mood: streak.mood.label,
            pipelineRiskTier: streak.risk.tier,
            daysLeftThisMonth: streak.risk.daysLeft,
            pipelineStatusLabel: streak.pet.label,
            last7DaysMet: streak.weekHistory.filter((h) => h.dayMet).length,
          },
        },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
