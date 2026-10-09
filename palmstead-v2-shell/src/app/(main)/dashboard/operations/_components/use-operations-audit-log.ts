"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real company-wide audit log -- the reference dashboard's "Audit Log"
// nav item, grounded in real op_issue_activity rows (patchIssue's own
// diffing already writes a real row per change -- see issue.service.ts).
// Separate from use-operations-overview.ts's 8-row "Recent activity"
// preview: this is the real paginated, filterable full log.
const PAGE_SIZE = 25;

export interface AuditLogRow {
  id: string;
  verb: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  comment: string | null;
  createdAt: string;
  actorKey: string;
  actorName: string;
  issueId: string;
  issueName: string;
  issueSequence: number;
  projectId: string;
  projectIdentifier: string;
  projectName: string;
}

export interface AuditLogFilters {
  projectId: string | "all";
  actorKey: string | "all";
  search: string;
  page: number;
}

export interface AuditLogResult {
  rows: AuditLogRow[];
  total: number;
  pageSize: number;
  projects: { id: string; name: string; identifier: string }[];
  actors: { key: string; name: string }[];
}

async function fetchAuditLog(filters: AuditLogFilters): Promise<AuditLogResult> {
  const sb = requireSupabase();
  const [projectsRes, profilesRes, issuesRes] = await Promise.all([
    sb.from("op_projects").select("id,name,identifier"),
    sb.from("profiles").select("agent_key,name"),
    sb.from("op_issues").select("id,name,sequence_id,project_id,state_id"),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (issuesRes.error) throw issuesRes.error;

  const projects = (projectsRes.data ?? []) as { id: string; name: string; identifier: string }[];
  const profiles = (profilesRes.data ?? []) as { agent_key: string; name: string }[];
  const issues = (issuesRes.data ?? []) as { id: string; name: string; sequence_id: number; project_id: string; state_id: string | null }[];

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const profileMap = new Map(profiles.map((p) => [p.agent_key, p.name]));
  const issueMap = new Map(issues.map((i) => [i.id, i]));

  // Real server-side filtering where it's cheap (actor), real
  // project/search filtering client-side since it needs the issue join
  // op_issue_activity itself doesn't carry -- the real table is small
  // enough (company-wide activity on one workspace) that this stays
  // correct and fast without a bespoke SQL view.
  let query = sb
    .from("op_issue_activity")
    .select("id,issue_id,actor_key,verb,field,old_value,new_value,comment,created_at")
    .order("created_at", { ascending: false });
  if (filters.actorKey !== "all") query = query.eq("actor_key", filters.actorKey);

  const { data, error } = await query;
  if (error) throw error;

  type Raw = {
    id: string;
    issue_id: string;
    actor_key: string;
    verb: string;
    field: string | null;
    old_value: string | null;
    new_value: string | null;
    comment: string | null;
    created_at: string;
  };

  // State-id-valued fields (field==="state") resolve through op_states so
  // the log never shows a raw UUID -- same real bug class already fixed
  // in issue-detail-screen.tsx and the Command Center's activity feed.
  const stateIds = new Set<string>();
  for (const r of (data ?? []) as Raw[]) {
    if (r.field === "state" && r.new_value) stateIds.add(r.new_value);
    if (r.field === "state" && r.old_value) stateIds.add(r.old_value);
  }
  const statesRes = stateIds.size > 0 ? await sb.from("op_states").select("id,name").in("id", [...stateIds]) : { data: [], error: null };
  if (statesRes.error) throw statesRes.error;
  const stateNameMap = new Map(((statesRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  let rows: AuditLogRow[] = ((data ?? []) as Raw[]).map((r) => {
    const issue = issueMap.get(r.issue_id);
    const project = issue ? projectMap.get(issue.project_id) : undefined;
    const resolve = (v: string | null) => (r.field === "state" && v ? (stateNameMap.get(v) ?? v) : v);
    return {
      id: r.id,
      verb: r.verb,
      field: r.field,
      oldValue: resolve(r.old_value),
      newValue: resolve(r.new_value),
      comment: r.comment,
      createdAt: r.created_at,
      actorKey: r.actor_key,
      actorName: profileMap.get(r.actor_key) ?? r.actor_key,
      issueId: r.issue_id,
      issueName: issue?.name ?? "Unknown issue",
      issueSequence: issue?.sequence_id ?? 0,
      projectId: issue?.project_id ?? "",
      projectIdentifier: project?.identifier ?? "?",
      projectName: project?.name ?? "Unknown project",
    };
  });

  if (filters.projectId !== "all") rows = rows.filter((r) => r.projectId === filters.projectId);
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter((r) =>
      `${r.actorName} ${r.issueName} ${r.projectIdentifier} ${r.field ?? ""} ${r.newValue ?? ""} ${r.comment ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }

  const total = rows.length;
  const start = filters.page * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return {
    rows: pageRows,
    total,
    pageSize: PAGE_SIZE,
    projects: projects.map((p) => ({ id: p.id, name: p.name, identifier: p.identifier })),
    actors: profiles.map((p) => ({ key: p.agent_key, name: p.name })),
  };
}

export function useOperationsAuditLog(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ["operationsAuditLog", filters.projectId, filters.actorKey, filters.search, filters.page],
    queryFn: () => fetchAuditLog(filters),
  });
}
