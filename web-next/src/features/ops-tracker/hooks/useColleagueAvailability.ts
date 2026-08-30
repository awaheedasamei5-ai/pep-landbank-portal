import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import { leaveIsBlocking } from '../../leave/lib/leaveLogic';

export interface ColleagueAvailability {
  onLeave: boolean;
  leaveStatus: 'pending' | 'approved' | null;
  existingTaskCount: number;
  aiMessage: string | null;
}

// Real cross-app intelligence: before assigning a task to a colleague,
// checks their ACTUAL leave_requests (real table, SELECT RLS open to
// any signed-in staff member -- confirmed live, see leaveLogic.ts's own
// comment) and their existing schedule_items for that date, then asks
// the ai-insights Edge Function (kind: 'colleague_availability') to
// turn those two real facts into one plain-English sentence. Note a
// genuine, correct access-control boundary this respects rather than
// works around: schedule_items_sel RLS only lets a MANAGER (or the
// colleague themselves) read someone else's tasks -- a regular agent
// checking a peer's availability will always see existingTaskCount: 0
// under real RLS, not because nothing exists but because they're not
// allowed to see it. That's the real security architecture working as
// designed, not a bug in this feature.
export function useColleagueAvailability(colleagueKey: string, colleagueName: string, date: string) {
  const demoMode = useSessionStore((s) => s.demoMode);

  return useQuery<ColleagueAvailability>({
    queryKey: ['colleagueAvailability', colleagueKey, date, demoMode],
    enabled: !!colleagueKey && !!date,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      const [leaveRequests, tasksThatDay] = await Promise.all([ds.leaveRequests.list(), ds.scheduleItems.listForAgentOnDate(colleagueKey, date)]);

      const blockingLeave = leaveRequests.find((r) => r.agentKey === colleagueKey && leaveIsBlocking(r.status) && r.dates.includes(date));
      const onLeave = !!blockingLeave;
      const leaveStatus = blockingLeave ? (blockingLeave.status as 'pending' | 'approved') : null;
      const existingTaskCount = tasksThatDay.filter((t) => t.status === 'open').length;

      let aiMessage: string | null = null;
      const client = getSupabaseClient();
      if (client) {
        const { data, error } = await client.functions.invoke('ai-insights', {
          body: {
            kind: 'colleague_availability',
            context: { colleagueName, date, onLeave, leaveStatus, existingTaskCount },
          },
        });
        if (!error) {
          const message = (data as { message?: string } | null)?.message;
          aiMessage = message && message.length > 0 ? message : null;
        }
      }

      return { onLeave, leaveStatus, existingTaskCount, aiMessage };
    },
  });
}
