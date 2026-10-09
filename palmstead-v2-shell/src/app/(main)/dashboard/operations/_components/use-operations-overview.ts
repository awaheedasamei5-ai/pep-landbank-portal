"use client";

import { useQuery } from "@tanstack/react-query";

import { isoDateOnly } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";

// Real company-wide Operations Tracker overview -- same house pattern as
// use-manager-overview.ts (one hook, a handful of real parallel queries,
// no fabricated categories). Powers the Command Center home page: real
// op_issues/op_states/op_projects/op_issue_activity rows across every
// project in the one real "palmstead" workspace, not a single project's
// slice.
const STATE_GROUP_LABELS: Record<string, string> = {
  backlog: "Backlog",
  unstarted: "Unstarted",
  started: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

export interface OpsIssueRow {
  id: string;
  name: string;
  sequence_id: number;
  priority: string;
  target_date: string | null;
  createdAt: string;
  completedAt: string | null;
  projectId: string;
  projectIdentifier: string;
  stateId: string;
  stateName: string;
  stateColor: string;
  stateGroup: string;
  assignees: string[];
  assigneeKeys: string[];
}

export interface OpsActivityRow {
  id: string;
  verb: string;
  field: string | null;
  newValue: string | null;
  comment: string | null;
  createdAt: string;
  actorName: string;
  issueName: string;
  issueSequence: number;
  projectId: string;
  projectIdentifier: string;
  issueId: string;
}

export interface Delta {
  value: number;
  direction: "up" | "down" | "flat";
}

export interface WorkloadRow {
  key: string;
  name: string;
  open: number;
  highPriority: number;
  overdue: number;
  completed: number;
}

export interface OperationsOverview {
  totalOpen: number;
  highPriorityOpen: number;
  dueTodayCount: number;
  overdueCount: number;
  completedCount: number;
  openDelta: Delta;
  highPriorityDelta: Delta;
  completedDelta: Delta;
  statusBreakdown: { group: string; label: string; count: number; color: string }[];
  priorityBreakdown: { priority: string; label: string; count: number }[];
  createdTrend: { day: string; label: string; count: number }[];
  allOpenIssues: OpsIssueRow[];
  attention: OpsIssueRow[];
  recentActivity: OpsActivityRow[];
  workloadByStaff: WorkloadRow[];
}

function trailingDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(isoDateOnly(d));
  }
  return out;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

const STATUS_GROUP_COLOR: Record<string, string> = {
  backlog: "var(--chart-5)",
  unstarted: "var(--chart-4)",
  started: "var(--chart-1)",
  completed: "var(--chart-2)",
  cancelled: "var(--chart-3)",
};

