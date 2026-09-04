import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicStats } from '../../../data/publicStatsClient';
import styles from './PublicStatsScreen.module.css';

function fmtGhs(n: number): string {
  return `GHS ${n.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
}

// Public, unauthenticated -- Blueprint Phase 9's "Public stats widget".
// Same real endpoint (public-stats) the external homepage widget already
// uses in production; this route is the in-app equivalent, for a link
// shared directly (no separate static-HTML widget to maintain) and for a
// staff member's own personalized share link (/stats/:token, keyed to
// their profiles.widget_token -- same token the homepage widget accepts).
export function PublicStatsScreen() {
  const { token } = useParams<{ token?: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['publicStats', token ?? null],
    queryFn: () => fetchPublicStats(token),
    retry: false,
    refetchInterval: 120_000,
  });

  const state = isLoading ? 'loading' : isError || !data ? 'unavailable' : 'ready';

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>{data?.personalized ? `${data.agentName}'s Live Stats` : 'Palmstead -- Live Stats'}</div>
        <div className={styles.heroSub}>{data?.personalized ? 'This week, at a glance' : 'Real numbers, updated live'}</div>
      </div>
      <div className={styles.body}>
        {state === 'loading' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <p className={styles.centerSub}>Loading the latest numbers…</p>
          </div>
        )}

        {state === 'unavailable' && (
          <div className={`${styles.card} ${styles.centerState}`}>
            <div className={styles.centerIcon}>📊</div>
            <div className={styles.centerTitle}>Stats aren&apos;t available right now</div>
            <p className={styles.centerSub}>{token ? "This link isn't valid, or the stats service is temporarily down." : 'Please try again in a little while.'}</p>
          </div>
        )}

        {state === 'ready' && data && (
          <div className={styles.grid}>
            {data.personalized ? (
              <>
                <StatCard label="Day streak" value={String(data.streakLen ?? 0)} icon="🔥" />
                <StatCard label="Site visits this week" value={String(data.siteVisitsThisWeek)} icon="🚗" />
                <StatCard label="Active pipeline value" value={fmtGhs(data.pipelineValue ?? 0)} icon="💰" />
                <StatCard label="Clients added this month" value={String(data.clientsThisMonth ?? 0)} icon="🧑‍🤝‍🧑" />
              </>
            ) : (
              <>
                <StatCard label="Total clients" value={String(data.totalClients ?? 0)} icon="🧑‍🤝‍🧑" />
                <StatCard label="Plots sold this month" value={String(data.plotsSoldThisMonth ?? 0)} icon="🌳" />
                <StatCard label="Site visits this week" value={String(data.siteVisitsThisWeek)} icon="🚗" />
              </>
            )}
            <div className={styles.footNote}>Updated {new Date(data.generatedAt).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className={styles.card}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}
