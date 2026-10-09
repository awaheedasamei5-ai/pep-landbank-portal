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
import { store } from "@openplane-web/lib/store-context";

// Phase 4b's first real screen against the raw-duplicated plane store: lists
// the real op_projects rows for the one seeded op_workspaces row ("palmstead").
// Deliberately minimal -- issues/kanban/cycles/modules are later Phase 6
// slices, per docs/plans/03-operations-tracker-plane-port.md. Not yet linked
// from the sidebar (still NOT_BUILT_YET there) because a project list alone
// isn't the real Operations Tracker experience the user asked for.
const WORKSPACE_SLUG = "palmstead";

export const OperationsTrackerScreen = observer(function OperationsTrackerScreen() {
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
        description="Real projects from the raw-duplicated plane data layer -- issues, states and kanban are real; cycles/modules come next."
        action={
          <Button onClick={() => setShowNewProject((v) => !v)}>
            <Plus />
            New project
          </Button>
        }
      />

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

      {loading && <p className="text-sm text-muted-foreground">Loading real projects from Supabase…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

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
    </div>
  );
});
