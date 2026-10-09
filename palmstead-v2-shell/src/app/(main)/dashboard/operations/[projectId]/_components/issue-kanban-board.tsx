"use client";

import { observer } from "mobx-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { store } from "@openplane-web/lib/store-context";
import type { IState } from "@plane/types";

// Phase 6 kanban slice: real columns from op_states, real cards from
// op_issues grouped by state_id (getIssuesFromServer's group_by:"state"
// path). No drag-and-drop yet -- moving a card between columns is a real
// state_id patch via the "move to" select, not a fake visual reorder.
const PRIORITY_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  urgent: "destructive",
  high: "destructive",
  medium: "default",
  low: "outline",
  none: "outline",
};

export const IssueKanbanBoard = observer(function IssueKanbanBoard({
  workspaceSlug,
  projectId,
  projectIdentifier,
}: {
  workspaceSlug: string;
  projectId: string;
  projectIdentifier?: string;
}) {
  const issueRoot = store.issue;
  const projectIssues = issueRoot.projectIssues;
  const stateStore = issueRoot.rootStore.state;

  const states = (stateStore.getProjectStates(projectId) ?? []).slice().sort((a: IState, b: IState) => a.sequence - b.sequence);

  async function moveIssue(issueId: string, stateId: string) {
    await projectIssues.updateIssue(workspaceSlug, projectId, issueId, { state_id: stateId });
    // Real gap found live: plane's own optimistic regroup-on-update
    // (updateIssueList) keys off issueFilterStore's persisted
    // displayFilters.group_by, which this phase never populates (no
    // project_user_properties-equivalent table/fetchFilters wiring yet) --
    // so a moved card doesn't jump columns until the board re-reads real
    // grouped data from the server. Simple and correct over optimistic.
    await projectIssues.fetchIssues(workspaceSlug, projectId, "mutation", { canGroup: true, perPageCount: 100, groupedBy: "state" });
  }

  if (states.length === 0) {
    return <p className="text-sm text-muted-foreground">No states yet for this project.</p>;
  }

  return (
    <div className="grid grid-flow-col auto-cols-[280px] gap-4 overflow-x-auto pb-2">
      {states.map((state) => {
        const issueIds = (projectIssues.groupedIssueIds?.[state.id] as string[] | undefined) ?? [];
        return (
          <div key={state.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: state.color }} />
              <span className="text-sm font-medium">{state.name}</span>
              <span className="text-xs text-muted-foreground">{issueIds.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {issueIds.map((id) => {
                const issue = issueRoot.issues.getIssueById(id);
                if (!issue) return null;
                return (
                  <Card key={id}>
                    <CardContent className="grid gap-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/dashboard/operations/${projectId}/issues/${id}`}
                          className="font-mono text-xs text-muted-foreground hover:underline"
                        >
                          {projectIdentifier}-{issue.sequence_id}
                        </Link>
                        <Badge variant={PRIORITY_VARIANT[issue.priority ?? "none"]} className="h-5 px-1.5 text-[10px] capitalize">
                          {issue.priority ?? "none"}
                        </Badge>
                      </div>
                      <Link href={`/dashboard/operations/${projectId}/issues/${id}`} className="text-sm hover:underline">
                        {issue.name}
                      </Link>
                      <Select value={issue.state_id ?? undefined} onValueChange={(value) => moveIssue(id, value)}>
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue placeholder="Move to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {states.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                );
              })}
              {issueIds.length === 0 && <p className="px-1 text-xs text-muted-foreground">No issues.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
});
