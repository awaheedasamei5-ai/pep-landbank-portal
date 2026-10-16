"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";
import { ensureCurrentPlaneUser } from "@openplane-web/lib/palmstead-adapters";
import { store } from "@openplane-web/lib/store-context";
import { IssueService } from "@openplane-web/services/issue";
import { E_SORT_ORDER } from "@plane/constants";
import { Archive, ArrowUp } from "lucide-react";
import { observer } from "mobx-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { OPERATION_COMMENT_TEXT_LIMIT, operationCommentTextToHtml } from "@/lib/palmstead/operations-comment-html";
import { requireSupabase } from "@/lib/supabase.client";

import { PortalBackLink } from "../../../../../_components/portal-navigation";
import { OperationCommentBody } from "./operation-comment-body";

// Phase 6's issue detail slice: real edit (state/priority/dates/assignees/
// labels/description), real comments (op_issue_comments), and the real
// audit trail (op_issue_activity, written by patchIssue's diffing) merged
// via plane's own getActivityAndCommentsByIssueId. No rich-text editor yet
// (@plane/editor deferred) -- description is plain text.
const WORKSPACE_SLUG = "palmstead";

const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;

type StaffOption = { agent_key: string; name: string };
type IssueCapabilities = {
  can_edit: boolean;
  can_manage_assignments: boolean;
  can_archive: boolean;
  can_restore: boolean;
  actor_key: string;
  actor_role: string;
};

const FIELD_LABEL: Record<string, string> = { state: "status", priority: "priority", name: "title", target_date: "due date" };

const issueService = new IssueService();

