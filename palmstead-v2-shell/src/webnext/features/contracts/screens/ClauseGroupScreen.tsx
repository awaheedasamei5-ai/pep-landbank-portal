"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Archive, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { useCanFulfilContracts } from "../hooks/useContractRequests";
import { useContractClauses, useCreateContractClause, useUpdateContractClause } from "../hooks/useContractTemplates";
import type { ContractClause } from "../../../types/domain";

const UNCATEGORIZED = "Uncategorized";

// NEW page (docs/plans/16-contract-of-sale-build-plan.md §4) -- one
// dedicated route per real clause GROUP, the user's own explicit ask.
// Each clause in the group is independently editable in place; nothing
// here ever retroactively changes a template that already copied a
// clause's body inline (TemplateDetailScreen.insertClause copies text,
// not a live reference).
export function ClauseGroupScreen() {
  const params = useParams<{ category: string }>();
  const category = decodeURIComponent(params.category ?? "");
  const canManage = useCanFulfilContracts();
  const { data: clauses, isLoading } = useContractClauses();
  const [addingNew, setAddingNew] = useState(false);

  if (!canManage) {
    return <PageHeader title="Clause library" description="You don't have access to this. Ask a manager if you need it." />;
  }

  const inGroup = (clauses ?? []).filter((c) => (c.category?.trim() || UNCATEGORIZED) === category);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/contract-of-sale/clauses">
          <ArrowLeft />
          Clause library
        </Link>
      </Button>

      <PageHeader
        title={category}
        description={`${inGroup.length} clause${inGroup.length === 1 ? "" : "s"} in this group`}
        action={
          <Button onClick={() => setAddingNew(true)} disabled={addingNew}>
            <Plus />
            New clause
          </Button>
        }
      />

      {addingNew && <NewClauseCard category={category} onDone={() => setAddingNew(false)} />}

      {!isLoading && inGroup.length === 0 && !addingNew && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">No clauses in this group yet.</CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {inGroup.map((c) => (
          <ClauseCard key={c.id} clause={c} />
        ))}
      </div>
    </div>
  );
}

function NewClauseCard({ category, onDone }: { category: string; onDone: () => void }) {
  const create = useCreateContractClause();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  async function submit() {
    if (!name.trim() || !body.trim()) return;
    await create.mutateAsync({ name: name.trim(), category: category === UNCATEGORIZED ? undefined : category, body: body.trim() });
    setName("");
    setBody("");
    onDone();
  }

  return (
    <Card className="mb-4 border-dashed">
      <CardContent className="space-y-3 pt-6">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>Body</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Clause text — may include {{tokens}}" rows={5} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!name.trim() || !body.trim() || create.isPending} onClick={submit}>
            {create.isPending ? "Saving…" : "Save clause"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ClauseCard({ clause }: { clause: ContractClause }) {
  const update = useUpdateContractClause();
  const [name, setName] = useState(clause.name);
  const [body, setBody] = useState(clause.body);
  const dirty = name !== clause.name || body !== clause.body;

  async function save() {
    await update.mutateAsync({ id: clause.id, patch: { name: name.trim(), body: body.trim() } });
  }
  async function retire() {
    await update.mutateAsync({ id: clause.id, patch: { isActive: false } });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Body</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
        </div>
        <div className="flex justify-between gap-2">
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={retire} disabled={update.isPending}>
            <Archive />
            Retire
          </Button>
          <Button size="sm" disabled={!dirty || update.isPending} onClick={save}>
            <Save />
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
