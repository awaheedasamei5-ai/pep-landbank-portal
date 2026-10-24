"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Trophy, TrendingUp, BarChart3, CheckCircle2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useSmartInsights } from "../hooks/useSmartInsights";
import { useSmartInsightAction } from "../hooks/useSmartInsightAction";
import type { SmartInsight } from "../lib/smartInsightsLogic";
import styles from "./SmartInsightsScreen.module.css";
import { cn } from "cn";

const ICONS: Record<SmartInsight["icon"], typeof AlertTriangle> = {
  warning: AlertTriangle,
  trophy: Trophy,
  chartLine: TrendingUp,
  barChart: BarChart3,
  check: CheckCircle2,
};

const TONE_STYLES: Record<SmartInsight["tone"], { icon: string; bubble: string; border: string }> = {
  danger: { icon: "text-destructive", bubble: "bg-destructive/10", border: "border-destructive/30" },
  warn: { icon: "text-amber-600 dark:text-amber-400", bubble: "bg-amber-500/10", border: "border-amber-500/30" },
  ok: { icon: "text-emerald-600 dark:text-emerald-400", bubble: "bg-emerald-500/10", border: "border-emerald-500/20" },
};

// docs/plans/18-smart-insights-plan.md + docs/plans/26-smart-insights-v2-
// cross-app-plan.md -- real destination for the ported index.html
// getInsightLists()/computeSmartInsights() rule engine, now extended
// with 6 real cross-app checks (Complaints/Referrals/Allocations/
// Contract of Sale/Leave/Banner Tracking) grouped into a real digest by
// app, each card topped off with one AI-drafted suggested action
// (kind `smart_insight_action`) -- deterministic generation stays
// 100% rule-based, AI only phrases what to do about it.
export function SmartInsightsScreen() {
  const { insights, isLoading } = useSmartInsights();

  const grouped = useMemo(() => {
    const groups = new Map<string, SmartInsight[]>();
    insights.forEach((i) => {
      const app = i.app ?? "Sales";
      const list = groups.get(app) ?? [];
      list.push(i);
      groups.set(app, list);
    });
    return [...groups.entries()];
  }, [insights]);

  return (
    <div>
      <PageHeader title="Smart Insights" description="Auto-generated from live data across the whole app — nothing to configure, nothing to snooze." />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([app, list], gi) => (
            <section key={app}>
              {grouped.length > 1 && <h2 className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">{app}</h2>}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((insight, i) => (
                  <InsightCard key={insight.key} insight={insight} index={gi * 10 + i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight, index }: { insight: SmartInsight; index: number }) {
  const Icon = ICONS[insight.icon];
  const tone = TONE_STYLES[insight.tone];
  const kind = insight.kind ?? insight.crossAppKind;
  const clickable = !!kind;
  const { data: action } = useSmartInsightAction(insight.key !== "clean" ? insight : null);
  const body = (
    <Card
      className={cn("h-full transition-colors", tone.border, insight.tone === "danger" ? styles.dangerGlow : styles.card, clickable && "hover:bg-muted/40")}
      style={{ "--stagger-index": index } as React.CSSProperties}
    >
      <CardContent className="flex items-start gap-3 pt-6">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", tone.bubble)}>
          <Icon className={cn("size-4.5", tone.icon)} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{insight.text}</p>
          {insight.detail && <p className="mt-1 text-xs text-muted-foreground">{insight.detail}</p>}
          {action && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground italic">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {action}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
  return clickable ? (
    <Link href={`/dashboard/smart-insights/${kind}`} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
