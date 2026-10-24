'use client';

import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AnalyticsKpiStrip, type KpiStripItem } from './AnalyticsKpiStrip';
import { useOperationsAnalytics } from '../hooks/useOperationsAnalytics';
import { useAnalyticsTabNarration } from '../hooks/useAnalyticsTabNarration';
import styles from './AnalyticsScreen.module.css';

// docs/plans/27-analytics-v2-cross-app-plan.md -- real Operations
// Tracker tab, not covered by the original Analytics. `schedule_items`
// is genuinely sparse real data right now (confirmed this session) --
// shown honestly as real small numbers, not padded or hidden.
export function OperationsTab() {
  const { isLoading, metrics } = useOperationsAnalytics();

  const context = !isLoading
    ? {
        open: metrics.open,
        overdue: metrics.overdue,
        completedThisMonth: metrics.completed.current,
        completedLastMonth: metrics.completed.previous,
        completionRate: metrics.completionRate,
      }
    : null;
  const { data: narration } = useAnalyticsTabNarration('analytics_operations_summary', context);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const items: KpiStripItem[] = [
    { key: 'open', label: 'Open tasks & to-dos', value: String(metrics.open), deltaPct: null },
    { key: 'overdue', label: 'Overdue', value: String(metrics.overdue), deltaPct: null },
    { key: 'completed', label: 'Completed', value: String(metrics.completed.current), deltaPct: metrics.completed.deltaPct, fromLabel: String(metrics.completed.previous), periodLabel: 'this month' },
    { key: 'completionRate', label: 'Completion rate', value: `${metrics.completionRate}%`, deltaPct: null },
  ];

  return (
    <div className="space-y-4">
      {narration && (
        <Card className={`${styles.section} ${styles.briefingCard}`} style={{ '--stagger-index': 0 } as React.CSSProperties}>
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>{narration}</p>
          </CardContent>
        </Card>
      )}

      <div className={styles.section} style={{ '--stagger-index': 1 } as React.CSSProperties}>
        <AnalyticsKpiStrip items={items} />
      </div>
    </div>
  );
}
