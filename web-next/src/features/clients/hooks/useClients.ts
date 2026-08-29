import { useMemo } from 'react';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { groupLeadsByClient } from '../lib/groupClients';

export function useClients() {
  const { data: leads, isLoading } = useLeads();
  const clients = useMemo(() => groupLeadsByClient(leads ?? []), [leads]);
  return { data: clients, isLoading };
}
