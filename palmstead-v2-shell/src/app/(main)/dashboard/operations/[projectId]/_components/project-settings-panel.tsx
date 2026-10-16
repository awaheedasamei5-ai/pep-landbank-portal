"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { useAuthStore } from "@/stores/auth/auth-store";

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
  const [savingProject, setSavingProject] = useState(false);
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  const stateStore = store.state;
  const labelStore = store.label;
  const projectStore = store.projectRoot.project;
  const project = projectStore.getProjectById(projectId);
  const [projectName, setProjectName] = useState(project?.name ?? "");
  const [projectIdentifier, setProjectIdentifier] = useState(project?.identifier ?? "");
  const [projectDescription, setProjectDescription] = useState(project?.description ?? "");
  const canManageProject = profile?.role === "manager" || profile?.key === project?.created_by || profile?.key === project?.project_lead;
  const canArchiveProject = profile?.role === "manager";
  const states = (stateStore.getProjectStates(projectId) ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const labels = labelStore.getProjectLabels(projectId) ?? [];

  useEffect(() => {
    if (!project) return;
    setProjectName(project.name);
    setProjectIdentifier(project.identifier);
    setProjectDescription(project.description ?? "");
  }, [project?.description, project?.identifier, project?.name]);

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

  async function saveProject() {
    if (!projectName.trim() || !projectIdentifier.trim()) return;
    setSavingProject(true);
    setError(null);
    try {
      await projectStore.updateProject(workspaceSlug, projectId, {
        name: projectName.trim(),
        identifier: projectIdentifier.trim().toUpperCase(),
        description: projectDescription.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project.");
    } finally {
      setSavingProject(false);
    }
  }

  async function archiveProject() {
    setError(null);
    try {
      await projectStore.deleteProject(workspaceSlug, projectId);
      router.push("/dashboard/operations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
      throw err;
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {error && <p className="text-sm text-destructive xl:col-span-2">{error}</p>}

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Project details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)]">
            <label className="grid gap-1.5 text-sm"><span className="font-medium">Name</span><Input value={projectName} onChange={(e) => setProjectName(e.target.value)} disabled={!canManageProject} /></label>
            <label className="grid gap-1.5 text-sm"><span className="font-medium">Identifier</span><Input value={projectIdentifier} onChange={(e) => setProjectIdentifier(e.target.value.toUpperCase())} disabled={!canManageProject} maxLength={12} /></label>
          </div>
          <label className="grid gap-1.5 text-sm"><span className="font-medium">Description</span><Input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} disabled={!canManageProject} /></label>
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Deleting a project moves it to a recoverable archive with its work intact.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {canArchiveProject && <ConfirmDialog trigger={<Button type="button" variant="destructive">Delete project</Button>} title={`Delete ${project?.name ?? "this project"}?`} description="This removes the project from active Operations views. Management can restore it later with all work items intact." confirmLabel="Move to archive" onConfirm={archiveProject} />}
              {canManageProject && <SubmitButton type="button" loading={savingProject} onClick={saveProject}>Save project</SubmitButton>}
            </div>
          </div>
        </CardContent>
      </Card>

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
