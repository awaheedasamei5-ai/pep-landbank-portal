"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./StatusBadge";
import { TableEmpty } from "@/components/table-empty";
import { fmtLongDate } from "../../../shared/lib/format";
import type { LeaveRequest } from "../../../types/domain";

// Adapted from Shreyasmark1/leave-management-system's
// leave-requests-table.tsx -- same real shadcn Table composition, mapped
// to Palmstead's actual LeaveRequest shape (a `dates` array, not a
// startDate/endDate pair; `requestNo` as the real reference; agent name
// shown only when `showAgent`, same as the reference's `showEmployee`).
interface LeaveRequestsDataTableProps {
  requests: LeaveRequest[];
  showAgent?: boolean;
  actionSlot?: (request: LeaveRequest) => React.ReactNode;
  emptyMessage?: string;
}

export function LeaveRequestsDataTable({ requests, showAgent = false, actionSlot, emptyMessage = "No leave requests found." }: LeaveRequestsDataTableProps) {
  const hasActions = Boolean(actionSlot);
  const colSpan = (showAgent ? 6 : 5) + (hasActions ? 1 : 0);

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {requests.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          requests.map((request) => {
            const first = request.dates[0] ?? "";
            const last = request.dates[request.dates.length - 1] ?? "";
            const label = showAgent ? request.agentName : request.requestNo ?? "Leave request";
            return (
              <div key={request.id} className="grid gap-3 rounded-lg border p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/leave/requests/${request.id}`} className="font-medium hover:underline">
                      {label}
                    </Link>
                    {request.isEmergency && <Badge variant="destructive" className="ml-2">Emergency</Badge>}
                    <div className="mt-1 text-sm text-muted-foreground">
                      {fmtLongDate(first)}{last && last !== first ? ` – ${fmtLongDate(last)}` : ""}
                      {request.dates.length > 1 && last !== first && <span className="ml-1">({request.daysCount} selected days)</span>}
                    </div>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
                  <span className="text-muted-foreground">{request.daysCount} working day{request.daysCount === 1 ? "" : "s"}</span>
                  <div className="flex items-center gap-1">
                    {actionSlot?.(request)}
                    {!hasActions && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/leave/requests/${request.id}`}>
                          <FileText />
                          View
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="hidden md:block">
    <Table>
      <TableHeader>
        <TableRow>
          {showAgent && <TableHead>Staff</TableHead>}
          <TableHead>From</TableHead>
          <TableHead>To</TableHead>
          <TableHead>Days</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">{hasActions ? "Actions" : "Letter"}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableEmpty colSpan={colSpan} message={emptyMessage} />
        ) : (
          requests.map((request) => {
            const first = request.dates[0] ?? "";
            const last = request.dates[request.dates.length - 1] ?? "";
            return (
              <TableRow key={request.id}>
                {showAgent && (
                  <TableCell>
                    <Link href={`/dashboard/leave/requests/${request.id}`} className="font-medium hover:underline">
                      {request.agentName}
                    </Link>
                    {request.isEmergency && (
                      <Badge variant="destructive" className="ml-2">
                        Emergency
                      </Badge>
                    )}
                    {request.requestNo && <div className="text-xs text-muted-foreground">{request.requestNo}</div>}
                  </TableCell>
                )}
                <TableCell>{fmtLongDate(first)}</TableCell>
                <TableCell>{last && last !== first ? fmtLongDate(last) : "—"}</TableCell>
                <TableCell>{request.daysCount}</TableCell>
                <TableCell>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {actionSlot?.(request)}
                    {!showAgent && (
                      <Button asChild variant="ghost" size="icon-sm" aria-label="View details">
                        <Link href={`/dashboard/leave/requests/${request.id}`}>
                          <FileText />
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
      </div>
    </>
  );
}
