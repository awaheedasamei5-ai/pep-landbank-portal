"use client";

import { IssueArchiveService } from "@openplane-web/services/issue";
import { Archive, ArchiveRestore, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

const WORKSPACE_SLUG = "palmstead";
const archiveService = new IssueArchiveService();

type ArchiveRow = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  state_id: string | null;
  archived_at: string;
  project_name: string;
  project_identifier: string;
  state_name: string;
};

export function OperationsArchive() {
  const isManagement = useAuthStore((state) => state.profile?.role === "manager" && state.profile.active);
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isManagement) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const sb = requireSupabase();
        const { data: issues, error: issueError } = await sb
          .from("op_issues")
          .select("id,name,sequence_id,project_id,state_id,archived_at")
          .not("archived_at", "is", null)
          .order("archived_at", { ascending: false })
          .limit(500);
        if (issueError) throw issueError;

        const projectIds = [...new Set((issues ?? []).map((issue) => issue.project_id))];
        const stateIds = [...new Set((issues ?? []).map((issue) => issue.state_id).filter(Boolean))] as string[];
        const [projectsResult, statesResult] = await Promise.all([
          projectIds.length
            ? sb.from("op_projects").select("id,name,identifier").in("id", projectIds)
            : Promise.resolve({ data: [], error: null }),
          stateIds.length
            ? sb.from("op_states").select("id,name").in("id", stateIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (projectsResult.error) throw projectsResult.error;
        if (statesResult.error) throw statesResult.error;

        const projects = new Map((projectsResult.data ?? []).map((project) => [project.id, project]));
        const states = new Map((statesResult.data ?? []).map((state) => [state.id, state]));
        const nextRows = (issues ?? []).map((issue) => {
          const project = projects.get(issue.project_id);
          return {
            ...issue,
            archived_at: issue.archived_at as string,
            project_name: project?.name ?? "Unknown project",
            project_identifier: project?.identifier ?? "OPS",
            state_name: issue.state_id ? states.get(issue.state_id)?.name ?? "Unknown" : "Unassigned",
          } satisfies ArchiveRow;
        });
        if (!cancelled) setRows(nextRows);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load archived work items.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isManagement]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      `${row.project_identifier}-${row.sequence_id} ${row.name} ${row.project_name} ${row.state_name}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query, rows]);

  async function restore(row: ArchiveRow) {
    setRestoringId(row.id);
    setError(null);
    try {
      await archiveService.restoreIssue(WORKSPACE_SLUG, row.project_id, row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore this work item.");
      throw caught;
    } finally {
      setRestoringId(null);
    }
  }

  if (!isManagement) {
    return (
      <Card>
        <CardContent className="flex gap-3 pt-6">
          <Archive className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Management access required</h2>
            <p className="mt-1 text-sm text-muted-foreground">Only Management can review and restore deleted work items.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby="operations-archive-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="operations-archive-heading" className="text-lg font-semibold">Deleted work items</h2>
          <p className="text-sm text-muted-foreground">Recover work that Management removed from active projects.</p>
        </div>
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Search deleted work items</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, title, project or state" className="pl-9" />
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && <Skeleton className="h-36 w-full" />}
      {!loading && filteredRows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Archive className="mb-3 size-8 text-muted-foreground" />
            <h3 className="font-medium">{query ? "No matching work items" : "The archive is empty"}</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {query ? "Try a different search." : "Work items deleted by Management will remain recoverable here."}
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && filteredRows.length > 0 && (
        <>
          <div className="grid gap-3 sm:hidden">
            {filteredRows.map((row) => (
              <Card key={row.id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{row.project_identifier}-{row.sequence_id}</p>
                    <p className="break-words font-medium">{row.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{row.project_name} · {row.state_name}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <time className="text-xs text-muted-foreground" dateTime={row.archived_at}>{new Date(row.archived_at).toLocaleString()}</time>
                    <RestoreControl row={row} busy={restoringId === row.id} onRestore={restore} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Work item</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Deleted</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.project_identifier}-{row.sequence_id}</TableCell>
                      <TableCell className="max-w-80 whitespace-normal font-medium">{row.name}</TableCell>
                      <TableCell>{row.project_name}</TableCell>
                      <TableCell>{row.state_name}</TableCell>
                      <TableCell><time dateTime={row.archived_at}>{new Date(row.archived_at).toLocaleString()}</time></TableCell>
                      <TableCell className="text-right"><RestoreControl row={row} busy={restoringId === row.id} onRestore={restore} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </section>
  );
}

function RestoreControl({ row, busy, onRestore }: { row: ArchiveRow; busy: boolean; onRestore: (row: ArchiveRow) => Promise<void> }) {
  return (
    <ConfirmDialog
      title={`Restore ${row.project_identifier}-${row.sequence_id}?`}
      description="The work item will return to its project with its previous state and assignments."
      confirmLabel="Restore work item"
      destructive={false}
      onConfirm={() => onRestore(row)}
      trigger={<Button type="button" size="sm" variant="outline" disabled={busy}><ArchiveRestore />{busy ? "Restoring…" : "Restore"}</Button>}
    />
  );
}
