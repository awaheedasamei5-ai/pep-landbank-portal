"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/table-empty";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useAllLeads } from "../../payments/hooks/useLogPayment";
import { useContractDrafts, useCreateContractDraft, useDeleteContractDraft } from "../hooks/useContractDrafts";
import type { ContractDraft, Lead } from "../../../types/domain";

// NEW page (docs/plans/16-contract-of-sale-build-plan.md §4/§1.2) -- no
// prior work covers this. A draft is just a saved pointer at a client
// (and, once picked, a template) that hasn't been generated yet; "Resume"
// hands the lead straight to the real Generate screen rather than
// re-implementing KYC/pricing/template-pick logic a second time here.
export function ContractDraftsScreen() {
  const profile = useSessionStore((s) => s.profile);
  const { data: drafts, isLoading } = useContractDrafts();
  const [createOpen, setCreateOpen] = useState(false);

  const mine = (drafts ?? []).filter((d) => d.createdBy === profile?.key);
  const others = (drafts ?? []).filter((d) => d.createdBy !== profile?.key);

  return (
    <div>
      <PageHeader
        title="Drafts"
        description="Contracts you've started but haven't generated yet."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <FilePlus2 />
            New draft
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={4} message="Loading…" />
              ) : mine.length === 0 ? (
                <TableEmpty colSpan={4} message="No drafts yet — start one from here or from Generate." />
              ) : (
                mine.map((d) => <DraftRow key={d.id} draft={d} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {others.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="mb-3 text-sm font-medium text-muted-foreground">Other staff&apos;s drafts</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Started by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {others.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.clientName}</TableCell>
                    <TableCell>{d.createdByName}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "ready_to_generate" ? "secondary" : "outline"}>{d.status === "ready_to_generate" ? "Ready" : "In progress"}</Badge>
                    </TableCell>
                    <TableCell>{d.updatedAt.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <NewDraftDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function DraftRow({ draft }: { draft: ContractDraft }) {
  const router = useRouter();
  const del = useDeleteContractDraft();
  return (
    <TableRow>
      <TableCell className="font-medium">{draft.clientName}</TableCell>
      <TableCell>
        <Badge variant={draft.status === "ready_to_generate" ? "secondary" : "outline"}>{draft.status === "ready_to_generate" ? "Ready" : "In progress"}</Badge>
      </TableCell>
      <TableCell>{draft.updatedAt.slice(0, 10)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push(`/dashboard/contract-of-sale/generate?draft=${draft.id}&lead=${draft.leadId ?? ""}`)}
          >
            Resume
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Delete draft" disabled={del.isPending} onClick={() => del.mutate(draft.id)}>
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NewDraftDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { data: leads } = useAllLeads();
  const create = useCreateContractDraft();
  const [query, setQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  async function create_() {
    if (!selectedLead) return;
    const draft = await create.mutateAsync({ leadId: selectedLead.id, clientName: selectedLead.name });
    onOpenChange(false);
    setSelectedLead(null);
    setQuery("");
    router.push(`/dashboard/contract-of-sale/generate?draft=${draft.id}&lead=${selectedLead.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New draft</DialogTitle>
          <DialogDescription>Pick a client to start a contract you'll finish later.</DialogDescription>
        </DialogHeader>
        {!selectedLead ? (
          <div className="space-y-2">
            <Input placeholder="Search any client by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {matches.length > 0 && (
              <div className="divide-y rounded-md border">
                {matches.map((l) => (
                  <button key={l.id} type="button" className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/60" onClick={() => setSelectedLead(l)}>
                    <span className="font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground">{l.contact}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="font-medium">{selectedLead.name}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLead(null)}>
              Change
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button type="button" disabled={!selectedLead || create.isPending} onClick={create_}>
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
