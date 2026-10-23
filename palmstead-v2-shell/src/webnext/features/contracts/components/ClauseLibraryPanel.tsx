"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useContractClauses } from "../hooks/useContractTemplates";

interface ClauseLibraryPanelProps {
  onInsert: (clauseId: string, body: string) => void;
}

// CONTRACT_OF_SALE_BLUEPRINT.md §6.2 -- converged from PandaDoc's real
// Content Library picker (a row of preview cards for reusable blocks).
// Insert-only here by design: the user's own explicit ask is that full
// clause editing lives on real dedicated per-group pages (/clauses), not
// buried in this side panel -- see ContractClausesScreen/ClauseGroupScreen.
// Clicking a clause inserts a COPY of its body (clauseId kept only for
// lineage) so the version stays self-contained even if the library
// clause is edited afterward.
export function ClauseLibraryPanel({ onInsert }: ClauseLibraryPanelProps) {
  const { data: clauses } = useContractClauses();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = (clauses ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.category ?? "").toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-3 p-3">
      <Input placeholder="Search clauses…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {(clauses ?? []).length === 0 ? "No clauses in the library yet — add one from the Clause library." : "No clauses match that search."}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onInsert(c.id, c.body)}
            className="rounded-md border p-2.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.name}</span>
              {c.category && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {c.category}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.body}</div>
          </button>
        ))}
      </div>

      <Link href="/dashboard/contract-of-sale/clauses" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        Manage clause library
        <ArrowUpRight className="size-3" />
      </Link>
    </div>
  );
}
