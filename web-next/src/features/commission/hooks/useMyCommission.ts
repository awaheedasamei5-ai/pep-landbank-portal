import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { computeMyCommissionBreakdown } from '../lib/commissionLogic';

// Always "this month" -- matches index.html's viewMyCommission(), which
// never lets an agent look at a past month (only Management's Commission
// review does, since pool eligibility needs company-wide data anyway).
export function useMyCommission(monthKey: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['myCommission', agentKey, monthKey],
    enabled: !!agentKey,
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      const [payments, leads, config] = await Promise.all([ds.payments.listForAgent(agentKey), ds.leads.listForAgent(agentKey), ds.config.get()]);
      return computeMyCommissionBreakdown(payments, leads, monthKey, config);
    },
  });
}