export const IssueDetailScreen = observer(function IssueDetailScreen({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [leaveConflicts, setLeaveConflicts] = useState<{ staffKey: string; staffName: string }[]>([]);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateTo, setEscalateTo] = useState("");
  const [escalateNote, setEscalateNote] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [capabilities, setCapabilities] = useState<IssueCapabilities | null>(null);

  const issueRoot = store.issue;
  const projectIssues = issueRoot.projectIssues;
  const stateStore = issueRoot.rootStore.state;
  const labelStore = issueRoot.rootStore.label;
  const cycleStore = issueRoot.rootStore.cycle;
  const moduleStore = issueRoot.rootStore.module;
  const detail = issueRoot.issueDetail;
  const project = store.projectRoot.project.getProjectById(projectId);
  const issue = issueRoot.issues.getIssueById(issueId);

  useEffect(() => {
    store.router.setQuery({ workspaceSlug: WORKSPACE_SLUG, projectId, issueId });
    let cancelled = false;
    (async () => {
      try {
        const sb = requireSupabase();
        await ensureCurrentPlaneUser(sb, store.user);
        await Promise.all([
          stateStore.fetchProjectStates(WORKSPACE_SLUG, projectId),
          labelStore.fetchProjectLabels(WORKSPACE_SLUG, projectId),
          cycleStore.fetchAllCycles(WORKSPACE_SLUG, projectId),
          moduleStore.fetchModules(WORKSPACE_SLUG, projectId),
          detail.issue.fetchIssue(WORKSPACE_SLUG, projectId, issueId),
          project ? Promise.resolve() : store.projectRoot.project.fetchProjectDetails(WORKSPACE_SLUG, projectId),
        ]);
        const [{ data: people, error: peopleError }, { data: access, error: accessError }] = await Promise.all([
          sb.from("profiles").select("agent_key,name").eq("active", true).order("name"),
          sb.rpc("get_operation_issue_capabilities", { p_issue_id: issueId }),
        ]);
        if (peopleError) throw peopleError;
        if (accessError) throw accessError;
        if (!cancelled) {
          setStaff((people ?? []) as StaffOption[]);
          setCapabilities(access as IssueCapabilities);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load issue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, issueId]);

  useEffect(() => {
    if (issue) setDescriptionDraft(issue.description_html ?? "");
  }, [issue?.id]);

  // Phase 7 "twist to fit": real collision detection, grounded in V1's own
  // leave-conflict check (index.html's apiCheckScheduleConflictsMulti) --
  // re-runs whenever the assignee list or date range changes, surfaced as
  // a non-blocking warning (unlike V1's hard block on a literal time slot,
  // two active tasks overlapping is normal here; being on leave isn't).
  useEffect(() => {
    if (!issue) return;
    let cancelled = false;
    issueService
      .checkAssigneeLeaveConflicts(issue.assignee_ids, issue.start_date, issue.target_date)
      .then((hits) => {
        if (!cancelled) setLeaveConflicts(hits);
      })
      .catch(() => {
        // Leave conflicts are advisory; an unavailable leave query must not
        // prevent the work-item detail page from loading.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.assignee_ids.join(","), issue?.start_date, issue?.target_date]);

  async function patch(data: Parameters<typeof projectIssues.updateIssue>[3]) {
    if (!capabilities?.can_edit || !issue) return;
    setError(null);
    try {
      await projectIssues.updateIssue(WORKSPACE_SLUG, projectId, issueId, { ...data, updated_at: issue.updated_at });
      // patchIssue writes real op_issue_activity rows for whatever changed,
      // but this store's activity feed only loads on fetchIssue -- refetch
      // so the audit trail shown here isn't stale after an edit.
      await detail.activity.fetchActivities(WORKSPACE_SLUG, projectId, issueId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update issue.");
    }
  }

  async function escalate() {
    if (!escalateTo || !capabilities?.can_edit) return;
    setEscalating(true);
    try {
      await issueService.escalateIssue(issueId, escalateTo, escalateNote.trim());
      await Promise.all([
        detail.issue.fetchIssue(WORKSPACE_SLUG, projectId, issueId),
        detail.activity.fetchActivities(WORKSPACE_SLUG, projectId, issueId),
      ]);
      setShowEscalate(false);
      setEscalateTo("");
      setEscalateNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to escalate.");
    } finally {
      setEscalating(false);
    }
  }

  async function archiveIssue() {
    setArchiving(true);
    setError(null);
    try {
      await projectIssues.archiveIssue(WORKSPACE_SLUG, projectId, issueId);
      router.push(`/dashboard/operations/${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove work item.");
      throw err;
    } finally {
      setArchiving(false);
    }
  }

  async function postComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      await detail.comment.createComment(WORKSPACE_SLUG, projectId, issueId, { comment_html: operationCommentTextToHtml(newComment) });
      setNewComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setPostingComment(false);
    }
  }

  if (loading)
    return (
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid gap-4 xl:col-span-8">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="grid gap-3 xl:col-span-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    );
  if (!issue) return <div className="flex flex-col gap-3"><PortalBackLink fallback={`/dashboard/operations/${projectId}`} /><p role="status">{error ?? "Work item not found."}</p></div>;

  const states = stateStore.getProjectStates(projectId) ?? [];
  const labels = labelStore.getProjectLabels(projectId) ?? [];
  const feed = detail.activity.getActivityAndCommentsByIssueId(issueId, E_SORT_ORDER.ASC) ?? [];

  return (
    <div>
      <PortalBackLink fallback={`/dashboard/operations/${projectId}`} className="mb-2" />

      {error && <p className="mb-4 text-destructive text-sm">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="grid gap-4 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-muted-foreground text-sm">
              {project?.identifier}-{issue.sequence_id}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!capabilities?.can_edit}
                onClick={() => setShowEscalate((v) => !v)}
              >
                <ArrowUp data-icon="inline-start" />
                Escalate
              </Button>
              {capabilities?.can_archive && (
                <ConfirmDialog
                  title="Remove this work item?"
                  description="This moves the work item to the archive, where it can be restored later. Active sub-items must be moved or archived first."
                  confirmLabel="Move to archive"
                  onConfirm={archiveIssue}
                  trigger={
                    <Button type="button" variant="destructive" size="sm" disabled={archiving}>
                      <Archive data-icon="inline-start" />
                      Delete
                    </Button>
                  }
                />
              )}
            </div>
          </div>
          {capabilities && !capabilities.can_edit && (
            <p className="text-sm text-muted-foreground">
              This work item is read-only for you. An assignee, project member, creator, or Management can edit it.
            </p>
          )}
          {showEscalate && (
            <Card>
              <CardContent className="grid gap-3 pt-6">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Escalate to</p>
                  <Select value={escalateTo} onValueChange={setEscalateTo}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a colleague…" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff
                        .filter((s) => !issue.assignee_ids.includes(s.agent_key))
                        .map((s) => (
                          <SelectItem key={s.agent_key} value={s.agent_key}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Why this needs their attention…"
                  value={escalateNote}
                  onChange={(e) => setEscalateNote(e.target.value)}
                  rows={2}
                />
                <SubmitButton type="button" loading={escalating} onClick={escalate} disabled={!escalateTo}>
                  Escalate
                </SubmitButton>
                <p className="text-xs text-muted-foreground">Adds them as an assignee and sends a chat message with your reason.</p>
              </CardContent>
            </Card>
          )}
          <Input
            defaultValue={issue.name}
            disabled={!capabilities?.can_edit}
            className="h-auto border-none px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
            onBlur={(e) => e.target.value.trim() && e.target.value !== issue.name && patch({ name: e.target.value.trim() })}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={descriptionDraft}
                disabled={!capabilities?.can_edit}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={() => descriptionDraft !== (issue.description_html ?? "") && patch({ description_html: descriptionDraft })}
                rows={6}
                placeholder="Describe the task…"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Activity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {feed.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
              {feed.map((item) => {
                if (item.activity_type === "COMMENT") {
                  const comment = detail.comment.getCommentById(item.id);
                  if (!comment) return null;
                  return (
                    <div key={item.id} className="border-l-2 pl-3 text-sm">
                      <span className="font-medium">{comment.actor_detail.display_name}</span>{" "}
                      <OperationCommentBody html={comment.comment_html} />
                      <div className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</div>
                    </div>
                  );
                }
                const activity = detail.activity.getActivityById(item.id);
                if (!activity) return null;
                const resolve = (value: string | undefined) => {
                  if (!value) return "none";
                  if (activity.field === "state") return stateStore.stateMap?.[value]?.name ?? value;
                  return value;
                };
                return (
                  <div key={item.id} className="border-l-2 pl-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{activity.actor_detail.display_name}</span>{" "}
                    {activity.verb === "created" ? (
                      "created this issue"
                    ) : activity.verb === "escalated" ? (
                      <>
                        escalated to <span className="font-medium text-foreground">{activity.new_value}</span>
                        {activity.comment ? `: "${activity.comment}"` : ""}
                      </>
                    ) : (
                      <>
                        changed {FIELD_LABEL[activity.field ?? ""] ?? activity.field} from{" "}
                        <span className="font-medium text-foreground">{resolve(activity.old_value)}</span> to{" "}
                        <span className="font-medium text-foreground">{resolve(activity.new_value)}</span>
                      </>
                    )}
                    <div className="text-xs">{new Date(activity.created_at).toLocaleString()}</div>
                  </div>
                );
              })}
              <FieldGroup className="pt-2">
                <Field data-disabled={postingComment}>
                  <FieldLabel htmlFor="operation-comment">Comment</FieldLabel>
                  <Textarea
                    id="operation-comment"
                    placeholder="Add a comment…"
                    value={newComment}
                    maxLength={OPERATION_COMMENT_TEXT_LIMIT}
                    aria-describedby="operation-comment-count"
                    disabled={postingComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                  />
                  <FieldDescription id="operation-comment-count">
                    {newComment.length.toLocaleString()} / {OPERATION_COMMENT_TEXT_LIMIT.toLocaleString()} characters
                  </FieldDescription>
                  <div className="flex justify-end">
                    <SubmitButton type="button" loading={postingComment} disabled={!newComment.trim()} onClick={postComment} className="w-full sm:w-auto">
                      Post comment
                    </SubmitButton>
                  </div>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:col-span-5">
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Status</p>
                <Select disabled={!capabilities?.can_edit} value={issue.state_id ?? undefined} onValueChange={(v) => patch({ state_id: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Priority</p>
                <Select disabled={!capabilities?.can_edit} value={issue.priority ?? "none"} onValueChange={(v) => patch({ priority: v as (typeof PRIORITIES)[number] })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Cycle</p>
                <Select
                  disabled={!capabilities?.can_edit}
                  value={issue.cycle_id ?? "none"}
                  onValueChange={(v) => patch({ cycle_id: v === "none" ? null : v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No cycle</SelectItem>
                    {(cycleStore.getProjectCycleIds(projectId) ?? []).map((id) => {
                      const cycle = cycleStore.getCycleById(id);
                      if (!cycle) return null;
                      return (
                        <SelectItem key={id} value={id}>
                          {cycle.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Start date</p>
                  <Input
                    type="date"
                    disabled={!capabilities?.can_edit}
                    defaultValue={issue.start_date ?? ""}
                    onBlur={(e) => patch({ start_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Due date</p>
                  <Input
                    type="date"
                    disabled={!capabilities?.can_edit}
                    defaultValue={issue.target_date ?? ""}
                    onBlur={(e) => patch({ target_date: e.target.value || null })}
                  />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Assignees</p>
                <div className="grid max-h-40 gap-1.5 overflow-y-auto">
                  {staff.map((s) => {
                    const checked = issue.assignee_ids.includes(s.agent_key);
                    return (
                      <label key={s.agent_key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={!capabilities?.can_manage_assignments}
                          onCheckedChange={(v) => {
                            const next = v ? [...issue.assignee_ids, s.agent_key] : issue.assignee_ids.filter((k) => k !== s.agent_key);
                            patch({ assignee_ids: next });
                          }}
                        />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
                {leaveConflicts.length > 0 && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {leaveConflicts.map((c) => staff.find((person) => person.agent_key === c.staffKey)?.name ?? c.staffName).join(", ")} {leaveConflicts.length === 1 ? "is" : "are"} on leave during this issue's
                    dates.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Labels</p>
                <div className="flex flex-wrap gap-1.5">
                  {labels.length === 0 && <p className="text-xs text-muted-foreground">No labels on this project yet.</p>}
                  {labels.map((l) => {
                    const checked = issue.label_ids.includes(l.id);
                    return (
                      <Badge
                        key={l.id}
                        variant={checked ? "default" : "outline"}
                        className={capabilities?.can_edit ? "cursor-pointer" : "cursor-default opacity-60"}
                        aria-disabled={!capabilities?.can_edit}
                        style={checked ? { backgroundColor: l.color, borderColor: l.color } : { borderColor: l.color, color: l.color }}
                        onClick={() => {
                          if (!capabilities?.can_edit) return;
                          const next = checked ? issue.label_ids.filter((id) => id !== l.id) : [...issue.label_ids, l.id];
                          patch({ label_ids: next });
                        }}
                      >
                        {l.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Modules</p>
                <div className="flex flex-wrap gap-1.5">
                  {(moduleStore.getProjectModuleIds(projectId) ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No modules on this project yet.</p>
                  )}
                  {(moduleStore.getProjectModuleIds(projectId) ?? []).map((id) => {
                    const mod = moduleStore.getModuleById(id);
                    if (!mod) return null;
                    const checked = issue.module_ids?.includes(id) ?? false;
                    return (
                      <Badge
                        key={id}
                        variant={checked ? "default" : "outline"}
                        className={capabilities?.can_edit ? "cursor-pointer" : "cursor-default opacity-60"}
                        aria-disabled={!capabilities?.can_edit}
                        onClick={() => {
                          if (!capabilities?.can_edit) return;
                          const current = issue.module_ids ?? [];
                          const next = checked ? current.filter((mid) => mid !== id) : [...current, id];
                          patch({ module_ids: next });
                        }}
                      >
                        {mod.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
});

