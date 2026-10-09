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
  );
}
