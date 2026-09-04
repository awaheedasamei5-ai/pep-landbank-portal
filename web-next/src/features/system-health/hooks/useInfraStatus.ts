import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';

export type ProbeStatus = 'ok' | 'error' | 'unknown';

// Master Spec Section 3.5: "Admin System Health page: database
// connectivity, Realtime status, scheduled jobs, SMS provider, email
// provider, AI provider, storage, last backup, last successful report."
// AI provider/scheduled jobs/last backup/last successful report already
// existed; this file adds the four real gaps confirmed missing 2026-09-06
// (db connectivity, Realtime, SMS provider, email provider) -- storage
// status is deliberately not added: this app never uses Supabase Storage
// buckets (payment-proof/receipt files go through base64/data URLs per
// the DataSource comments), so a storage probe would just be theater
// against a feature that isn't in use.

// A real round-trip query, not a client-side "is the SDK loaded" check --
// times out via the client's own default fetch timeout rather than
// hanging the query forever if the network is actually down.
export function useDbConnectivityStatus() {
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['dbConnectivityStatus'],
    enabled: !!profile,
    staleTime: 1000 * 60,
    retry: false,
    queryFn: async (): Promise<{ status: ProbeStatus; latencyMs: number }> => {
      const client = getSupabaseClient();
      if (!client) return { status: 'unknown', latencyMs: 0 };
      const start = performance.now();
      const { error } = await client.from('app_config').select('id').limit(1);
      const latencyMs = Math.round(performance.now() - start);
      return { status: error ? 'error' : 'ok', latencyMs };
    },
  });
}

// Opens a real Realtime channel purely to observe its own SUBSCRIBED /
// CHANNEL_ERROR / TIMED_OUT status -- independent of the app's actual
// chat/dashboard channels (useChat.ts/useDashboardRealtime.ts), which
// don't surface a status callback today. Subscribes to `leads`, already
// in the supabase_realtime publication, but never reads the payload --
// this is a connectivity probe, not a data subscription.
export function useRealtimeStatus() {
  const profile = useSessionStore((s) => s.profile);
  const [status, setStatus] = useState<ProbeStatus>('unknown');

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !profile) return;
    const channel = client
      .channel('system-health-realtime-probe')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {})
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('ok');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('error');
      });
    return () => {
      client.removeChannel(channel);
    };
  }, [profile]);

  return status;
}

// sms_log RLS is own-or-manager (confirmed live) so a manager session
// really does see every recent send, not just their own.
export function useSmsProviderStatus() {
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['smsProviderStatus'],
    enabled: !!profile && profile.role === 'manager',
    staleTime: 1000 * 60 * 5,
    retry: false,
    queryFn: async (): Promise<{ status: ProbeStatus; recentFailures: number; recentTotal: number; lastError: string | null }> => {
      const client = getSupabaseClient();
      if (!client) return { status: 'unknown', recentFailures: 0, recentTotal: 0, lastError: null };
      const { data, error } = await client.from('sms_log').select('status, error, created_at').order('created_at', { ascending: false }).limit(20);
      if (error || !data) return { status: 'unknown', recentFailures: 0, recentTotal: 0, lastError: null };
      const failures = data.filter((r) => r.status === 'failed' || r.status === 'error');
      return {
        status: data.length === 0 ? 'unknown' : failures.length === 0 ? 'ok' : failures.length === data.length ? 'error' : 'ok',
        recentFailures: failures.length,
        recentTotal: data.length,
        lastError: failures[0]?.error ?? null,
      };
    },
  });
}

// report_archive.email_status across the last 10 reports, not just the
// single latest one useSystemHealth.ts already checks for the report job
// row -- a provider-level view (repeated failures) vs a job-level view
// (did last night's report send).
export function useEmailProviderStatus() {
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['emailProviderStatus'],
    enabled: !!profile && profile.role === 'manager',
    staleTime: 1000 * 60 * 5,
    retry: false,
    queryFn: async (): Promise<{ status: ProbeStatus; recentFailures: number; recentTotal: number }> => {
      const client = getSupabaseClient();
      if (!client) return { status: 'unknown', recentFailures: 0, recentTotal: 0 };
      const { data, error } = await client.from('report_archive').select('email_status').order('generated_at', { ascending: false }).limit(10);
      if (error || !data) return { status: 'unknown', recentFailures: 0, recentTotal: 0 };
      const failures = data.filter((r) => r.email_status === 'failed');
      return {
        status: data.length === 0 ? 'unknown' : failures.length === 0 ? 'ok' : failures.length === data.length ? 'error' : 'ok',
        recentFailures: failures.length,
        recentTotal: data.length,
      };
    },
  });
}
