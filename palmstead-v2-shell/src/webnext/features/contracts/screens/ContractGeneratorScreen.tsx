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
import { useCanAdministerContracts, useCanFulfilContracts } from "../hooks/useContractRequests";
import { useContracts, useGenerateContract } from "../hooks/useContracts";
import { useContractTemplates, usePublishedContractTemplateVersions, useContractGenerations } from "../hooks/useContractTemplates";
import { computeLeadQuotationTotals } from "../../quotation/lib/quotationLogic";
import { useConfig } from "../../manager/hooks/useConfigSettings";
import { useSessionStore } from "../../../auth/useSessionStore";
import { ghs } from "../../../shared/lib/format";
import { LeadKycDialog } from "../components/LeadKycDialog";
import { ContractClauseEditor } from "../components/ContractClauseEditor";
import { resolveContractFields, CONTRACT_FIELD_LABELS } from "../lib/contractFieldResolver";
import { useConsistencyScanSummary, useMissingDataChecklistDraft, type ContractFieldChange } from "../hooks/useContractAi";
import { useContractDrafts, useDeleteContractDraft, useUpdateContractDraft } from "../hooks/useContractDrafts";
import { contractFilename, prepareStandardContractPdf } from "../lib/contractPdf";
import { friendlyError } from "../../../shared/lib/friendlyError";
import type { Lead, PlotType, PaymentPlan } from "../../../types/domain";

function snapshotMoney(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const amount = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? amount : undefined;
}

