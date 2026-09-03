import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Port of index.html's Audit Log screen (auditLogHtml(), index.html:21723)
// -- browses audit_events with the same category/critical-only filter.
export function useAuditLog() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const [category, setCategory] = useState<'all' | 'audit' | 'integrity' | 'error' | 'cron'>('all');
  const [criticalOnly, setCriticalOnly] = useState(false);

  const query = useQuery({
    queryKey: ['auditLog', demoMode, category, criticalOnly],
    enabled: !!profile && profile.role === 'manager',
    queryFn: () => getDataSource(demoMode).audit.list({ category, criticalOnly }),
  });

  return { events: query.data ?? [], isLoading: query.isLoading, category, setCategory, criticalOnly, setCriticalOnly };
}
