import { ghs } from '../../../shared/lib/format';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { Plot, PlotStatus } from '../../../types/domain';
import { usePlots } from '../hooks/usePlots';
import styles from './PlotInventoryScreen.module.css';

const BADGE_CLASS: Record<PlotStatus, string> = { Available: 'badgeAvailable', Reserved: 'badgeReserved', Sold: 'badgeSold' };

// Read-only browse screen -- allocation/reservation writes (confirm_
// allocation, split_plot_for_half_sale, etc, all real SECURITY DEFINER
// RPC functions on production) are a distinct, later piece of work, same
// scoping discipline as leaving live payment recording unwired.
export function PlotInventoryScreen() {
  const profile = useSessionStore((s) => s.profile);
  const hasAccess = !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel');
  const { data: plots, isLoading } = usePlots();

  if (!hasAccess) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Plot Inventory</h1>
        <p className={styles.sub}>You don&apos;t have access to plot records. Ask a manager if you need this.</p>
      </div>
    );
  }

  const counts = { Available: 0, Reserved: 0, Sold: 0 } as Record<PlotStatus, number>;
  (plots ?? []).forEach((p) => counts[p.status]++);

  const bySite = new Map<string, Plot[]>();
  (plots ?? []).forEach((p) => {
    if (!bySite.has(p.site)) bySite.set(p.site, []);
    bySite.get(p.site)!.push(p);
  });

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Plot Inventory</h1>
      <p className={styles.sub}>Every plot and its current status</p>

      <div className={styles.summaryRow}>
        <div className={styles.summaryPill}>
          <div className={styles.summaryVal}>{counts.Available}</div>
          <div className={styles.summaryLbl}>Available</div>
        </div>
        <div className={styles.summaryPill}>
          <div className={styles.summaryVal}>{counts.Reserved}</div>
          <div className={styles.summaryLbl}>Reserved</div>
        </div>
        <div className={styles.summaryPill}>
          <div className={styles.summaryVal}>{counts.Sold}</div>
          <div className={styles.summaryLbl}>Sold</div>
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {[...bySite.entries()].map(([site, sitePlots]) => (
        <div key={site}>
          <div className={styles.site}>{site}</div>
          {sitePlots
            .filter((p) => p.unitKind === 'whole')
            .map((whole) => {
              const halves = sitePlots.filter((p) => p.parentPlotId === whole.id);
              return (
                <div key={whole.id}>
                  <PlotRow plot={whole} />
                  {halves.map((h) => (
                    <PlotRow key={h.id} plot={h} isHalf />
                  ))}
                </div>
              );
            })}
        </div>
      ))}
      {plots && plots.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>No plots recorded yet.</p>}
    </div>
  );
}

function PlotRow({ plot, isHalf }: { plot: Plot; isHalf?: boolean }) {
  return (
    <div className={`${styles.row} ${isHalf ? styles.rowHalf : ''}`}>
      <div>
        <div className={styles.plotNumber}>{plot.plotNumber}</div>
        <div className={styles.meta}>
          {plot.plotType}
          {plot.clientName ? ` · ${plot.clientName}` : ''}
        </div>
      </div>
      <div className={styles.right}>
        {plot.price != null && <div className={styles.price}>{ghs(plot.price)}</div>}
        <span className={`${styles.badge} ${styles[BADGE_CLASS[plot.status]]}`}>{plot.status}</span>
      </div>
    </div>
  );
}
