"use client";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { CollisionPriority } from "@dnd-kit/abstract";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider, type DragEndEvent, type DragOverEvent, type DragStartEvent, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { store } from "@openplane-web/lib/store-context";
import type { IState } from "@plane/types";

// Phase 6 kanban slice: real columns from op_states, real cards from
// op_issues grouped by state_id (getIssuesFromServer's group_by:"state"
// path). Drag-and-drop uses the shell's own real @dnd-kit/react pattern
// (src/app/(main)/dashboard/kanban/_components/kanban.tsx is the reference
// -- AGENTS.md: inspect the closest existing screen first). Cross-column
// drag writes a real state_id patch; same-column reorder is cosmetic only
// (resets to server sort_order on the next fetch) -- persisting a custom
// drag order is out of this slice's scope.
const PRIORITY_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  urgent: "destructive",
  high: "destructive",
  medium: "default",
  low: "outline",
  none: "outline",
};

type Board = Record<string, string[]>;

function buildBoard(states: IState[], groupedIssueIds: Record<string, unknown> | undefined): Board {
  const board: Board = {};
  states.forEach((s) => {
    board[s.id] = ((groupedIssueIds?.[s.id] as string[] | undefined) ?? []).slice();
  });
  return board;
}

function IssueCard({ id, index, stateId, projectId, projectIdentifier }: { id: string; index: number; stateId: string; projectId: string; projectIdentifier?: string }) {
  const issueRoot = store.issue;
  const issue = issueRoot.issues.getIssueById(id);
  const { isDragging, ref, handleRef } = useSortable({
    id,
    index,
    type: "issue",
    accept: "issue",
    group: stateId,
    data: { type: "issue", issueId: id, stateId },
  });
  if (!issue) return null;
  return (
    <div ref={ref} className={cn("touch-none", isDragging && "opacity-30")}>
      <Card ref={handleRef} className="cursor-grab active:cursor-grabbing">
        <CardContent className="grid gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/dashboard/operations/${projectId}/issues/${id}`}
              className="font-mono text-xs text-muted-foreground hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {projectIdentifier}-{issue.sequence_id}
            </Link>
            <Badge variant={PRIORITY_VARIANT[issue.priority ?? "none"]} className="h-5 px-1.5 text-[10px] capitalize">
              {issue.priority ?? "none"}
            </Badge>
          </div>
          <Link href={`/dashboard/operations/${projectId}/issues/${id}`} className="text-sm hover:underline" onClick={(e) => e.stopPropagation()}>
            {issue.name}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function KanbanColumn({ state, issueIds, projectId, projectIdentifier }: { state: IState; issueIds: string[]; projectId: string; projectIdentifier?: string }) {
  const dropTarget = useDroppable({
    id: state.id,
    type: "issue-container",
    accept: "issue",
    collisionPriority: CollisionPriority.Low,
    data: { type: "issue-container", stateId: state.id },
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: state.color }} />
        <span className="text-sm font-medium">{state.name}</span>
        <span className="text-xs text-muted-foreground">{issueIds.length}</span>
      </div>
      <div
        ref={dropTarget.ref}
        className={cn("flex min-h-16 flex-col gap-2 rounded-md p-1 transition-colors", dropTarget.isDropTarget && "bg-muted")}
      >
        {issueIds.map((id, index) => (
          <IssueCard key={id} id={id} index={index} stateId={state.id} projectId={projectId} projectIdentifier={projectIdentifier} />
        ))}
        {issueIds.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No issues.</p>}
      </div>
    </div>
  );
}

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
  const [board, setBoard] = useState<Board>(() => buildBoard(states, projectIssues.groupedIssueIds));
  const boardBeforeDrag = useRef<Board>(board);

  // Real data changed (initial fetch, or a server-confirmed move) -- resync
  // the local drag-mirror from the actual store, not just on mount.
  useEffect(() => {
    setBoard(buildBoard(states, projectIssues.groupedIssueIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states.map((s) => s.id).join(","), states.map((s) => (projectIssues.groupedIssueIds?.[s.id] as string[] | undefined)?.join(",") ?? "").join("|")]);

  function handleDragStart(event: DragStartEvent) {
    if (event.operation.source?.type === "issue") boardBeforeDrag.current = board;
  }

  function handleDragOver(event: DragOverEvent) {
    if (event.operation.source?.type === "issue") setBoard((current) => move(current, event));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { source } = event.operation;
    if (!source || source.type !== "issue") return;
    if (event.canceled) {
      setBoard(boardBeforeDrag.current);
      return;
    }
    const issueId = String(source.id);
    const fromStateId = Object.keys(boardBeforeDrag.current).find((stateId) => boardBeforeDrag.current[stateId].includes(issueId));
    const toStateId = Object.keys(board).find((stateId) => board[stateId].includes(issueId));
    if (toStateId && toStateId !== fromStateId) {
      try {
        await projectIssues.updateIssue(workspaceSlug, projectId, issueId, { state_id: toStateId });
        // Same real gap as before dnd: the store's optimistic regroup
        // isn't wired (no persisted displayFilters.group_by), so refetch
        // the grouped board to reconcile the local drag-mirror with the
        // server's real state.
        await projectIssues.fetchIssues(workspaceSlug, projectId, "mutation", { canGroup: true, perPageCount: 100, groupedBy: "state" });
      } catch {
        setBoard(boardBeforeDrag.current);
      }
    }
  }

  if (states.length === 0) {
    return <p className="text-sm text-muted-foreground">No states yet for this project.</p>;
  }

  return (
    <DragDropProvider onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="grid grid-flow-col auto-cols-[280px] gap-4 overflow-x-auto pb-2">
        {states.map((state) => (
          <KanbanColumn key={state.id} state={state} issueIds={board[state.id] ?? []} projectId={projectId} projectIdentifier={projectIdentifier} />
        ))}
      </div>
    </DragDropProvider>
  );
});
