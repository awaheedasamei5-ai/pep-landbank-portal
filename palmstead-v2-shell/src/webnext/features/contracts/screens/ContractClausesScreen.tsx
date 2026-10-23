"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileCheck2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { useCanFulfilContracts } from "../hooks/useContractRequests";
import { useContractClauses, useCreateContractClause } from "../hooks/useContractTemplates";

const UNCATEGORIZED = "Uncategorized";

// NEW structure (docs/plans/16-contract-of-sale-build-plan.md §4) -- the
// user's own explicit ask: "a section for editing the clauses with each
// clause group having a separate page", restructuring the prior single
// side-panel Clause Library into real dedicated routes, one per group.
export function ContractClausesScreen() {
  const canManage = useCanFulfilContracts();
  const { data: clauses, isLoading } = useContractClauses();
  const [createOpen, setCreateOpen] = useState(false);

  if (!canManage) {
    return <PageHeader title="Clause library" description="You don't have access to this. Ask a manager if you need it." />;
  }

  const categories = [...new Set((clauses ?? []).map((c) => c.category?.trim() || UNCATEGORIZED))].sort();
  const groups = new Map<string, { count: number; lastUpdated: string }>();
  for (const c of clauses ?? []) {
    const key = c.category?.trim() || UNCATEGORIZED;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (c.createdAt > existing.lastUpdated) existing.lastUpdated = c.createdAt;
    } else {
      groups.set(key, { count: 1, lastUpdated: c.createdAt });
    }
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div>
      <PageHeader
        title="Clause library"
        description="Reusable clauses, organized by group. Open a group to edit, retire, or add clauses."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New clause
          </Button>
        }
      />

      {!isLoading && sortedGroups.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No clauses in the library yet — add one from inside a clause group, or from a template's editor.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedGroups.map(([category, info]) => (
          <Link key={category} href={`/dashboard/contract-of-sale/clauses/${encodeURIComponent(category)}`} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileCheck2 className="size-4.5" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <CardTitle className="mt-2">{category}</CardTitle>
                <CardDescription>
                  {info.count} clause{info.count === 1 ? "" : "s"} · last edited {info.lastUpdated.slice(0, 10)}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <NewClauseDialog open={createOpen} onOpenChange={setCreateOpen} categories={categories} />
    </div>
  );
}

function NewClauseDialog({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (open: boolean) => void; categories: string[] }) {
  const router = useRouter();
  const create = useCreateContractClause();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");

  async function submit() {
    if (!name.trim() || !body.trim()) return;
    const created = await create.mutateAsync({ name: name.trim(), category: category.trim() || undefined, body: body.trim() });
    onOpenChange(false);
    setName("");
    setCategory("");
    setBody("");
    router.push(`/dashboard/contract-of-sale/clauses/${encodeURIComponent(created.category?.trim() || UNCATEGORIZED)}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New clause</DialogTitle>
          <DialogDescription>Add it to an existing group, or type a new group name to create one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Force Majeure" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Group / category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Terms" list="clause-categories" />
            <datalist id="clause-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Clause text — may include {{tokens}}" rows={5} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || !body.trim() || create.isPending} onClick={submit}>
            {create.isPending ? "Creating…" : "Create clause"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
