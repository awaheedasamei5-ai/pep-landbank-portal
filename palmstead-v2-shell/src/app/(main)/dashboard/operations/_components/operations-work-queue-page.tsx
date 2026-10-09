"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isoDateOnly } from "@/lib/palmstead/format";
import { useOperationsOverview } from "./use-operations-overview";

// Real standalone "Work Queue" page -- the reference dashboard treats
// this as its own primary nav item, not just a dashboard widget, so it
// gets its own real page here too: every open issue, company-wide, with
// a real due-date countdown in place of the reference's generic "SLA"
// column (Palmstead issues track a target_date, not an SLA clock -- the
// real equivalent, not a borrowed label).
const PRIORITY_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  urgent: "destructive",
  high: "destructive",
  medium: "default",
  low: "outline",
  none: "outline",
};

function dueLabel(targetDate: string | null): { text: string; overdue: boolean } {
  if (!targetDate) return { text: "No due date", overdue: false };
  const today = isoDateOnly(new Date());
  if (targetDate < today) {
    const days = Math.round((new Date(today).getTime() - new Date(targetDate).getTime()) / 86400000);
    return { text: `${days}d overdue`, overdue: true };
  }
  if (targetDate === today) return { text: "Due today", overdue: false };
  const days = Math.round((new Date(targetDate).getTime() - new Date(today).getTime()) / 86400000);
  return { text: `Due in ${days}d`, overdue: false };
}

export function OperationsWorkQueuePage() {
  const { data, isLoading } = useOperationsOverview();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of data?.allOpenIssues ?? []) seen.set(i.projectId, i.projectIdentifier);
    return [...seen.entries()];
  }, [data?.allOpenIssues]);

  const filtered = useMemo(() => {
    const all = data?.allOpenIssues ?? [];
    return all.filter((issue) => {
      if (projectFilter !== "all" && issue.projectId !== projectFilter) return false;
      if (statusFilter !== "all" && issue.stateGroup !== statusFilter) return false;
      if (priorityFilter !== "all" && issue.priority !== priorityFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${issue.projectIdentifier}-${issue.sequence_id} ${issue.name} ${issue.assignees.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data?.allOpenIssues, search, projectFilter, statusFilter, priorityFilter]);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base leading-none">
          <ListChecks className="size-4" />
          Work queue -- {filtered.length} open issue{filtered.length === 1 ? "" : "s"}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search issues, assignees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56"
          />
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-36" size="sm">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map(([id, identifier]) => (
                <SelectItem key={id} value={id}>
                  {identifier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32" size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="backlog">Backlog</SelectItem>
              <SelectItem value="unstarted">Unstarted</SelectItem>
              <SelectItem value="started">In progress</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-32" size="sm">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="none">None</SelectItem>
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
        {!isLoading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No issues match the current filters.</p>
        )}
        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Assignees</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((issue) => {
                const due = dueLabel(issue.target_date);
                return (
                  <TableRow key={issue.id}>
                    <TableCell>
                      <Link href={`/dashboard/operations/${issue.projectId}/issues/${issue.id}`} className="hover:underline">
                        <span className="font-mono text-xs text-muted-foreground">
                          {issue.projectIdentifier}-{issue.sequence_id}
                        </span>{" "}
                        <span className="text-sm">{issue.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{issue.projectIdentifier}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {issue.assignees.length > 0 ? issue.assignees.join(", ") : "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" style={{ borderColor: issue.stateColor, color: issue.stateColor }}>
                        {issue.stateName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[issue.priority]} className="capitalize">
                        {issue.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-sm ${due.overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                      {due.text}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
