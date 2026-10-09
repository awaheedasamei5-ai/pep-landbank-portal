"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
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

  return (
    <div>
      <PageHeader
        title="Operations Tracker"
        description="Real projects from the raw-duplicated plane data layer (Phase 4b) -- workspace shell and issues/kanban come next."
        action={
          <Button disabled>
            <Plus />
            New project
          </Button>
        }
      />

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
