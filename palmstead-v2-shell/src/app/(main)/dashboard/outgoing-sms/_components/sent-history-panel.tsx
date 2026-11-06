"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { friendlyError, useOutboundDrafts, useSmsSendStats } from "./use-outgoing-sms";

const KIND_LABELS: Record<string, string> = {
  lead_closing_sms: "Closing / nurture",
};

function dateLabel(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SegmentCostSummary() {
  const stats = useSmsSendStats(30);
  if (stats.isLoading || !stats.data) return null;
  const { sendCount, totalSegments, estimatedCostGhs } = stats.data;
  return (
    <div className="mb-3 flex flex-wrap gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
      <span>
        <span className="font-medium">{sendCount}</span> real sends logged (last 30 days)
      </span>
      <span>
        <span className="font-medium">{totalSegments}</span> segments
      </span>
      <span className="text-muted-foreground">
        {estimatedCostGhs != null
          ? `~GHS ${estimatedCostGhs.toFixed(2)} estimated`
          : "Cost unknown -- set a per-segment GHS rate in app_config.sms_cost_per_segment_ghs"}
      </span>
      <span className="text-muted-foreground">(not every SMS kind is logged here yet -- see docs/plans/48)</span>
    </div>
  );
}

export function SentHistoryPanel() {
  const sent = useOutboundDrafts("sent");
  const dismissed = useOutboundDrafts("dismissed");

  if (sent.isLoading || dismissed.isLoading) return <Skeleton className="h-64 w-full" />;
  if (sent.error) return <p className="text-destructive text-sm">{friendlyError(sent.error)}</p>;

  const rows = [...(sent.data ?? []), ...(dismissed.data ?? [])].sort(
    (a, b) => (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at),
  );

  if (rows.length === 0) {
    return (
      <div>
        <SegmentCostSummary />
        <p className="text-muted-foreground text-sm">No outgoing SMS has been sent or dismissed yet.</p>
      </div>
    );
  }

  return (
    <div>
      <SegmentCostSummary />
      <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recipient</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.recipient_name}</TableCell>
              <TableCell>{KIND_LABELS[row.kind] ?? row.kind}</TableCell>
              <TableCell>
                <Badge variant={row.status === "sent" ? "default" : "secondary"}>{row.status}</Badge>
              </TableCell>
              <TableCell>{dateLabel(row.sent_at ?? row.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
