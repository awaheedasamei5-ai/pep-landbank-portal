"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileDown, UserPlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { useAllLeads } from "../../payments/hooks/useLogPayment";
import { useCanFulfilContracts } from "../hooks/useContractRequests";
import { useContracts, useGenerateContract } from "../hooks/useContracts";
import { useContractTemplates, usePublishedContractTemplateVersions, useContractGenerations } from "../hooks/useContractTemplates";
import { computeLeadQuotationTotals } from "../../quotation/lib/quotationLogic";
import { useConfig } from "../../manager/hooks/useConfigSettings";
import { useSessionStore } from "../../../auth/useSessionStore";
import { ghs } from "../../../shared/lib/format";
import { LeadKycDialog } from "../components/LeadKycDialog";
import { resolveContractFields, CONTRACT_FIELD_LABELS } from "../lib/contractFieldResolver";
import { useConsistencyScanSummary, useMissingDataChecklistDraft, type ContractFieldChange } from "../hooks/useContractAi";
import { useContractDrafts, useDeleteContractDraft, useUpdateContractDraft } from "../hooks/useContractDrafts";
import type { Lead, PlotType, PaymentPlan } from "../../../types/domain";

// Standalone generator for the real Contract of Sale PDF (index.html's
// buildContractOfSalePDF). Gated the same way v1's canManageContracts()
// gates the real "Contract of Sale APP": manager or the 'elizabeth' key
// only, matching contracts_ins RLS. Native shadcn rebuild of web-next's
// ContractGeneratorScreen.
export function ContractGeneratorScreen() {
  const canGenerate = useCanFulfilContracts();

  if (!canGenerate) {
    return (
      <div>
        <PageHeader title="Generate Contract" description="You don't have access to this. Ask a manager if you need it." />
      </div>
    );
  }
  return <ContractGeneratorInner />;
}

