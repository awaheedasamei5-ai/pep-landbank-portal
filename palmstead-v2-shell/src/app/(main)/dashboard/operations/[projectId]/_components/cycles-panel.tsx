"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { store } from "@openplane-web/lib/store-context";

// Phase 6 cycles slice: real op_cycles rows, real per-cycle issue counts by
// state group (cycle.service.ts's getCyclesWithParams), status derived from
// start/end date vs today (draft/upcoming/current/completed), matching
// plane's own real semantics. No archive/favorite/transfer-issues yet.
const STATUS_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  current: "default",
  upcoming: "outline",
  completed: "outline",
  draft: "outline",
};

export const CyclesPanel = observer(function CyclesPanel({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);

  const cycleStore = store.cycle;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await cycleStore.fetchAllCycles(workspaceSlug, projectId);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load cycles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const cycleIds = cycleStore.getProjectCycleIds(projectId) ?? [];

  async function createCycle() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await cycleStore.createCycle(workspaceSlug, projectId, {
        name: name.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
      });
      setName("");
      setStartDate("");
      setEndDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create cycle.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 pt-6">
          <div className="flex-1 min-w-48">
            <Input placeholder="Cycle name (e.g. Sprint 1)" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          <SubmitButton type="button" loading={creating} onClick={createCycle}>
            <Plus />
            New cycle
          </SubmitButton>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading real cycles from Supabase…</p>}

      {!loading && cycleIds.length === 0 && <p className="text-sm text-muted-foreground">No cycles yet.</p>}

      <div className="grid gap-3 xl:grid-cols-2">
        {cycleIds.map((id) => {
          const cycle = cycleStore.getCycleById(id);
          if (!cycle) return null;
          const total = cycle.total_issues ?? 0;
          const completed = cycle.completed_issues ?? 0;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          return (
            <Card key={id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{cycle.name}</span>
                  <Badge variant={STATUS_VARIANT[cycle.status ?? "draft"]} className="capitalize">
                    {cycle.status ?? "draft"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <p className="text-xs text-muted-foreground">
                  {cycle.start_date ?? "No start"} &rarr; {cycle.end_date ?? "No end"}
                </p>
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
