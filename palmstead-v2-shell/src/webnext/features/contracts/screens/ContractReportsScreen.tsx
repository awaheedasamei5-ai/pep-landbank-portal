"use client";

import { FileBarChart, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useContracts } from "../hooks/useContracts";
import { useContractGenerations, useContractTemplates } from "../hooks/useContractTemplates";
import { useContractRequests } from "../hooks/useContractRequests";
import { useAllLeads } from "../../payments/hooks/useLogPayment";
import { useDownloadContractReport, type ContractReportKind } from "../hooks/useContractReports";

// CONTRACT_OF_SALE_BLUEPRINT.md §11 -- the 6 named reports, each a real
// branded PDF built live from real rows, nothing pre-generated. Native
// shadcn rebuild of web-next's ContractReportsScreen.
const REPORTS: { kind: ContractReportKind; label: string; hint: string }[] = [
  { kind: "production", label: "Contract production report", hint: "Volume, template vs legacy split, 6-month trend, recent contracts" },
  { kind: "outstanding", label: "Outstanding requests", hint: "Every pending request, aged oldest-first, flagged past 7 days" },
  { kind: "missing_info", label: "Missing-information report", hint: "Pending requests whose client KYC is incomplete" },
  { kind: "template_usage", label: "Template-version usage", hint: "Which published template versions have actually been used" },
  { kind: "turnaround", label: "Turnaround-time report", hint: "Real days from request to fulfilment, flagged past 5 days" },
  { kind: "document_status", label: "Document status report", hint: "Fulfilled/pending crossed with whether a document exists (no e-signature tracking yet)" },
];

export function ContractReportsScreen() {
  const { data: contracts } = useContracts();
  const { data: generations } = useContractGenerations();
  const { data: requests } = useContractRequests();
  const { data: templates } = useContractTemplates();
  const { data: leads } = useAllLeads();
  const download = useDownloadContractReport();

  const ready = !!contracts && !!generations && !!requests && !!templates && !!leads;

  return (
    <div>
      <PageHeader title="Reports" description="Live figures, exported on demand — nothing pre-generated or stale." />
      <Card>
        <CardContent className="divide-y pt-6">
          {REPORTS.map((r) => (
            <div key={r.kind} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileBarChart className="size-4" />
                </span>
                <div>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-sm text-muted-foreground">{r.hint}</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!ready || download.isPending}
                onClick={() => ready && download.mutate({ kind: r.kind, contracts: contracts!, generations: generations!, requests: requests!, templates: templates!, leads: leads! })}
              >
                <Download />
                {download.isPending ? "…" : "PDF"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
