"use client";

import { useState } from "react";
import { observer } from "mobx-react";
import { Bookmark, Check, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { store } from "@openplane-web/lib/store-context";

export type IssueFilters = { priority: string | null; stateGroup: string | null };

// Real saved Views -- a project-scoped name + the current List filter
// state (priority/status group), stored in op_views.query (plane's own
// real IIssueFilterOptions shape, see palmstead-adapters.ts's toPlaneView
// for why the simpler bag was chosen over the full rich_filters tree).
// Lives on the real plane ProjectViewStore already copied into this app
// (project-view.store.ts) -- only view.service.ts needed rewiring to a
// real op_views table, same recipe as cycles/modules before it.
export const ViewsPanel = observer(function ViewsPanel({
  workspaceSlug,
  projectId,
  activeFilters,
  onApply,
}: {
  workspaceSlug: string;
  projectId: string;
  activeFilters: IssueFilters;
  onApply: (filters: IssueFilters) => void;
}) {
  const viewStore = store.projectView;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const views = viewStore.getProjectViews(projectId) ?? [];
  const hasActiveFilters = Boolean(activeFilters.priority || activeFilters.stateGroup);

  async function saveView() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await viewStore.createView(workspaceSlug, projectId, {
        name: newName.trim(),
        query: {
          priority: activeFilters.priority ? [activeFilters.priority] : null,
          state_group: activeFilters.stateGroup ? [activeFilters.stateGroup] : null,
        },
      });
      setNewName("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save view.");
    } finally {
      setSaving(false);
    }
  }

  function applyView(query: { priority?: string[] | null; state_group?: string[] | null }) {
    onApply({
      priority: query.priority?.[0] ?? null,
      stateGroup: query.state_group?.[0] ?? null,
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base leading-none">
            <Bookmark className="size-4" />
            Saved views
          </CardTitle>
          <CardDescription>Save the List tab's current filters as a one-click shortcut.</CardDescription>
        </div>
        <Button size="sm" variant="outline" disabled={!hasActiveFilters} onClick={() => setCreating((v) => !v)}>
          <Plus />
          Save current filters
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {creating && (
          <div className="flex items-center gap-2 border-b pb-3">
            <Input
              placeholder="View name (e.g. My high priority)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="max-w-xs"
              autoFocus
            />
            <SubmitButton type="button" size="sm" loading={saving} onClick={saveView}>
              Save
            </SubmitButton>
          </div>
        )}
        {!hasActiveFilters && !creating && (
          <p className="text-sm text-muted-foreground">
            Set a priority or status filter on the List tab, then come back here to save it.
          </p>
        )}
        {views.length === 0 && <p className="text-sm text-muted-foreground">No saved views yet.</p>}
        {views.map((view) => {
          const q = view.query as { priority?: string[] | null; state_group?: string[] | null };
          const isActive = (q.priority?.[0] ?? null) === activeFilters.priority && (q.state_group?.[0] ?? null) === activeFilters.stateGroup;
          return (
            <div key={view.id} className="flex items-center justify-between gap-2 border-b py-2 last:border-0">
              <button type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => applyView(q)}>
                {isActive && <Check className="size-3.5 text-primary" />}
                <span className="font-medium text-sm">{view.name}</span>
                <div className="flex gap-1">
                  {q.priority?.[0] && (
                    <Badge variant="outline" className="capitalize">
                      {q.priority[0]}
                    </Badge>
                  )}
                  {q.state_group?.[0] && (
                    <Badge variant="outline" className="capitalize">
                      {q.state_group[0]}
                    </Badge>
                  )}
                </div>
              </button>
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="icon-sm">
                    <Trash2 className="size-4" />
                  </Button>
                }
                title={`Delete "${view.name}"?`}
                description="This only removes the saved shortcut -- no issues are affected."
                confirmLabel="Delete"
                onConfirm={() => viewStore.deleteView(workspaceSlug, projectId, view.id)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
});
