import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { computeCompanyCommissionForMonth } from '../lib/commissionLogic';

export function useCompanyCommission(monthKey: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['companyCommission', monthKey, demoMode],
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      const [{ payments, leads, staff }, config] = await Promise.all([ds.manager.commissionData(), ds.config.get()]);
      return computeCompanyCommissionForMonth(payments, leads, staff, monthKey, config);
    },
  });
}
