import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../data/client';

// Real LLM-authored line for the sign-in screen -- kind='login_greeting'
// on the same shared ai-insights function as streak coaching / colleague
// availability / manager briefing (added 2026-09-04). No session exists
// yet at this screen, so the only context sent is the real day-part --
// never a name, since nobody's picked one yet. queryKey buckets by
// dayPart so it naturally regenerates across the day without a Groq call
// on every reload; fails silently (undefined) if unreachable so the
// login screen never depends on it.
function dayPart(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

export function useLoginGreeting() {
  const now = new Date();
  const part = dayPart(now.getHours());
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const dateKey = now.toISOString().slice(0, 10);

  return useQuery({
    queryKey: ['loginGreeting', dateKey, part],
    staleTime: 1000 * 60 * 60 * 3,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'login_greeting', context: { dayName, timeOfDay: part, isWeekend } },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
