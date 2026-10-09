"use client";

import { useState } from "react";
import { observer } from "mobx-react";
import { Plus, Trash2, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SubmitButton } from "@/components/submit-button";
import { store } from "@openplane-web/lib/store-context";

// Phase 6 settings slice: the data layer (project-state.service.ts /
// issue_label.service.ts) was already real since Phase 4b -- this is the
// first UI that actually reaches createState/updateState/deleteState/
// markStateAsDefault and createLabel/updateLabel/deleteLabel. Without it
// every project was stuck on the 5 states seeded at creation with no way
// to rename, recolor, reorder, add, or remove one.
const GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"] as const;
const GROUP_LABEL: Record<(typeof GROUPS)[number], string> = {
  backlog: "Backlog",
  unstarted: "Unstarted",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ProjectSettingsPanel = observer(function ProjectSettingsPanel({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [newStateName, setNewStateName] = useState("");
  const [newStateGroup, setNewStateGroup] = useState<(typeof GROUPS)[number]>("unstarted");
  const [newStateColor, setNewStateColor] = useState("#60646C");
  const [creatingState, setCreatingState] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#60646C");
  const [creatingLabel, setCreatingLabel] = useState(false);

  const stateStore = store.state;
  const labelStore = store.label;
  const states = (stateStore.getProjectStates(projectId) ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const labels = labelStore.getProjectLabels(projectId) ?? [];

  async function createState() {
    if (!newStateName.trim()) return;
    setCreatingState(true);
    try {
      await stateStore.createState(workspaceSlug, projectId, { name: newStateName.trim(), group: newStateGroup, color: newStateColor });
      setNewStateName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create state.");
    } finally {
      setCreatingState(false);
    }
  }

  async function createLabel() {
    if (!newLabelName.trim()) return;
    setCreatingLabel(true);
    try {
      await labelStore.createLabel(workspaceSlug, projectId, { name: newLabelName.trim(), color: newLabelColor });
      setNewLabelName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create label.");
    } finally {
      setCreatingLabel(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {error && <p className="text-sm text-destructive xl:col-span-2">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">States</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {states.map((s) => (
            <div key={s.id} className="flex items-center gap-2 border-b pb-2 last:border-0">
              <Input
                type="color"
                defaultValue={s.color}
                className="h-8 w-10 p-1"
                onBlur={(e) => e.target.value !== s.color && stateStore.updateState(workspaceSlug, projectId, s.id, { color: e.target.value })}
              />
              <Input
                defaultValue={s.name}
                className="h-8 flex-1"
                onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && stateStore.updateState(workspaceSlug, projectId, s.id, { name: e.target.value.trim() })}
              />
              <Badge variant="outline" className="shrink-0">
                {GROUP_LABEL[s.group as (typeof GROUPS)[number]] ?? s.group}
              </Badge>
              {s.default ? (
                <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Set as default"
                  onClick={() => stateStore.markStateAsDefault(workspaceSlug, projectId, s.id)}
                >
                  <Star className="size-4" />
                </Button>
              )}
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="icon-sm" disabled={states.length <= 1}>
                    <Trash2 className="size-4" />
                  </Button>
                }
                title={`Delete "${s.name}"?`}
                description="Issues in this state keep their state_id pointing nowhere valid -- move them first."
                confirmLabel="Delete"
                onConfirm={() => stateStore.deleteState(workspaceSlug, projectId, s.id)}
              />
            </div>
          ))}
          <div className="flex items-end gap-2 pt-2">
            <Input type="color" value={newStateColor} onChange={(e) => setNewStateColor(e.target.value)} className="h-9 w-10 p-1" />
            <Input placeholder="New state name" value={newStateName} onChange={(e) => setNewStateName(e.target.value)} className="flex-1" />
            <Select value={newStateGroup} onValueChange={(v) => setNewStateGroup(v as (typeof GROUPS)[number])}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GROUP_LABEL[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SubmitButton type="button" loading={creatingState} onClick={createState}>
              <Plus />
            </SubmitButton>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Labels</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {labels.length === 0 && <p className="text-sm text-muted-foreground">No labels yet.</p>}
          {labels.map((l) => (
            <div key={l.id} className="flex items-center gap-2 border-b pb-2 last:border-0">
              <Input
                type="color"
                defaultValue={l.color}
                className="h-8 w-10 p-1"
                onBlur={(e) => e.target.value !== l.color && labelStore.updateLabel(workspaceSlug, projectId, l.id, { color: e.target.value })}
              />
              <Input
                defaultValue={l.name}
                className="h-8 flex-1"
                onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && labelStore.updateLabel(workspaceSlug, projectId, l.id, { name: e.target.value.trim() })}
              />
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="icon-sm">
                    <Trash2 className="size-4" />
                  </Button>
                }
                title={`Delete "${l.name}"?`}
                description="Removes this label from every issue it's on."
                confirmLabel="Delete"
                onConfirm={() => labelStore.deleteLabel(workspaceSlug, projectId, l.id)}
              />
            </div>
          ))}
          <div className="flex items-end gap-2 pt-2">
            <Input type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} className="h-9 w-10 p-1" />
            <Input placeholder="New label name" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} className="flex-1" />
            <SubmitButton type="button" loading={creatingLabel} onClick={createLabel}>
              <Plus />
            </SubmitButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
