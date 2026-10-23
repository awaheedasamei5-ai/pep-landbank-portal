"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { TableEmpty } from "@/components/table-empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInsightList } from "../hooks/useSmartInsights";
import { INSIGHT_META, type InsightKind } from "../lib/smartInsightsLogic";
import { ghs } from "../../../shared/lib/format";

// docs/plans/18-smart-insights-plan.md -- port of index.html's real
// viewInsightList() (index.html:9962-9976), the drill-down a Smart
// Insight card routes to.
export function InsightListScreen() {
  const params = useParams<{ kind: string }>();
  const kind = params.kind as InsightKind;
  const meta = INSIGHT_META[kind];
  const { list, isLoading } = useInsightList(kind);

  if (!meta) {
    return <p className="text-sm text-muted-foreground">Unknown insight.</p>;
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/smart-insights">
          <ArrowLeft />
          Smart Insights
        </Link>
      </Button>
      <PageHeader title={meta.title} description={`${meta.desc} — ${list.length} client${list.length === 1 ? "" : "s"}`} />

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={5} message="Loading…" />
              ) : list.length === 0 ? (
                <TableEmpty colSpan={5} message="Nothing here right now." />
              ) : (
                list.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      {l.name}
                      {l.__pct != null && <span className="ml-2 text-xs text-muted-foreground">{l.__pct}% paid</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.contact || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.nextAction || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{ghs(l.grandTotal)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/pipeline/${l.id}`}>
                          Update
                          <ArrowRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
