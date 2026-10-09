"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { observer } from "mobx-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { store } from "@openplane-web/lib/store-context";
import { requireSupabase } from "@/lib/supabase.client";
import { ensureCurrentPlaneUser } from "@openplane-web/lib/palmstead-adapters";
import { E_SORT_ORDER } from "@plane/constants";

// Phase 6's issue detail slice: real edit (state/priority/dates/assignees/
// labels/description), real comments (op_issue_comments), and the real
// audit trail (op_issue_activity, written by patchIssue's diffing) merged
// via plane's own getActivityAndCommentsByIssueId. No rich-text editor yet
// (@plane/editor deferred) -- description is plain text.
const WORKSPACE_SLUG = "palmstead";

const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;

type StaffOption = { agent_key: string; name: string };

const FIELD_LABEL: Record<string, string> = { state: "status", priority: "priority", name: "title", target_date: "due date" };

export const IssueDetailScreen = observer(function IssueDetailScreen({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

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
        const { data } = await sb.from("profiles").select("agent_key,name").eq("active", true).order("name");
        if (!cancelled) setStaff((data ?? []) as StaffOption[]);
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

  async function patch(data: Parameters<typeof projectIssues.updateIssue>[3]) {
    try {
      await projectIssues.updateIssue(WORKSPACE_SLUG, projectId, issueId, data);
      // patchIssue writes real op_issue_activity rows for whatever changed,
      // but this store's activity feed only loads on fetchIssue -- refetch
      // so the audit trail shown here isn't stale after an edit.
      await detail.activity.fetchActivities(WORKSPACE_SLUG, projectId, issueId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update issue.");
    }
  }

  async function postComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      await detail.comment.createComment(WORKSPACE_SLUG, projectId, issueId, { comment_html: `<p>${newComment.trim()}</p>` });
      setNewComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setPostingComment(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading real issue from Supabase…</p>;
  if (error && !issue) return <p className="text-sm text-destructive">{error}</p>;
  if (!issue) return <p className="text-sm text-muted-foreground">Issue not found.</p>;

  const states = stateStore.getProjectStates(projectId) ?? [];
  const labels = labelStore.getProjectLabels(projectId) ?? [];
  const feed = detail.activity.getActivityAndCommentsByIssueId(issueId, E_SORT_ORDER.ASC) ?? [];

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href={`/dashboard/operations/${projectId}`}>
          <ArrowLeft />
          {project?.name ?? "Project"}
        </Link>
      </Button>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="grid gap-4 xl:col-span-7">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {project?.identifier}-{issue.sequence_id}
            </span>
          </div>
          <Input
            defaultValue={issue.name}
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
                      <span dangerouslySetInnerHTML={{ __html: comment.comment_html }} />
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
              <div className="flex gap-2 pt-2">
                <Textarea
                  placeholder="Add a comment…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  className="flex-1"
                />
                <SubmitButton type="button" loading={postingComment} onClick={postComment}>
                  Comment
                </SubmitButton>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:col-span-5">
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Status</p>
                <Select value={issue.state_id ?? undefined} onValueChange={(v) => patch({ state_id: v })}>
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
                <Select value={issue.priority ?? "none"} onValueChange={(v) => patch({ priority: v as (typeof PRIORITIES)[number] })}>
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
                    defaultValue={issue.start_date ?? ""}
                    onBlur={(e) => patch({ start_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Due date</p>
                  <Input
                    type="date"
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
                        className="cursor-pointer"
                        style={checked ? { backgroundColor: l.color, borderColor: l.color } : { borderColor: l.color, color: l.color }}
                        onClick={() => {
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
                        className="cursor-pointer"
                        onClick={() => {
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
