"use client";

import { AlertTriangle, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { friendlyError, useOutgoingSmsQueueSummary } from "./use-outgoing-sms";

function dateLabel(value: string | null): string {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Phase B item 5 (docs/plans/48 Sec 9): a read-only view across every real
// SMS outbox/queue in the system. Deliberately not a full schema
// unification of the 6 underlying tables -- this reads a counts-only
// summary RPC so Management can see what's pending or stuck in one place.
export function QueuePanel() {
  const summary = useOutgoingSmsQueueSummary();

  if (summary.isLoading) return <Skeleton className="h-64 w-full" />;
  if (summary.error) return <p className="text-destructive text-sm">{friendlyError(summary.error)}</p>;

  const rows = summary.data ?? [];
  const totalProblems = rows.reduce((sum, row) => sum + row.problem_count, 0);

  return (
    <div className="flex flex-col gap-4">
      {totalProblems > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-2 p-3 text-destructive text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            {totalProblems} message{totalProblems === 1 ? "" : "s"} across the sources below failed or need review.
          </CardContent>
        </Card>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Pending / awaiting review</TableHead>
              <TableHead>Failed / needs review</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.source_label}>
                <TableCell className="font-medium">{row.source_label}</TableCell>
                <TableCell>
                  {row.pending_count > 0 ? (
                    <Badge variant="outline">{row.pending_count}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.problem_count > 0 ? (
                    <Badge variant="destructive">{row.problem_count}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" /> {dateLabel(row.last_activity_at)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-xs">
        "Pending / awaiting review" includes messages still queued to send automatically, and the closing-SMS and
        overpayment-recalc drafts waiting in the Drafts tab for your approval. It does not include messages that have
        already sent successfully.
      </p>
    </div>
  );
}
