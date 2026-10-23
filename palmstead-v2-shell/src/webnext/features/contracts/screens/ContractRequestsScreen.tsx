"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/table-empty";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { useLeads } from "../../pipeline/hooks/useLeads";
import { useContractRequests, useCreateContractRequest, useCanFulfilContracts, useFulfilContractRequest } from "../hooks/useContractRequests";
import { ContractProgressRail } from "../components/ContractProgressRail";
import type { Lead, ContractRequest } from "../../../types/domain";

// Real table `contract_requests` (confirmed live): any signed-in staff can
// request one against their own lead; only Management or the 'elizabeth'
// key can mark it fulfilled (contract_requests_upd RLS). Native shadcn
// rebuild of web-next's ContractRequestsScreen -- same request/fulfil
// workflow, real Table instead of CSS-module rows.
export function ContractRequestsScreen() {
  const { data: requests, isLoading } = useContractRequests();
  const canFulfil = useCanFulfilContracts();
  const [showForm, setShowForm] = useState(false);

  const sorted = [...(requests ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div>
      <PageHeader
        title="Contract requests"
        description={`${requests?.length ?? 0} total`}
        action={
          <div className="flex flex-wrap gap-2">
            {canFulfil && (
              <Button asChild variant="outline">
                <Link href="/dashboard/contract-of-sale/generate">
                  <FileText />
                  Generate
                </Link>
              </Button>
            )}
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus />
              {showForm ? "Cancel" : "Request contract"}
            </Button>
          </div>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New contract request</CardTitle>
          </CardHeader>
          <CardContent>
            <NewRequestForm onDone={() => setShowForm(false)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={5} message="Loading…" />
              ) : sorted.length === 0 ? (
                <TableEmpty colSpan={5} message="No contract requests yet." />
              ) : (
                sorted.map((r) => <RequestRow key={r.id} request={r} canFulfil={canFulfil && r.status === "pending"} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const { data: leads } = useLeads();
  const create = useCreateContractRequest();
  const [query, setQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [note, setNote] = useState("");

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  async function submit() {
    if (!selectedLead) return;
    await create.mutateAsync({ leadId: selectedLead.id, clientName: selectedLead.name, note: note || undefined });
    onDone();
  }

  if (!selectedLead) {
    return (
      <div className="space-y-2">
        <Input placeholder="Search your clients by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {matches.length > 0 && (
          <div className="divide-y rounded-md border">
            {matches.map((l) => (
              <button
                key={l.id}
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/60"
                onClick={() => setSelectedLead(l)}
              >
                <span className="font-medium">{l.name}</span>
                <span className="text-xs text-muted-foreground">
                  {l.contact} · {l.plotType}
                </span>
              </button>
            ))}
          </div>
        )}
        {q && matches.length === 0 && <p className="text-sm text-muted-foreground">No clients match &quot;{query}&quot;.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <span className="font-medium">{selectedLead.name}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLead(null)}>
          Change
        </Button>
      </div>
      <Textarea placeholder="Note for whoever drafts this (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="button" disabled={create.isPending} onClick={submit}>
        {create.isPending ? "Sending…" : "Send request"}
      </Button>
    </div>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function RequestRow({ request, canFulfil }: { request: ContractRequest; canFulfil: boolean }) {
  const fulfil = useFulfilContractRequest();
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials(request.clientName)}</span>
            <div>
              <div className="font-medium">{request.clientName}</div>
              {request.note && <div className="text-xs text-muted-foreground">{request.note}</div>}
            </div>
          </div>
        </TableCell>
        <TableCell>{request.requestedByName}</TableCell>
        <TableCell>{request.createdAt.slice(0, 10)}</TableCell>
        <TableCell>
          <Badge variant={request.status === "fulfilled" ? "secondary" : "outline"}>{request.status === "fulfilled" ? "Fulfilled" : "Pending"}</Badge>
        </TableCell>
        <TableCell className="text-right">
          {canFulfil && request.status === "pending" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={fulfil.isPending}
              onClick={(e) => {
                e.stopPropagation();
                fulfil.mutate(request.id);
              }}
            >
              {fulfil.isPending ? "…" : "Mark fulfilled"}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/30">
            <ContractProgressRail request={request} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