function walkInFromSnapshot(fields: Record<string, string>, profileKey: string): Lead {
  const plotType: PlotType = fields.plotType === "Half Plot" ? "Half Plot" : "Full Plot";
  const plotCount = Math.max(1, Number(fields.noPlots) || 1);
  const months = Number(fields.paymentPlanMonths);
  const paymentPlan: PaymentPlan = months === 3 || months === 6 || months === 9 || months === 12 ? `${months} Months` : "Full Payment";
  return {
    id: `walkin-copy-${crypto.randomUUID()}`,
    agent: profileKey,
    name: fields.clientLegalName || "",
    contact: fields.clientContact || "",
    address: fields.clientAddress || "",
    date: new Date().toISOString().slice(0, 10),
    plotType,
    noPlots: plotCount * (plotType === "Half Plot" ? 0.5 : 1),
    paymentPlan,
    grandTotal: snapshotMoney(fields.grandTotal),
    depositTarget: snapshotMoney(fields.depositAmount),
    amtPaid: snapshotMoney(fields.amountPaidToDate) ?? 0,
    stage: "2A",
    kyc: {
      address: fields.clientAddress || "",
      nationality: fields.kycNationality || "",
      occupation: fields.kycOccupation || "",
      idType: fields.kycIdType || "",
      idNumber: fields.kycIdNumber || "",
      contactName: fields.kycContactName || "",
      contactPhone: fields.kycContactPhone || "",
      landUsage: fields.kycLandUsage || "",
    },
  } as Lead;
}

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
  const correctionSourceId = searchParams.get("correct") || searchParams.get("copy");
  const { data: leads } = useAllLeads();
  const { data: generations } = useContractGenerations();
  const sourceGeneration = correctionSourceId ? generations?.find((g) => g.id === correctionSourceId) : null;
  const profileKey = useSessionStore((state) => state.profile?.key ?? "");
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
    if (selectedLead || (correctionSourceId && !generations)) return;
    if (sourceGeneration && !sourceGeneration.leadId) {
      setSelectedLead(walkInFromSnapshot(sourceGeneration.fieldValuesSnapshot, profileKey));
      setIsWalkIn(true);
      return;
    }
    if (resumeLeadId && leads) {
      const match = leads.find((l) => l.id === resumeLeadId);
      if (match) setSelectedLead(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeLeadId, leads, correctionSourceId, generations, sourceGeneration, profileKey, selectedLead]);

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
            <SelectedLeadPreview key={selectedLead.id} lead={selectedLead} isWalkIn={isWalkIn} onChange={reset} resumeDraftId={resumeDraftId} correctionSourceId={correctionSourceId} copyFields={sourceGeneration?.fieldValuesSnapshot} />
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

  const valid = name.trim().length > 0 && contact.trim().length > 0 && Number.isInteger(Number(noPlots)) && Number(noPlots) > 0;

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
      noPlots: Number(noPlots) * (plotType === "Half Plot" ? 0.5 : 1),
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
  correctionSourceId,
  copyFields,
}: {
  lead: Lead;
  isWalkIn: boolean;
  onChange: () => void;
  resumeDraftId: string | null;
  correctionSourceId: string | null;
  copyFields?: Record<string, string>;
}) {
  const { data: config } = useConfig();
  const canEditLegalText = useCanAdministerContracts();
  const generate = useGenerateContract();
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const deleteDraft = useDeleteContractDraft();
  const updateDraft = useUpdateContractDraft();
  const { data: templates } = useContractTemplates();
  const { data: publishedVersions, isLoading: publishedVersionsLoading } = usePublishedContractTemplateVersions();
  const [plotTypeForContract, setPlotTypeForContract] = useState<PlotType>(copyFields?.plotType === "Half Plot" ? "Half Plot" : lead.plotType);
  const [plotCountForContract, setPlotCountForContract] = useState(copyFields?.noPlots || String((lead.noPlots || 1) / (lead.plotType === "Half Plot" ? 0.5 : 1)));
  const [acresForContract, setAcresForContract] = useState(copyFields?.landAcres || "");
  const [priceForContract, setPriceForContract] = useState(copyFields?.grandTotal ? String(snapshotMoney(copyFields.grandTotal) ?? "") : "");
  const [depositForContract, setDepositForContract] = useState(copyFields?.depositAmount ? String(snapshotMoney(copyFields.depositAmount) ?? "") : "");
  const [temporaryLegalOpen, setTemporaryLegalOpen] = useState(false);
  const [temporaryPreamble, setTemporaryPreamble] = useState(config?.contractPreamble ?? "");
  const [temporaryDefinitions, setTemporaryDefinitions] = useState(config?.contractDefinitions ?? "");
  const [temporaryTerms, setTemporaryTerms] = useState(config?.contractTerms ?? "");
  const plotCount = Number(plotCountForContract);
  const plotChanged = plotTypeForContract !== lead.plotType || plotCount !== (lead.noPlots || 1) / (lead.plotType === "Half Plot" ? 0.5 : 1);
  const contractLead: Lead = {
    ...lead,
    plotType: plotTypeForContract,
    noPlots: plotCount * (plotTypeForContract === "Half Plot" ? 0.5 : 1),
    ...(plotChanged ? { unitPrice: undefined, discount: undefined, netTotal: undefined, grandTotal: undefined, depositTarget: undefined } : {}),
    ...(priceForContract.trim() ? { grandTotal: Number(priceForContract) } : {}),
    ...(depositForContract.trim() ? { depositTarget: Number(depositForContract) } : {}),
  };
  const totals = config && Number.isFinite(plotCount) && plotCount > 0 ? computeLeadQuotationTotals(config, contractLead) : null;
  const acresOverride = acresForContract.trim() ? Number(acresForContract) : undefined;
  const transactionValid = Number.isInteger(plotCount) && plotCount > 0 && (!priceForContract.trim() || (Number.isFinite(Number(priceForContract)) && Number(priceForContract) > 0)) && (!depositForContract.trim() || (Number.isFinite(Number(depositForContract)) && Number(depositForContract) >= 0 && Number(depositForContract) <= (totals?.grand ?? 0))) && (acresOverride === undefined || (Number.isFinite(acresOverride) && acresOverride > 0)) && (!temporaryLegalOpen || (!!temporaryPreamble.trim() && !!temporaryDefinitions.trim() && !!temporaryTerms.trim()));
  const [kycOverride, setKycOverride] = useState<typeof lead.kyc>(copyFields ? {
    ...lead.kyc,
    address: copyFields.clientAddress || lead.kyc?.address,
    nationality: copyFields.kycNationality || lead.kyc?.nationality,
    occupation: copyFields.kycOccupation || lead.kyc?.occupation,
    idType: copyFields.kycIdType || lead.kyc?.idType,
    idNumber: copyFields.kycIdNumber || lead.kyc?.idNumber,
    contactName: copyFields.kycContactName || lead.kyc?.contactName,
    contactPhone: copyFields.kycContactPhone || lead.kyc?.contactPhone,
    landUsage: copyFields.kycLandUsage || lead.kyc?.landUsage,
  } : undefined);
  const [kycOpen, setKycOpen] = useState(false);
  useEffect(() => { if (correctionSourceId) setKycOpen(true); }, [correctionSourceId]);
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
  const [walkInAmountPaid, setWalkInAmountPaid] = useState(String(snapshotMoney(copyFields?.amountPaidToDate) ?? lead.amtPaid ?? 0));
  const parsedWalkInAmountPaid = Number(walkInAmountPaid);
  const walkInAmountValid = walkInAmountPaid.trim() !== "" && Number.isFinite(parsedWalkInAmountPaid) && parsedWalkInAmountPaid >= 0;
  const amountPaidOverride = isWalkIn && walkInAmountValid ? parsedWalkInAmountPaid : undefined;

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
    if ((isWalkIn && !walkInAmountValid) || !transactionValid) return;
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
      generate.mutate({ lead: { ...contractLead, kyc: effectiveKyc }, isWalkIn, amountPaidOverride, acresOverride, legalOverride: temporaryLegalOpen ? { contractPreamble: temporaryPreamble, contractDefinitions: temporaryDefinitions, contractTerms: temporaryTerms } : undefined }, { onSuccess: onGenerateSuccess });
    }
  }

  async function previewStandardPdf() {
    if (!config || selected || !transactionValid || (isWalkIn && !walkInAmountValid)) return;
    setPreviewError(null);
    setPreviewPending(true);
    try {
      const previewLead = { ...contractLead, kyc: effectiveKyc, ...(isWalkIn ? { amtPaid: amountPaidOverride ?? 0 } : {}) };
      const previewConfig = temporaryLegalOpen
        ? { ...config, contractPreamble: temporaryPreamble, contractDefinitions: temporaryDefinitions, contractTerms: temporaryTerms }
        : config;
      const doc = await prepareStandardContractPdf(previewLead, previewConfig, acresOverride);
      doc.save(`Preview-${contractFilename(lead.name)}`);
    } catch (error) {
      setPreviewError(friendlyError(error, "The preview could not be prepared."));
    } finally {
      setPreviewPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {correctionSourceId && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">Correct the KYC details, then preview and generate a replacement PDF. The earlier issued PDF stays in the vault for audit until Management removes it from the active list.</div>}
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
            {lead.contact} · {lead.plotType} · {(lead.noPlots || 1) / (lead.plotType === "Half Plot" ? 0.5 : 1)} plot(s)
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChange}>
          Change
        </Button>
      </div>

      <div className="rounded-md border bg-muted/20 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Details for this contract</p>
          <p className="text-xs text-muted-foreground">{isWalkIn ? "Details for this standalone PDF. A replacement keeps the earlier copy in the vault for audit." : "Pricing changes here affect this PDF only. KYC changes are saved to the client record; Payments and Quotation stay unchanged."}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><Label>Plot type</Label><Select value={plotTypeForContract} onValueChange={(v) => setPlotTypeForContract(v as PlotType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Full Plot">Full Plot</SelectItem><SelectItem value="Half Plot">Half Plot</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Number of plots</Label><Input type="number" min={1} step={1} value={plotCountForContract} onChange={(e) => setPlotCountForContract(e.target.value)} /></div>
          <div className="space-y-1"><Label>Acres, if different</Label><Input type="number" min={0} step="0.001" value={acresForContract} onChange={(e) => setAcresForContract(e.target.value)} placeholder={String(Math.round((contractLead.noPlots || 1) * 0.1607 * 100) / 100)} /></div>
          <div className="space-y-1"><Label>Agreed total, if different (GHS)</Label><Input type="number" min={0} step="0.01" value={priceForContract} onChange={(e) => setPriceForContract(e.target.value)} placeholder={totals ? totals.grand.toFixed(2) : ""} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Agreed deposit, if different (GHS)</Label><Input type="number" min={0} step="0.01" value={depositForContract} onChange={(e) => setDepositForContract(e.target.value)} placeholder={totals ? totals.deposit.toFixed(2) : ""} /></div>
        </div>
        {!transactionValid && <p className="text-sm text-destructive">Enter a whole number of plots, a positive price and land size, and a deposit no greater than the total.</p>}
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
                step="0.01"
                value={walkInAmountPaid}
                onChange={(e) => setWalkInAmountPaid(e.target.value)}
                aria-invalid={!walkInAmountValid}
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

      {isWalkIn && !walkInAmountValid && <p className="text-sm text-destructive">Enter a valid amount paid of zero or more.</p>}

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

      <div className="space-y-1.5">
        <Label>Document layout</Label>
        <Select value={templateVersionId} onValueChange={setTemplateVersionId}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__standard__">Standard quotation Royal Palm Enclave</SelectItem>
            {templateOptions.map((o) => (
              <SelectItem key={o.version.id} value={o.version.id}>
                {o.templateName} · v{o.version.versionNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && <p className="text-xs text-muted-foreground">Published templates use their own page layout. Check the preview before issuing.</p>}
      </div>

      {!selected && canEditLegalText && (
        <div className="rounded-md border p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-medium">Legal wording for this client</p><p className="text-xs text-muted-foreground">A temporary exception is saved in this client&apos;s PDF only. The company standard stays unchanged.</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => { if (!temporaryLegalOpen && config) { setTemporaryPreamble(config.contractPreamble); setTemporaryDefinitions(config.contractDefinitions); setTemporaryTerms(config.contractTerms); } setTemporaryLegalOpen(!temporaryLegalOpen); }}>{temporaryLegalOpen ? "Use company standard" : "Edit for this client"}</Button>
          </div>
          {temporaryLegalOpen && <div className="space-y-3">
            <ContractClauseEditor label="Opening and WHEREAS" value={temporaryPreamble} onChange={setTemporaryPreamble} />
            <ContractClauseEditor label="Definitions" value={temporaryDefinitions} onChange={setTemporaryDefinitions} />
            <ContractClauseEditor label="Terms and notices" value={temporaryTerms} onChange={setTemporaryTerms} />
            <Button type="button" variant="ghost" size="sm" onClick={() => { if (config) { setTemporaryPreamble(config.contractPreamble); setTemporaryDefinitions(config.contractDefinitions); setTemporaryTerms(config.contractTerms); } }}>Restore company standard text</Button>
          </div>}
        </div>
      )}

      {isWalkIn && publishedVersionsLoading && <p className="text-sm text-muted-foreground">Loading additional published templates…</p>}

      <div className="flex flex-wrap gap-2">
        {!selected && (
          <Button type="button" variant="outline" disabled={previewPending || generate.isPending || !config || !transactionValid || (isWalkIn && !walkInAmountValid)} onClick={previewStandardPdf}>
            <FileDown />
            {previewPending ? "Preparing preview…" : "Preview PDF"}
          </Button>
        )}
        <Button type="button" disabled={previewPending || generate.isPending || !config || !transactionValid || (isWalkIn && !walkInAmountValid)} onClick={generateNow}>
          <FileDown />
          {generate.isPending ? "Generating…" : "Generate & download PDF"}
        </Button>
      </div>
      {!selected && <p className="text-xs text-muted-foreground">Preview downloads the exact standard document for review. It does not issue a contract or add a vault record.</p>}
      {previewError && <p className="text-sm text-destructive" role="alert">{previewError}</p>}

      {generate.isError && <p className="text-sm text-destructive">{(generate.error as Error).message}</p>}
      {generate.isError && checklistDraft.data && (
        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">AI</span>
          <span className="text-muted-foreground">{checklistDraft.data}</span>
        </div>
      )}

      <LeadKycDialog lead={{ ...lead, kyc: effectiveKyc }} open={kycOpen} onOpenChange={setKycOpen} onSaved={setKycOverride} allowSkip persist={!isWalkIn} />
    </div>
  );
}

