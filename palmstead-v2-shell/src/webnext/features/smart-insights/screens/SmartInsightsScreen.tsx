"use client";

import Link from "next/link";
import { AlertTriangle, Trophy, TrendingUp, BarChart3, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useSmartInsights } from "../hooks/useSmartInsights";
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

// docs/plans/18-smart-insights-plan.md -- real destination for the ported
// index.html getInsightLists()/computeSmartInsights() rule engine
// (index.html:9484-9954). Deliberately rule-based, no AI (see the plan's
// own §3) -- every card here is a plain, instant, config-free fact
// already true about the real pipeline, re-scanned on every open.
export function SmartInsightsScreen() {
  const { insights, isLoading } = useSmartInsights();

  return (
    <div>
      <PageHeader title="Smart Insights" description="Auto-generated from your live data — nothing to configure, nothing to snooze." />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight, i) => (
            <InsightCard key={insight.key} insight={insight} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight, index }: { insight: SmartInsight; index: number }) {
  const Icon = ICONS[insight.icon];
  const tone = TONE_STYLES[insight.tone];
  const clickable = !!insight.kind;
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
        </div>
      </CardContent>
    </Card>
  );
  return clickable ? (
    <Link href={`/dashboard/smart-insights/${insight.kind}`} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
