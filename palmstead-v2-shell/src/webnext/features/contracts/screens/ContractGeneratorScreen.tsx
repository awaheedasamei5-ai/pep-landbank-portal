"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { useAllLeads } from "../../payments/hooks/useLogPayment";
import { useCanFulfilContracts } from "../hooks/useContractRequests";
import { useContracts, useGenerateContract } from "../hooks/useContracts";
import { useContractTemplates, usePublishedContractTemplateVersions, useContractGenerations } from "../hooks/useContractTemplates";
import { computeLeadQuotationTotals } from "../../quotation/lib/quotationLogic";
import { useConfig } from "../../manager/hooks/useConfigSettings";
import { ghs } from "../../../shared/lib/format";
import { LeadKycDialog } from "../components/LeadKycDialog";
import { resolveContractFields, CONTRACT_FIELD_LABELS } from "../lib/contractFieldResolver";
import { useConsistencyScanSummary, useMissingDataChecklistDraft, type ContractFieldChange } from "../hooks/useContractAi";
import { useDeleteContractDraft } from "../hooks/useContractDrafts";
import type { Lead } from "../../../types/domain";

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

  return (
    <div>
      <PageHeader title="Generate Contract" description="Search a client and generate their branded Contract of Sale PDF — the full legal document, pricing, KYC and all." />

      <Card className="mb-6">
        <CardContent className="pt-6">
          {!selectedLead ? (
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
            </>
          ) : (
            <SelectedLeadPreview lead={selectedLead} onChange={() => setSelectedLead(null)} resumeDraftId={resumeDraftId} />
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

function SelectedLeadPreview({ lead, onChange, resumeDraftId }: { lead: Lead; onChange: () => void; resumeDraftId: string | null }) {
  const { data: config } = useConfig();
  const generate = useGenerateContract();
  const deleteDraft = useDeleteContractDraft();
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

  const { data: generations } = useContractGenerations();
  const latestGen = (generations ?? []).filter((g) => g.leadId === lead.id)[0] ?? null;
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
        },
        { onSuccess: onGenerateSuccess },
      );
    } else {
      generate.mutate({ lead: { ...lead, kyc: effectiveKyc } }, { onSuccess: onGenerateSuccess });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{lead.name}</div>
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
            <div className="font-medium">{ghs(lead.amtPaid)}</div>
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
          <Label>Template</Label>
          <Select value={templateVersionId} onValueChange={setTemplateVersionId}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__standard__">Standard (legacy document)</SelectItem>
              {templateOptions.map((o) => (
                <SelectItem key={o.version.id} value={o.version.id}>
                  {o.templateName} · v{o.version.versionNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="button" disabled={generate.isPending || !config} onClick={generateNow}>
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
