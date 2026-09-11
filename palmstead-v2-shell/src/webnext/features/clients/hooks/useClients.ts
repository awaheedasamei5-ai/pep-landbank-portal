"use client";

import { useMemo } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useLeads } from '../../pipeline/hooks/useLeads';
import { useAllLeads } from '../../payments/hooks/useLogPayment';
import { groupLeadsByClient } from '../lib/groupClients';

// Same real bug the user caught live on Sidebar/SalesDesk's "My Pipeline"
// and RequestRow's allocation lookup: a manager's own agent_key owns few
// or no real leads, so the agent-scoped useLeads() left Management's
// Client Database looking completely empty while an agent's own view
// (correctly agent-scoped) showed their real clients -- not a data bug,
// a wrong-hook bug. Manager gets the company-wide useAllLeads() instead;
// an agent keeps the agent-scoped useLeads() exactly as before.
export function useClients() {
  const profile = useSessionStore((s) => s.profile);
  const isMgr = profile?.role === 'manager';
  const own = useLeads();
  const all = useAllLeads();
  const { data: leads, isLoading } = isMgr ? all : own;
  const clients = useMemo(() => groupLeadsByClient(leads ?? []), [leads]);
  return { data: clients, isLoading };
}