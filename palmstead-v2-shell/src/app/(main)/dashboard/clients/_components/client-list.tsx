"use client";

import { useMemo, useState } from "react";

import { Search, Users, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clientKey, groupLeadsByClient } from "@/lib/palmstead/client-logic";
import { ghs } from "@/lib/palmstead/format";
import { usePipelineLeads } from "@/lib/palmstead/use-pipeline-leads";

// Client Database, phase 1 -- real client-side grouping of the same real
// leads Master Pipeline already fetches (no separate `clients` table in
// the schema, direct port of web-next's groupClients.ts logic). Search
// matches name, digit-normalized phone (so different formatting of the
// same number still matches), or an exact lead ID. Honestly not yet
// ported: the Customer 360 detail drawer and per-row "new deal" action
// from the real web-next screen -- a real, deliberately scoped first
// cut, same discipline as Master Pipeline's own phase 1.
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function normDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function ClientList() {
  const { data: leads, isLoading } = usePipelineLeads();
  const [query, setQuery] = useState("");

  const clients = useMemo(() => groupLeadsByClient(leads ?? []), [leads]);
  const q = query.trim().toLowerCase();
  const qDigits = normDigits(query).slice(-9);
  const filtered = useMemo(() => {
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (qDigits && normDigits(c.contact).includes(qDigits)) ||
        c.leadIds.some((id) => id.toLowerCase() === q),
    );
  }, [clients, q, qDigits]);

  const totalValue = clients.reduce((s, c) => s + c.totalValue, 0);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Client Database</h1>
        <p className="text-muted-foreground text-sm">Every client, grouped from the pipeline you can see.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <Users className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>Clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-medium text-2xl tabular-nums leading-none tracking-tight">
              {isLoading ? "…" : clients.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <Wallet className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>Total value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-medium text-2xl tabular-nums leading-none tracking-tight">
              {isLoading ? "…" : ghs(totalValue)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Search by name, phone, or lead ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Client</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="pr-6 text-right">Total value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    {clients.length === 0 ? "No clients yet." : `No clients match "${query}".`}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={clientKey(c.name, c.contact)}>
                  <TableCell className="pl-6 font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-xs">
                        {initials(c.name)}
                      </div>
                      {c.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.contact}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.leadCount}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">{ghs(c.totalValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
