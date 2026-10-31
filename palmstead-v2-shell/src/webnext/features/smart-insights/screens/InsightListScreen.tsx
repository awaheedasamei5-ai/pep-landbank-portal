"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { TableEmpty } from "@/components/table-empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInsightList, useCrossAppInsightList } from "../hooks/useSmartInsights";
import { INSIGHT_META, CROSS_APP_INSIGHT_META, type InsightKind, type CrossAppInsightKind } from "../lib/smartInsightsLogic";
import { ghs } from "../../../shared/lib/format";

const CROSS_APP_DEST: Record<CrossAppInsightKind, string> = {
  complaintAging: "/dashboard/complaints",
  referralAging: "/dashboard/referrals",
  allocationAging: "/dashboard/allocations",
  contractRequestAging: "/dashboard/contract-of-sale/requests",
  leavePending: "/dashboard/leave/management/requests",
  bannerZeroLeads: "/dashboard/banners",
  siteVisitUnlogged: "/dashboard/site-visits",
};

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

// docs/plans/18-smart-insights-plan.md -- port of index.html's real
// viewInsightList() (index.html:9962-9976), the drill-down a Smart
// Insight card routes to. docs/plans/26-smart-insights-v2-cross-app-
// plan.md extends this with a second branch for the 6 new cross-app
// kinds, whose rows aren't Lead-shaped -- a generic name/date/status
// table linking out to that app's own real screen, rather than forcing
// a different record shape into the lead-only columns below.
export function InsightListScreen() {
  const params = useParams<{ kind: string }>();
  const rawKind = params.kind;
  const crossAppMeta = CROSS_APP_INSIGHT_META[rawKind as CrossAppInsightKind];

  if (crossAppMeta) {
    return <CrossAppInsightList kind={rawKind as CrossAppInsightKind} />;
  }

  return <LeadInsightList kind={rawKind as InsightKind} />;
}

function LeadInsightList({ kind }: { kind: InsightKind }) {
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

interface GenericRow {
  id: string;
  label: string;
  sub: string;
  date: string;
  status: string;
}

function toGenericRows(kind: CrossAppInsightKind, list: ReturnType<typeof useCrossAppInsightList>["list"]): GenericRow[] {
  switch (kind) {
    case "complaintAging":
      return (list as { id: string; name: string | null; agentName: string | null; createdAt: string; status: string }[]).map((r) => ({ id: r.id, label: r.name || "Unnamed", sub: r.agentName || "—", date: r.createdAt, status: r.status }));
    case "referralAging":
      return (list as { id: string; referredName: string; referrerName: string; createdAt: string; status: string }[]).map((r) => ({ id: r.id, label: r.referredName, sub: `Referred by ${r.referrerName}`, date: r.createdAt, status: r.status }));
    case "allocationAging":
      return (list as { id: string; clientName: string; agentName: string | null; createdAt: string; status: string }[]).map((r) => ({ id: r.id, label: r.clientName, sub: r.agentName || "—", date: r.createdAt, status: r.status }));
    case "contractRequestAging":
      return (list as { id: string; clientName: string; requestedByName: string; createdAt: string; status: string }[]).map((r) => ({ id: r.id, label: r.clientName, sub: r.requestedByName, date: r.createdAt, status: r.status }));
    case "leavePending":
      return (list as { id: string; agentName: string; daysCount: number; createdAt: string; status: string }[]).map((r) => ({ id: r.id, label: r.agentName, sub: `${r.daysCount} day${r.daysCount === 1 ? "" : "s"}`, date: r.createdAt, status: r.status }));
    case "bannerZeroLeads":
      return (list as { id: string; name: string; area: string; createdAt: string; status: string }[]).map((r) => ({ id: r.id, label: r.name, sub: r.area, date: r.createdAt, status: r.status }));
    case "siteVisitUnlogged":
      return (list as unknown as { id: string; name: string; contact: string; visitDate: string }[]).map((r) => ({ id: r.id, label: r.name, sub: r.contact || "—", date: r.visitDate, status: "No outcome logged" }));
  }
}

function CrossAppInsightList({ kind }: { kind: CrossAppInsightKind }) {
  const meta = CROSS_APP_INSIGHT_META[kind];
  const { list, isLoading } = useCrossAppInsightList(kind);
  const rows = toGenericRows(kind, list);
  const dest = CROSS_APP_DEST[kind];

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/smart-insights">
          <ArrowLeft />
          Smart Insights
        </Link>
      </Button>
      <PageHeader title={meta.title} description={`${meta.desc} — ${rows.length} in ${meta.app}`} />

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Record</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={5} message="Loading…" />
              ) : rows.length === 0 ? (
                <TableEmpty colSpan={5} message="Nothing here right now." />
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sub}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(r.date)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.status}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={dest}>
                          Open {meta.app}
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
