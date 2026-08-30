import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { monthKey, shiftMonth, today } from '../../../shared/lib/format';

// Same real trailing-6-month bucketing as ManagerOverview.collectedTrend
// (source.ts's computeMonthlyTrend), just scoped to one agent's own
// payments instead of every agent's -- feeds Home's hero chart the same
// way it feeds Manager Home's.
export function useMyCollectedTrend() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['myCollectedTrend', agentKey],
    enabled: !!agentKey,
    queryFn: async () => {
      const payments = await getDataSource(demoMode).payments.listForAgent(agentKey);
      const months = Array.from({ length: 6 }, (_, i) => shiftMonth(today().slice(0, 7), i - 5));
      return months.map((mk) => payments.filter((p) => monthKey(p.date) === mk).reduce((s, p) => s + p.amount, 0));
    },
  });
}
