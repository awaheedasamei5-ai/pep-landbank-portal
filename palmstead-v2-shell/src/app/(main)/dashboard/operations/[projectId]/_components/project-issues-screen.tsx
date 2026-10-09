"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { observer } from "mobx-react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { store } from "@openplane-web/lib/store-context";
import { ALL_ISSUES } from "@plane/constants";

// Phase 6's first issues slice: a real list (not kanban/grouped yet) for one
// project, against the real op_issues/op_states rows rewired in
// issue.service.ts / project-state.service.ts. Create + list only -- detail,
// kanban, cycles/modules are later slices per
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newIssueName, setNewIssueName] = useState("");
  const [creating, setCreating] = useState(false);

  const issueRoot = store.issue;
  const projectIssues = issueRoot.projectIssues;
  const stateStore = issueRoot.rootStore.state;
  const project = store.projectRoot.project.getProjectById(projectId);

  useEffect(() => {
    store.router.setQuery({ workspaceSlug: WORKSPACE_SLUG, projectId });
    let cancelled = false;
    (async () => {
      try {
        await stateStore.fetchProjectStates(WORKSPACE_SLUG, projectId);
        await projectIssues.fetchIssues(WORKSPACE_SLUG, projectId, "init-loader", { canGroup: false, perPageCount: 100 });
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
  }, [projectId]);

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

      <PageHeader title={project?.name ?? "Project"} description={project ? `${project.identifier} · real op_issues rows` : undefined} />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <Card>
            <CardContent className="grid gap-3 pt-6">
              <div className="flex gap-2">
                <Input
                  placeholder="New issue name"
                  value={newIssueName}
                  onChange={(e) => setNewIssueName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createIssue()}
                />
                <SubmitButton type="button" loading={creating} onClick={createIssue}>
                  <Plus />
                  Add
                </SubmitButton>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-7">
          <Card>
            <CardContent className="grid gap-2 pt-6">
              {loading && <p className="text-sm text-muted-foreground">Loading real issues from Supabase…</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {!loading && !error && issueIds.length === 0 && (
                <p className="text-sm text-muted-foreground">No issues yet in {project?.identifier ?? "this project"}.</p>
              )}
              {!loading &&
                issueIds.map((id) => {
                  const issue = issueRoot.issues.getIssueById(id);
                  if (!issue) return null;
                  const state = issue.state_id ? stateStore.stateMap?.[issue.state_id] : undefined;
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
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
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
});
