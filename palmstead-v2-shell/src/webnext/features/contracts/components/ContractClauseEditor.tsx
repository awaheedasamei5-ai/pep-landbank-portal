"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// The reference PDF uses blank-line-separated clauses. Keeping that exact
// separator means an edit to one block never silently renumbers its siblings.
export function ContractClauseEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const clauses = value.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const query = search.trim().toLowerCase();
  const visible = clauses.map((clause, index) => ({ clause, index })).filter(({ clause }) => !query || clause.toLowerCase().includes(query));

  function edit(index: number, nextValue: string) {
    // A blank block would silently remove legal wording after re-parsing.
    // Require replacement wording instead of allowing accidental deletion.
    if (!nextValue.trim()) return;
    const next = [...clauses];
    next[index] = nextValue.replace(/\n\s*\n/g, "\n");
    onChange(next.join("\n\n"));
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label className="font-semibold">{label}</Label>
          <p className="text-xs text-muted-foreground">{clauses.length} paragraphs · open one to edit its wording</p>
        </div>
        <Input aria-label={`Find a clause in ${label}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a clause or phrase" className="w-full sm:w-64" />
      </div>
      <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
        {visible.map(({ clause, index }) => (
          <details key={`${label}-${index}`} className="group rounded-md border bg-background open:border-primary/40">
            <summary className="cursor-pointer list-none p-3 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="mr-2 inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{index + 1}</span>
              <span className="font-medium">{clause.slice(0, 150)}{clause.length > 150 ? "…" : ""}</span>
            </summary>
            <div className="space-y-2 border-t p-3">
              <Label htmlFor={`${label.replace(/\W+/g, "-")}-${index}`}>Clause wording</Label>
              <Textarea id={`${label.replace(/\W+/g, "-")}-${index}`} value={clause} onChange={(event) => edit(index, event.target.value)} rows={Math.min(12, Math.max(3, Math.ceil(clause.length / 90)))} />
              <p className="text-xs text-muted-foreground">Page placement is checked before the contract can be issued.</p>
            </div>
          </details>
        ))}
        {visible.length === 0 && <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No clauses match this search.</p>}
      </div>
    </section>
  );
}
