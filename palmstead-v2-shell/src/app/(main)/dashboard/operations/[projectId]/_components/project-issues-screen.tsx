"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { observer } from "mobx-react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { store } from "@openplane-web/lib/store-context";
import { ensureCurrentPlaneUser } from "@openplane-web/lib/palmstead-adapters";
import { requireSupabase } from "@/lib/supabase.client";
import { ALL_ISSUES } from "@plane/constants";
import { IssueKanbanBoard } from "./issue-kanban-board";
import { CyclesPanel } from "./cycles-panel";
import { ModulesPanel } from "./modules-panel";
import { ProjectSettingsPanel } from "./project-settings-panel";

// Phase 6 issues slice: a real list + a real kanban board for one project,
// against the real op_issues/op_states rows rewired in issue.service.ts /
// project-state.service.ts. Detail, cycles/modules are later slices per
// docs/plans/03-operations-tracker-plane-port.md.
const WORKSPACE_SLUG = "palmstead";

const PRIORITY_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  urgent: "destructive",
  high: "destructive",
  medium: "default",
  low: "outline",
  none: "outline",
};

export const ProjectIssuesScreen = observer(function ProjectIssuesScreen({ projectId }: { projectId: string }) {
  const [view, setView] = useState<"list" | "board" | "cycles" | "modules" | "settings">("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newIssueName, setNewIssueName] = useState("");
  const [creating, setCreating] = useState(false);

  const issueRoot = store.issue;
  const projectIssues = issueRoot.projectIssues;
  const stateStore = issueRoot.rootStore.state;
  const labelStore = issueRoot.rootStore.label;
  const project = store.projectRoot.project.getProjectById(projectId);

  useEffect(() => {
    store.router.setQuery({ workspaceSlug: WORKSPACE_SLUG, projectId });
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await ensureCurrentPlaneUser(requireSupabase(), store.user);
        if (!project) await store.projectRoot.project.fetchProjectDetails(WORKSPACE_SLUG, projectId);
        await Promise.all([stateStore.fetchProjectStates(WORKSPACE_SLUG, projectId), labelStore.fetchProjectLabels(WORKSPACE_SLUG, projectId)]);
        if (view === "board") {
          await projectIssues.fetchIssues(WORKSPACE_SLUG, projectId, "init-loader", {
            canGroup: true,
            perPageCount: 100,
            groupedBy: "state",
          });
        } else if (view === "list") {
          await projectIssues.fetchIssues(WORKSPACE_SLUG, projectId, "init-loader", { canGroup: false, perPageCount: 100 });
        }
        // cycles/modules views load their own data in their own panels
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load issues.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, view]);

  const issueIds = (projectIssues.groupedIssueIds?.[ALL_ISSUES] as string[] | undefined) ?? [];

  async function createIssue() {
    if (!newIssueName.trim()) return;
    setCreating(true);
    try {
      await projectIssues.createIssue(WORKSPACE_SLUG, projectId, { name: newIssueName.trim() });
      setNewIssueName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create issue.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/operations">
          <ArrowLeft />
          Operations Tracker
        </Link>
      </Button>

      <PageHeader
        title={project?.name ?? "Project"}
        description={project ? `${project.identifier} · real op_issues rows` : undefined}
        action={
          <Tabs value={view} onValueChange={(v) => setView(v as "list" | "board" | "cycles" | "modules" | "settings")}>
            <TabsList>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="cycles">Cycles</TabsTrigger>
              <TabsTrigger value="modules">Modules</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {view !== "cycles" && view !== "modules" && view !== "settings" && (
        <Card className="mb-4">
          <CardContent className="flex gap-2 pt-6">
            <Input
              placeholder="New issue name"
              value={newIssueName}
              onChange={(e) => setNewIssueName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createIssue()}
              className="max-w-md"
            />
            <SubmitButton type="button" loading={creating} onClick={createIssue}>
              <Plus />
              Add
            </SubmitButton>
          </CardContent>
        </Card>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {view === "cycles" ? (
        <CyclesPanel workspaceSlug={WORKSPACE_SLUG} projectId={projectId} />
      ) : view === "modules" ? (
        <ModulesPanel workspaceSlug={WORKSPACE_SLUG} projectId={projectId} />
      ) : view === "settings" ? (
        <ProjectSettingsPanel workspaceSlug={WORKSPACE_SLUG} projectId={projectId} />
      ) : view === "list" ? (
        <Card>
          <CardContent className="grid gap-2 pt-6">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              ))}
            {!loading && !error && issueIds.length === 0 && (
              <p className="text-sm text-muted-foreground">No issues yet in {project?.identifier ?? "this project"}.</p>
            )}
            {!loading &&
              issueIds.map((id) => {
                const issue = issueRoot.issues.getIssueById(id);
                if (!issue) return null;
                const state = issue.state_id ? stateStore.stateMap?.[issue.state_id] : undefined;
                return (
                  <Link
                    key={id}
                    href={`/dashboard/operations/${projectId}/issues/${id}`}
                    className="flex items-center justify-between gap-3 border-b py-2 last:border-0 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {project?.identifier}-{issue.sequence_id}
                      </span>
                      <span className="text-sm">{issue.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {state && (
                        <Badge variant="outline" style={{ borderColor: state.color, color: state.color }}>
                          {state.name}
                        </Badge>
                      )}
                      <Badge variant={PRIORITY_VARIANT[issue.priority ?? "none"]} className="capitalize">
                        {issue.priority ?? "none"}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading board…</p>
      ) : (
        <IssueKanbanBoard workspaceSlug={WORKSPACE_SLUG} projectId={projectId} projectIdentifier={project?.identifier} />
      )}
    </div>
  );
});