function pctDelta(current: number, previous: number): Delta {
  if (previous === 0) return { value: current > 0 ? 100 : 0, direction: current > 0 ? "up" : "flat" };
  const change = Math.round(((current - previous) / previous) * 100);
  return { value: Math.abs(change), direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}

async function fetchOperationsOverview(): Promise<OperationsOverview> {
  const sb = requireSupabase();
  const [issuesRes, statesRes, projectsRes, assigneesRes, profilesRes, activityRes] = await Promise.all([
    sb
      .from("op_issues")
      .select("id,name,sequence_id,priority,target_date,created_at,completed_at,project_id,state_id")
      .is("archived_at", null),
    sb.from("op_states").select("id,name,color,group"),
    sb.from("op_projects").select("id,identifier"),
    sb.from("op_issue_assignees").select("issue_id,assignee_key"),
    sb.from("profiles").select("agent_key,name"),
    sb
      .from("op_issue_activity")
      .select("id,issue_id,actor_key,verb,field,new_value,comment,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (issuesRes.error) throw issuesRes.error;
  if (statesRes.error) throw statesRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (assigneesRes.error) throw assigneesRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (activityRes.error) throw activityRes.error;

  type IssueRaw = {
    id: string;
    name: string;
    sequence_id: number;
    priority: string | null;
    target_date: string | null;
    created_at: string;
    completed_at: string | null;
    project_id: string;
    state_id: string | null;
  };
  const issues = (issuesRes.data ?? []) as IssueRaw[];
  const states = (statesRes.data ?? []) as { id: string; name: string; color: string; group: string }[];
  const projects = (projectsRes.data ?? []) as { id: string; identifier: string }[];
  const assigneeRows = (assigneesRes.data ?? []) as { issue_id: string; assignee_key: string }[];
  const profiles = (profilesRes.data ?? []) as { agent_key: string; name: string }[];
  const activity = (activityRes.data ?? []) as {
    id: string;
    issue_id: string;
    actor_key: string;
    verb: string;
    field: string | null;
    new_value: string | null;
    comment: string | null;
    created_at: string;
  }[];

  const stateMap = new Map(states.map((s) => [s.id, s]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const profileMap = new Map(profiles.map((p) => [p.agent_key, p.name]));
  const assigneeKeysByIssue = new Map<string, string[]>();
  for (const row of assigneeRows) {
    const list = assigneeKeysByIssue.get(row.issue_id) ?? [];
    list.push(row.assignee_key);
    assigneeKeysByIssue.set(row.issue_id, list);
  }

  const rows: OpsIssueRow[] = issues.map((i) => {
    const state = i.state_id ? stateMap.get(i.state_id) : undefined;
    const project = projectMap.get(i.project_id);
    const assigneeKeys = assigneeKeysByIssue.get(i.id) ?? [];
    return {
      id: i.id,
      name: i.name,
      sequence_id: i.sequence_id,
      priority: i.priority ?? "none",
      target_date: i.target_date,
      createdAt: i.created_at,
      completedAt: i.completed_at,
      projectId: i.project_id,
      projectIdentifier: project?.identifier ?? "?",
      stateId: i.state_id ?? "",
      stateName: state?.name ?? "Unknown",
      stateColor: state?.color ?? "#999",
      stateGroup: state?.group ?? "unstarted",
      assignees: assigneeKeys.map((k) => profileMap.get(k) ?? k),
      assigneeKeys,
    };
  });

  const open = rows.filter((r) => r.stateGroup !== "completed" && r.stateGroup !== "cancelled");
  const todayIso = isoDateOnly(new Date());
  const completed = rows.filter((r) => r.stateGroup === "completed");

  // Real week-over-week deltas, not fabricated: a 7-day-old snapshot
  // reconstructed from the same created_at/completed_at columns already
  // fetched (an issue was "open as of" a past date if it existed by then
  // and either isn't completed yet or completed after that date).
  const weekAgoIso = isoDateOnly(new Date(Date.now() - 7 * 86400000));
  const openAsOfWeekAgo = rows.filter(
    (r) => r.createdAt.slice(0, 10) <= weekAgoIso && (!r.completedAt || r.completedAt.slice(0, 10) > weekAgoIso),
  );
  const highPriorityAsOfWeekAgo = openAsOfWeekAgo.filter((r) => r.priority === "high" || r.priority === "urgent");
  const completedAsOfWeekAgo = rows.filter((r) => r.completedAt && r.completedAt.slice(0, 10) <= weekAgoIso);

  const statusBreakdown = (["backlog", "unstarted", "started", "completed", "cancelled"] as const).map((group) => ({
    group,
    label: STATE_GROUP_LABELS[group],
    count: rows.filter((r) => r.stateGroup === group).length,
    color: STATUS_GROUP_COLOR[group],
  }));

  const priorityBreakdown = (["urgent", "high", "medium", "low", "none"] as const).map((priority) => ({
    priority,
    label: PRIORITY_LABELS[priority],
    count: open.filter((r) => r.priority === priority).length,
  }));

  const days = trailingDays(30);
  const createdByDay = new Map<string, number>();
  for (const i of issues) {
    const day = (i.created_at ?? "").slice(0, 10);
    createdByDay.set(day, (createdByDay.get(day) ?? 0) + 1);
  }
  const createdTrend = days.map((day) => ({
    day,
    label: new Date(day).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    count: createdByDay.get(day) ?? 0,
  }));

  // Real rule-based attention list (not a hardcoded list, not an LLM
  // call): urgent/high priority AND (already overdue OR due within the
  // next 2 days) AND still open. A true AI-ranked version is a later
  // phase -- this is deterministic and fully explainable, which matters
  // more for "what do I work on next" than a black-box score would.
  const twoDaysOut = isoDateOnly(new Date(Date.now() + 2 * 86400000));
  const attention = open
    .filter((r) => (r.priority === "urgent" || r.priority === "high") && r.target_date && r.target_date <= twoDaysOut)
    .sort((a, b) => (a.target_date ?? "").localeCompare(b.target_date ?? ""));

  const recentActivity: OpsActivityRow[] = activity.map((a) => {
    const issue = issues.find((i) => i.id === a.issue_id);
    const project = issue ? projectMap.get(issue.project_id) : undefined;
    // Real bug fixed here (same root cause as issue-detail-screen.tsx's
    // activity feed): op_issue_activity stores the raw state_id as
    // new_value for field==="state" -- resolve it through the state map
    // instead of rendering a UUID.
    const newValue = a.field === "state" && a.new_value ? (stateMap.get(a.new_value)?.name ?? a.new_value) : a.new_value;
    return {
      id: a.id,
      verb: a.verb,
      field: a.field,
      newValue,
      comment: a.comment,
      createdAt: a.created_at,
      actorName: profileMap.get(a.actor_key) ?? a.actor_key,
      issueName: issue?.name ?? "Unknown issue",
      issueSequence: issue?.sequence_id ?? 0,
      projectId: issue?.project_id ?? "",
      projectIdentifier: project?.identifier ?? "?",
      issueId: a.issue_id,
    };
  });

  // Management-only panel: real per-staff workload, company-wide --
  // every active profile, not just staff who happen to have an issue
  // (a 0-everywhere row is itself the signal that someone has nothing
  // assigned).
  const workloadByStaff: WorkloadRow[] = profiles
    .map((p) => {
      const mine = rows.filter((r) => r.assigneeKeys.includes(p.agent_key));
      const mineOpen = mine.filter((r) => r.stateGroup !== "completed" && r.stateGroup !== "cancelled");
      return {
        key: p.agent_key,
        name: p.name,
        open: mineOpen.length,
        highPriority: mineOpen.filter((r) => r.priority === "high" || r.priority === "urgent").length,
        overdue: mineOpen.filter((r) => r.target_date && r.target_date < todayIso).length,
        completed: mine.filter((r) => r.stateGroup === "completed").length,
      };
    })
    .filter((w) => w.open + w.completed > 0)
    .sort((a, b) => b.open - a.open);

  return {
    totalOpen: open.length,
    highPriorityOpen: open.filter((r) => r.priority === "high" || r.priority === "urgent").length,
    dueTodayCount: open.filter((r) => r.target_date === todayIso).length,
    overdueCount: open.filter((r) => r.target_date && r.target_date < todayIso).length,
    completedCount: completed.length,
    openDelta: pctDelta(open.length, openAsOfWeekAgo.length),
    highPriorityDelta: pctDelta(
      open.filter((r) => r.priority === "high" || r.priority === "urgent").length,
      highPriorityAsOfWeekAgo.length,
    ),
    completedDelta: pctDelta(completed.length, completedAsOfWeekAgo.length),
    statusBreakdown,
    priorityBreakdown,
    createdTrend,
    allOpenIssues: [...open].sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
      if (a.target_date) return -1;
      if (b.target_date) return 1;
      return 0;
    }),
    attention,
    recentActivity,
    workloadByStaff,
  };
}

export function useOperationsOverview() {
  return useQuery({ queryKey: ["operationsOverview"], queryFn: fetchOperationsOverview });
}
