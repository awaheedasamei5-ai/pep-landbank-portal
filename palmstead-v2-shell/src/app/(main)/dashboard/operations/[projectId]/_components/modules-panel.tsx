"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { store } from "@openplane-web/lib/store-context";

// Phase 6 modules slice: real op_modules rows, real per-module issue counts
// via the real op_issue_modules join (module.service.ts's getModules).
// Unlike a cycle's status (derived from dates), a module's status is its
// own real stored column -- set at creation, changed explicitly.
const STATUS_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  "in-progress": "default",
  planned: "outline",
  backlog: "outline",
  paused: "outline",
  completed: "outline",
  cancelled: "destructive",
};

export const ModulesPanel = observer(function ModulesPanel({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const moduleStore = store.module;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await moduleStore.fetchModules(workspaceSlug, projectId);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load modules.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const moduleIds = moduleStore.getProjectModuleIds(projectId) ?? [];

  async function createModule() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await moduleStore.createModule(workspaceSlug, projectId, { name: name.trim() });
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create module.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 pt-6">
          <div className="flex-1 min-w-48">
            <Input placeholder="Module name (e.g. Phase 1 Grading)" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <SubmitButton type="button" loading={creating} onClick={createModule}>
            <Plus />
            New module
          </SubmitButton>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading real modules from Supabase…</p>}
      {!loading && moduleIds.length === 0 && <p className="text-sm text-muted-foreground">No modules yet.</p>}

      <div className="grid gap-3 xl:grid-cols-2">
        {moduleIds.map((id) => {
          const mod = moduleStore.getModuleById(id);
          if (!mod) return null;
          const total = mod.total_issues ?? 0;
          const completed = mod.completed_issues ?? 0;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          return (
            <Card key={id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{mod.name}</span>
                  <Badge variant={STATUS_VARIANT[mod.status ?? "planned"]} className="capitalize">
                    {mod.status ?? "planned"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {completed} / {total} issues completed
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
});
