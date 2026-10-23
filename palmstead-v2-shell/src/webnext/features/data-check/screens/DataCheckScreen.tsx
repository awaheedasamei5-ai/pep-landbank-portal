"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/table-empty";
import { PageHeader } from "@/components/page-header";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useDataCheck } from "../hooks/useDataCheck";
import { useDataCheckSummary } from "../hooks/useDataCheckSummary";
import type { DataIssue } from "../lib/dataIntegrityCheck";
import { cn } from "cn";

// docs/plans/19-data-check-plan.md -- real destination for the ported
// index.html runDataIntegrityCheck() (index.html:19180-19271). One
// real page (KPIs + one filterable table), not artificially split --
// a hygiene scan is genuinely one cohesive result set.
export function DataCheckScreen() {
  const profile = useSessionStore((s) => s.profile);
  const { issues, totalLeads, hygieneScore, isLoading, dismiss } = useDataCheck();
  const { data: aiSummary } = useDataCheckSummary(issues, totalLeads, hygieneScore, isLoading);

  const scopeLabel = profile?.role === "manager" ? "the company" : "your pipeline";
  const flaggedCount = new Set(issues.map((i) => i.leadId)).size;
  // Danger first -- the ones that most need attention surface at the top.
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "danger" ? -1 : 1));

  return (
    <div>
      <PageHeader title="Data Check" description={`Scans every lead in ${scopeLabel} for pricing/payment inconsistencies and record hygiene — automatically, every time you open this.`} />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className={cn("text-3xl font-semibold tracking-tight", hygieneScore < 90 && "text-destructive")}>{hygieneScore}%</div>
            <p className="text-sm text-muted-foreground">Hygiene score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-semibold tracking-tight">
              {totalLeads - flaggedCount} <span className="text-base font-normal text-muted-foreground">/ {totalLeads}</span>
            </div>
            <p className="text-sm text-muted-foreground">Clean leads</p>
          </CardContent>
        </Card>
      </div>

      {aiSummary && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">{aiSummary}</span>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={4} message="Scanning…" />
              ) : sorted.length === 0 ? (
                <TableEmpty colSpan={4} message="Every lead's unit price, totals, payments and basic record fields are all in order." />
              ) : (
                sorted.map((issue, i) => <IssueRow key={`${issue.leadId}-${issue.type}-${i}`} issue={issue} onDismiss={() => dismiss.mutate(issue)} dismissing={dismiss.isPending} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function IssueRow({ issue, onDismiss, dismissing }: { issue: DataIssue; onDismiss: () => void; dismissing: boolean }) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{issue.leadName}</div>
        <div className="text-xs text-muted-foreground">{issue.agentDisplay}</div>
      </TableCell>
      <TableCell>
        <Badge variant={issue.severity === "danger" ? "destructive" : "outline"}>{issue.type}</Badge>
      </TableCell>
      <TableCell className="max-w-md text-sm text-muted-foreground">{issue.detail}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/pipeline/${issue.leadId}`}>Fix this lead</Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={dismissing} onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
