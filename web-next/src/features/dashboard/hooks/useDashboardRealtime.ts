import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';

// Genuine cross-device/cross-tab live sync for every dashboard number
// this app shows -- mounted once at the app-shell level (same reasoning
// as useChatRealtime: a number must update even when the screen that
// "owns" that data isn't the one currently open, e.g. Elias completing
// a todo on his phone should move Manager Home's numbers on a manager's
// laptop without anyone refreshing). schedule_items/leads/payments/
// leave_requests are all already in the supabase_realtime publication
// (confirmed live via pg_publication_tables, no migration needed --
// same as messages was for Chat).
//
// Agents get a filtered subscription (their own schedule_items/leads/
// payments only, cheaper and enough for their own dashboard); managers
// get an unfiltered one, since Manager Home's company-wide KPIs need to
// react to ANY agent's change. TanStack Query's invalidateQueries does
// prefix matching on the query key array, so invalidating e.g.
// ['pipelineSummary'] correctly catches every agent-specific cached
// variant (['pipelineSummary', 'elias'], ['pipelineSummary', 'emmanuel']...)
// without needing to know which ones are actually cached right now.
export function useDashboardRealtime() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  const myKey = profile?.key ?? '';
  const isManager = profile?.role === 'manager';

  useEffect(() => {
    if (demoMode || !myKey) return;
    const client = getSupabaseClient();
    if (!client) return;

    const invalidateTodos = () => {
      queryClient.invalidateQueries({ queryKey: ['todayTodos'] });
      queryClient.invalidateQueries({ queryKey: ['todayStreak'] });
    };
    const invalidatePipeline = () => {
      queryClient.invalidateQueries({ queryKey: ['pipelineSummary'] });
      queryClient.invalidateQueries({ queryKey: ['todayStreak'] });
      queryClient.invalidateQueries({ queryKey: ['myCommission'] });
      queryClient.invalidateQueries({ queryKey: ['managerOverview'] });
      queryClient.invalidateQueries({ queryKey: ['companyCommission'] });
      queryClient.invalidateQueries({ queryKey: ['leadsAll'] });
      queryClient.invalidateQueries({ queryKey: ['reportsLeads'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    };
    const invalidateLeave = () => {
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
    };

    const channel = client.channel(`dashboard-${myKey}`);
    if (isManager) {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, invalidateTodos)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, invalidatePipeline)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, invalidatePipeline);
    } else {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items', filter: `owner_key=eq.${myKey}` }, invalidateTodos)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `agent_key=eq.${myKey}` }, invalidatePipeline)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `agent_key=eq.${myKey}` }, invalidatePipeline);
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, invalidateLeave);
    channel.subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [demoMode, myKey, isManager, queryClient]);
}
