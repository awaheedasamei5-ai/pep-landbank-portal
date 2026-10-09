"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { store } from "@openplane-web/lib/store-context";
import { ensureCurrentPlaneUser } from "@openplane-web/lib/palmstead-adapters";
import { requireSupabase } from "@/lib/supabase.client";
import { OperationsCommandCenter } from "./operations-command-center";
import { OperationsWorkQueuePage } from "./operations-work-queue-page";
import { OperationsAuditLog } from "./operations-audit-log";
import { MyScheduleScreen } from "./my-schedule-screen";

// Home page: a real Command Center (operations-command-center.tsx) built
// from real op_issues/op_states/op_issue_activity rows across every
// project, same house pattern as dashboard/default's manager overview.
// Work Queue and Audit Log are the reference dashboard's own standalone
// nav items -- given real top-level tabs here rather than folded back
// into the Overview, since the reference treats them as primary pages,
// not widgets. The project list stays as the real project switcher.
const WORKSPACE_SLUG = "palmstead";

export const OperationsTrackerScreen = observer(function OperationsTrackerScreen() {
  const [view, setView] = useState<"overview" | "schedule" | "queue" | "audit">("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIdentifier, setNewIdentifier] = useState("");
  const [creating, setCreating] = useState(false);
  const projectStore = store.projectRoot.project;

  useEffect(() => {
    store.router.setQuery({ workspaceSlug: WORKSPACE_SLUG });
    let cancelled = false;
    (async () => {
      try {
        await ensureCurrentPlaneUser(requireSupabase(), store.user);
        await store.workspaceRoot.fetchWorkspaces();
        await projectStore.fetchProjects(WORKSPACE_SLUG);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Operations Tracker data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectIds = projectStore.workspaceProjectIds ?? [];

  async function createProject() {
    if (!newName.trim() || !newIdentifier.trim()) return;
    setCreating(true);
    try {
      await projectStore.createProject(WORKSPACE_SLUG, { name: newName.trim(), identifier: newIdentifier.trim().toUpperCase() });
      setNewName("");
      setNewIdentifier("");
      setShowNewProject(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Operations Tracker"
        description="Company-wide view across every real project."
        action={
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="schedule">My Schedule</TabsTrigger>
              <TabsTrigger value="queue">Work Queue</TabsTrigger>
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {view === "overview" && (
        <>
          <div className="mb-6">
            <OperationsCommandCenter onNewProject={() => setShowNewProject(true)} />
          </div>

          <div id="projects-section" className="mb-3 flex scroll-mt-20 items-center justify-between">
            <h2 className="font-semibold text-lg">Projects</h2>
            <Button onClick={() => setShowNewProject((v) => !v)} size="sm">
              <Plus />
              New project
            </Button>
          </div>

          {showNewProject && (
            <Card className="mb-4">
              <CardContent className="flex gap-2 pt-6">
                <Input placeholder="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-xs" />
                <Input
                  placeholder="Identifier (e.g. OPS)"
                  value={newIdentifier}
                  onChange={(e) => setNewIdentifier(e.target.value)}
                  className="max-w-40"
                />
                <SubmitButton type="button" loading={creating} onClick={createProject}>
                  Create
                </SubmitButton>
              </CardContent>
            </Card>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {loading && (
            <div className="grid gap-4 xl:grid-cols-12">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="xl:col-span-4">
                  <Card>
                    <CardHeader>
                      <Skeleton className="h-5 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full" />
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && (
            <div className="grid gap-4 xl:grid-cols-12">
              {projectIds.length === 0 && (
                <Card className="xl:col-span-12">
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    No projects yet in the "{WORKSPACE_SLUG}" workspace.
                  </CardContent>
                </Card>
              )}
              {projectIds.map((id) => {
                const project = projectStore.getProjectById(id);
                if (!project) return null;
                return (
                  <Link key={id} href={`/dashboard/operations/${id}`} className="xl:col-span-4">
                    <Card className="transition-colors hover:border-primary">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-base">
                          <span>{project.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{project.identifier}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        {project.description || "No description."}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "schedule" && <MyScheduleScreen />}
      {view === "queue" && <OperationsWorkQueuePage />}
      {view === "audit" && <OperationsAuditLog />}
    </div>
  );
});
