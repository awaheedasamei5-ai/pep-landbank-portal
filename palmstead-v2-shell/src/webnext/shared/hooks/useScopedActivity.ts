"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDataSource } from "../../data/source";
import { useSessionStore } from "../../auth/useSessionStore";
import type { Lead } from "../../types/domain";

// docs/plans/29-company-leads-full-system-blueprint.md, generalized for
// Pipeline and Client Database -- the same real scoping fix Company
// Leads' own useCompanyWideActivity() shipped: activityLog.listCompanyWide()
// is generic shared infra (real activity_log_sel RLS already scopes it
// correctly per real session -- own-agent-or-manager -- but it is not
// scoped to any one feature's own lead pool), so this filters the result
// against whatever `leads` array the caller passes in.
export function useScopedActivity(leads: Lead[]) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const allActivity = useQuery({ queryKey: ["scopedActivityAll"], queryFn: () => getDataSource(demoMode).activityLog.listCompanyWide() });

  const leadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);
  const data = useMemo(() => (allActivity.data ?? []).filter((e) => e.leadId && leadIds.has(e.leadId)), [allActivity.data, leadIds]);

  return { data, isLoading: allActivity.isLoading };
}