function ContractGeneratorInner() {
  const searchParams = useSearchParams();
  const resumeLeadId = searchParams.get("lead");
  const resumeDraftId = searchParams.get("draft");
  const { data: leads } = useAllLeads();
  const { data: contracts, isLoading: contractsLoading } = useContracts();
  const [query, setQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(false);
  // docs/plans/17-contract-of-sale-v3-gaps-plan.md Phase 3 -- the real
  // gap: Generate could only ever resolve against an existing leads row,
  // with no path at all for someone genuinely not in the database yet.
  const [walkInOpen, setWalkInOpen] = useState(false);

  // Resume-from-draft (docs/plans/16-contract-of-sale-build-plan.md §4) --
  // the Drafts screen hands over a leadId via the URL; once the real lead
  // list loads, auto-select it so "Resume" lands exactly where Generate
  // normally lands after a manual client search.
  useEffect(() => {
    if (resumeLeadId && leads && !selectedLead) {
      const match = leads.find((l) => l.id === resumeLeadId);
      if (match) setSelectedLead(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeLeadId, leads]);

  const q = query.trim().toLowerCase();
  const matches = q ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8) : [];

  function reset() {
    setSelectedLead(null);
    setIsWalkIn(false);
    setWalkInOpen(false);
  }

  return (
    <div>
      <PageHeader title="Generate Contract" description="Search a client and generate their branded Contract of Sale PDF — the full legal document, pricing, KYC and all." />

      <Card className="mb-6">
        <CardContent className="pt-6">
          {!selectedLead ? (
            walkInOpen ? (
              <WalkInClientForm
                onCancel={() => setWalkInOpen(false)}
                onSubmit={(lead) => {
                  setSelectedLead(lead);
                  setIsWalkIn(true);
                  setWalkInOpen(false);
                }}
              />
            ) : (
              <>
                <Input placeholder="Search any client by name or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
                {matches.length > 0 && (
                  <div className="mt-2 divide-y rounded-md border">
                    {matches.map((l) => (
                      <button key={l.id} type="button" className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/60" onClick={() => setSelectedLead(l)}>
                        <span className="font-medium">{l.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {l.contact} · {l.plotType} · {l.paymentPlan}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {q && matches.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No clients match &quot;{query}&quot;.</p>}
                <div className="mt-3 border-t pt-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => setWalkInOpen(true)}>
                    <UserPlus />
                    New client — not in the system yet
                  </Button>
                </div>
              </>
            )
          ) : (
            <SelectedLeadPreview lead={selectedLead} isWalkIn={isWalkIn} onChange={reset} resumeDraftId={resumeDraftId} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Previously generated</CardTitle>
        </CardHeader>
        <CardContent>
          {contractsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {contracts && contracts.length === 0 && !contractsLoading && <p className="text-sm text-muted-foreground">No contracts generated yet.</p>}
          <div className="divide-y">
            {contracts?.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{c.clientName}</div>
                  <div className="text-xs text-muted-foreground">
                    Generated by {c.createdByName} · {c.createdAt.slice(0, 10)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// docs/plans/17-contract-of-sale-v3-gaps-plan.md Phase 3 -- just enough
// fields to resolve every real ContractFieldKey (see contractFieldResolver.ts)
// without a leads row existing at all. Deliberately leaves grandTotal/
// netTotal/depositTarget/discount unset (not merely zeroed) so
// computeLeadQuotationTotals falls back to real config pricing by plot
// type exactly the way a normal lead without manager overrides does --
// casting through Partial<Lead> is what makes "unset" possible despite
// Lead's own fields being non-optional.
function WalkInClientForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (lead: Lead) => void }) {
  const profile = useSessionStore((s) => s.profile);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [plotType, setPlotType] = useState<PlotType>("Full Plot");
  const [noPlots, setNoPlots] = useState("1");
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("Full Payment");

  const valid = name.trim().length > 0 && contact.trim().length > 0;

  function submit() {
    if (!valid) return;
    const partial: Partial<Lead> = {
      id: `walkin-${crypto.randomUUID()}`,
      agent: profile?.key ?? "manager",
      name: name.trim(),
      contact: contact.trim(),
      address: address.trim() || undefined,
      date: new Date().toISOString().slice(0, 10),
      plotType,
      noPlots: Math.max(1, Number(noPlots) || 1),
      paymentPlan,
      amtPaid: 0,
      stage: "2A",
    };
    onSubmit(partial as Lead);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">New client — not in the system yet</p>
        <p className="text-xs text-muted-foreground">
          For someone with no real Pipeline record. This generates a standalone contract — it will never appear in Pipeline, Payments, or reports tied to a lead.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kwabena Mensah" />
        </div>
        <div className="space-y-1.5">
          <Label>Contact</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="024XXXXXXX" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="East Legon, Accra" />
        </div>
        <div className="space-y-1.5">
          <Label>Plot type</Label>
          <Select value={plotType} onValueChange={(v) => setPlotType(v as PlotType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Full Plot">Full Plot</SelectItem>
              <SelectItem value="Half Plot">Half Plot</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Number of plots</Label>
          <Input type="number" min={1} value={noPlots} onChange={(e) => setNoPlots(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Payment plan</Label>
          <Select value={paymentPlan} onValueChange={(v) => setPaymentPlan(v as PaymentPlan)}>
            <SelectTrigger className="w-full sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Full Payment">Full Payment (Outright)</SelectItem>
              <SelectItem value="3 Months">3 Months</SelectItem>
              <SelectItem value="6 Months">6 Months</SelectItem>
              <SelectItem value="9 Months">9 Months</SelectItem>
              <SelectItem value="12 Months">12 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={!valid} onClick={submit}>
          Continue
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SelectedLeadPreview({
  lead,
  isWalkIn,
  onChange,
  resumeDraftId,
}: {
  lead: Lead;
  isWalkIn: boolean;
  onChange: () => void;
  resumeDraftId: string | null;
}) {
  const { data: config } = useConfig();
  const generate = useGenerateContract();
  const deleteDraft = useDeleteContractDraft();
  const updateDraft = useUpdateContractDraft();
  const { data: templates } = useContractTemplates();
  const { data: publishedVersions } = usePublishedContractTemplateVersions();
  const totals = config ? computeLeadQuotationTotals(config, lead) : null;
  const [kycOverride, setKycOverride] = useState<typeof lead.kyc>(undefined);
  const [kycOpen, setKycOpen] = useState(false);
  const effectiveKyc = kycOverride ?? lead.kyc;
  const hasKyc = !!effectiveKyc && Object.values(effectiveKyc).some((v) => v);

  const [templateVersionId, setTemplateVersionId] = useState("__standard__");
  const templateOptions = (publishedVersions ?? []).map((v) => ({
    version: v,
    templateName: templates?.find((t) => t.id === v.templateId)?.name ?? "Untitled template",
  }));
  const selected = templateOptions.find((o) => o.version.id === templateVersionId) ?? null;

  // Real gap fixed here: useUpdateContractDraft existed but was never
  // called anywhere, so resuming a draft and picking a template here
  // never wrote that choice back -- the Drafts list (and its AI
  // readiness nudge) had no way to ever reflect real progress. Restore
  // the Select to whichever PUBLISHED version of the draft's saved
  // templateId is still current (an unpublished/superseded templateId
  // just falls back to "__standard__", same as never having picked one)
  // -- gated by `restored` so the save-back effect below can never fire
  // on the stale "__standard__" default and clobber a draft's real
  // saved templateId before this restore has had a chance to apply.
  const { data: drafts } = useContractDrafts();
  const resumedDraft = resumeDraftId ? (drafts ?? []).find((d) => d.id === resumeDraftId) : null;
  const [restored, setRestored] = useState(!resumeDraftId);
  useEffect(() => {
    if (restored || !drafts) return;
    if (resumedDraft?.templateId) {
      const match = templateOptions.find((o) => o.version.templateId === resumedDraft.templateId);
      if (match) setTemplateVersionId(match.version.id);
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, drafts, resumedDraft?.templateId, templateOptions.length]);

  // Syncs the picked template (and a real ready_to_generate/in_progress
  // status derived from whether one is actually picked) back onto the
  // draft row being resumed, same discipline as onGenerateSuccess below
  // already uses for clearing a finished draft.
  useEffect(() => {
    if (!resumeDraftId || !restored) return;
    const newTemplateId = selected?.version.templateId ?? null;
    const newStatus = selected ? 'ready_to_generate' : 'in_progress';
    if (resumedDraft && resumedDraft.templateId === newTemplateId && resumedDraft.status === newStatus) return;
    updateDraft.mutate({ id: resumeDraftId, patch: { templateId: newTemplateId, status: newStatus } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeDraftId, restored, selected?.version.id]);

  // docs/plans/17-contract-of-sale-v3-gaps-plan.md Phase 3 -- real amount-
  // paid capture, right in the client-details step before generation, as
  // asked. An existing lead shows its real figure (synced from the real
  // Payments ledger, never a parallel editable field here per
  // pipeline-payment-integrity's standing caution) with a link out to the
  // real Log Payment flow; a walk-in has no ledger to diverge from, so a
  // plain typed figure is the legitimate case for one.
  const [walkInAmountPaid, setWalkInAmountPaid] = useState("0");
  const amountPaidOverride = isWalkIn ? Number(walkInAmountPaid) || 0 : undefined;

  const { data: generations } = useContractGenerations();
  const latestGen = isWalkIn ? null : (generations ?? []).filter((g) => g.leadId === lead.id)[0] ?? null;
  const changes: ContractFieldChange[] = [];
  if (latestGen && config) {
    const current = resolveContractFields({ ...lead, kyc: effectiveKyc }, config);
    for (const [key, label] of Object.entries(CONTRACT_FIELD_LABELS)) {
      if (key === "generationDate") continue;
      const oldValue = latestGen.fieldValuesSnapshot[key];
      const newValue = current[key as keyof typeof current];
      if (oldValue !== undefined && oldValue !== newValue) changes.push({ label, oldValue, newValue });
    }
  }
  const { data: consistencyNote } = useConsistencyScanSummary(lead.id, changes);

  const checklistDraft = useMissingDataChecklistDraft();
  useEffect(() => {
    const missingKeys = generate.error ? (generate.error as { missingKeys?: string[] }).missingKeys : undefined;
    if (missingKeys && missingKeys.length > 0) checklistDraft.mutate(missingKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generate.error]);

  // Resuming a draft is one-way: once the document is actually generated,
  // the draft's job is done, so it's cleared rather than left to linger
  // as a stale "in progress" row.
  function onGenerateSuccess() {
    if (resumeDraftId) deleteDraft.mutate(resumeDraftId);
  }

  function generateNow() {
    if (selected) {
      generate.mutate(
        {
          lead: { ...lead, kyc: effectiveKyc },
          template: {
            templateId: selected.version.templateId,
            templateVersionId: selected.version.id,
            versionNumber: selected.version.versionNumber,
            templateName: selected.templateName,
            content: selected.version.content,
          },
          isWalkIn,
          amountPaidOverride,
        },
        { onSuccess: onGenerateSuccess },
      );
    } else {
      // Walk-in has no v1-parity legacy-document fallback (see
      // GenerateContractInput's own comment) -- a real published
      // template must be picked first, guarded by the Select below.
      generate.mutate({ lead: { ...lead, kyc: effectiveKyc } }, { onSuccess: onGenerateSuccess });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{lead.name}</span>
            {isWalkIn && (
              <Badge variant="outline" title="Generated directly, never added to Pipeline">
                Walk-in — not linked to Pipeline
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {lead.contact} · {lead.plotType} · {lead.noPlots || 1} plot(s)
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChange}>
          Change
        </Button>
      </div>

      {totals && (
        <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Agreed price</div>
            <div className="font-medium">{ghs(totals.grand)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Amount paid</div>
            {isWalkIn ? (
              <Input
                type="number"
                min={0}
                value={walkInAmountPaid}
                onChange={(e) => setWalkInAmountPaid(e.target.value)}
                className="mt-0.5 h-7 w-32"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-medium">{ghs(lead.amtPaid)}</span>
                <Button asChild type="button" variant="link" size="sm" className="h-auto p-0 text-xs">
                  <Link href={`/dashboard/pipeline/${lead.id}`} target="_blank">
                    Update amount paid
                    <ExternalLink className="size-3" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
          {totals.planMonths > 0 && (
            <div>
              <div className="text-xs text-muted-foreground">Monthly due ({totals.planMonths} months)</div>
              <div className="font-medium">{ghs(totals.monthlyDue)}</div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {!hasKyc ? (
          <p className="text-sm text-muted-foreground">No KYC details captured yet — those fields will render blank on the PDF.</p>
        ) : (
          <p className="text-sm text-muted-foreground">KYC details on file.</p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setKycOpen(true)}>
          {hasKyc ? "Edit KYC details" : "Add KYC details"}
        </Button>
      </div>

      {consistencyNote && (
        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">AI</span>
          <span className="text-muted-foreground">{consistencyNote}</span>
        </div>
      )}

      {templateOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label>Template {isWalkIn && <span className="text-destructive">*</span>}</Label>
          <Select value={templateVersionId} onValueChange={setTemplateVersionId}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Walk-in has no v1-parity legacy-document fallback -- that
                  path's own contracts.create() needs a real, non-null
                  lead_id with no FK to relax the way contract_generations'
                  was (see useContracts.ts's own comment). */}
              {!isWalkIn && <SelectItem value="__standard__">Standard (legacy document)</SelectItem>}
              {templateOptions.map((o) => (
                <SelectItem key={o.version.id} value={o.version.id}>
                  {o.templateName} · v{o.version.versionNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isWalkIn && !selected && <p className="text-xs text-muted-foreground">A walk-in client needs a real published template picked here.</p>}
        </div>
      )}

      <Button type="button" disabled={generate.isPending || !config || (isWalkIn && !selected)} onClick={generateNow}>
        <FileDown />
        {generate.isPending ? "Generating…" : "Generate & download PDF"}
      </Button>

      {generate.isError && <p className="text-sm text-destructive">{(generate.error as Error).message}</p>}
      {generate.isError && checklistDraft.data && (
        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">AI</span>
          <span className="text-muted-foreground">{checklistDraft.data}</span>
        </div>
      )}

      <LeadKycDialog lead={{ ...lead, kyc: effectiveKyc }} open={kycOpen} onOpenChange={setKycOpen} onSaved={setKycOverride} allowSkip />
    </div>
  );
}
