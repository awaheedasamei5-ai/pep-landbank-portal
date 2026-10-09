"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type AuditLogRow, useOperationsAuditLog } from "./use-operations-audit-log";

// Real "Audit Log" page -- the reference dashboard's own sidebar item,
// grounded in real op_issue_activity rows (not a mockup). Every change
// patchIssue/escalateIssue write a real activity row for is here,
// filterable by project/actor/free text, paginated server-side-shaped
// (client-filters, real slice -- the dataset is company-wide activity on
// one workspace, small enough that this stays correct without a bespoke
// SQL view; see use-operations-audit-log.ts for the real reasoning).
function describe(row: AuditLogRow): string {
  if (row.verb === "escalated") return `escalated to a colleague${row.comment ? `: "${row.comment}"` : ""}`;
  if (row.verb === "created") return "created this issue";
  if (row.verb === "commented") return "commented";
  if (row.field) return `changed ${row.field} ${row.oldValue ? `from ${row.oldValue} ` : ""}to ${row.newValue}`;
  return row.verb;
}

export function OperationsAuditLog() {
  const [projectId, setProjectId] = useState("all");
  const [actorKey, setActorKey] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useOperationsAuditLog({ projectId, actorKey, search, page });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base leading-none">
          <History className="size-4" />
          Audit log
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search activity..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-8 w-48"
          />
          <Select
            value={projectId}
            onValueChange={(v) => {
              setProjectId(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {data?.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.identifier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={actorKey}
            onValueChange={(v) => {
              setActorKey(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="Actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {data?.actors.map((a) => (
                <SelectItem key={a.key} value={a.key}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {!isLoading && data?.rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity matches the current filters.</p>
        )}
        {!isLoading && data && data.rows.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">{row.actorName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{describe(row)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/operations/${row.projectId}/issues/${row.issueId}`}
                        className="text-sm hover:underline"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.projectIdentifier}-{row.issueSequence}
                        </span>{" "}
                        {row.issueName}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} &middot; {data.total} event{data.total === 1 ? "" : "s"}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
