"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useContractTemplates, useContractTemplateVersions } from "../hooks/useContractTemplates";
import { useCanFulfilContracts } from "../hooks/useContractRequests";
import { useConfig } from "../../manager/hooks/useConfigSettings";
import { resolveContractFields, resolveSections } from "../lib/contractFieldResolver";
import { buildContractFromSections, contractFilename } from "../lib/contractSectionsPdf";
import { useClauseExplainer } from "../hooks/useContractAi";
import { useContractStyleSettings } from "../hooks/useContractStyleSettings";
import { loadImageAsDataUri } from "../../../shared/lib/image";
import type { ContractSection, Lead } from "../../../types/domain";

// CONTRACT_OF_SALE_BLUEPRINT.md §6.3 -- a small hardcoded SAMPLE lead,
// clearly labeled as such, per the standing "never pass off examples as
// real data" rule. Real company config (vendor name etc.) is NOT faked --
// only the client-specific data is sample.
const SAMPLE_LEAD: Lead = {
  id: "sample",
  agent: "sample",
  name: "Kwabena Sample",
  contact: "0240000000",
  date: new Date().toISOString().slice(0, 10),
  plotType: "Full Plot",
  noPlots: 1,
  unitPrice: 48000,
  paymentPlan: "6 Months",
  amtPaid: 14400,
  grandTotal: 48000,
  stage: "2A",
  address: "East Legon, Accra",
  kyc: {
    nationality: "Ghanaian",
    occupation: "Sample Occupation",
    idType: "Ghana Card",
    idNumber: "GHA-000000000-0",
    contactName: "Sample Contact Person",
    contactPhone: "0240000001",
    landUsage: "Residential",
  },
};

function renderWithTokens(text: string) {
  const parts = text.split(/(\{\{[A-Za-z][A-Za-z0-9]*\}\})/g);
  return parts.map((part, i) =>
    part.startsWith("{{") ? (
      <span key={i} className="rounded bg-primary/10 px-1 py-0.5 font-mono text-[0.9em] text-primary">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function TemplatePreviewScreen() {
  const params = useParams<{ id: string }>();
  const templateId = params.id;
  const searchParams = useSearchParams();
  const requestedVersionId = searchParams.get("version");
  const router = useRouter();
  const canManage = useCanFulfilContracts();
  const { data: templates } = useContractTemplates();
  const { data: versions } = useContractTemplateVersions(templateId ?? "");
  const { data: config } = useConfig();
  const { data: styleSettings } = useContractStyleSettings();

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to this. Ask a manager if you need it.</p>;
  }

  const template = templates?.find((t) => t.id === templateId);
  const version = (requestedVersionId && versions?.find((v) => v.id === requestedVersionId)) || versions?.find((v) => v.status === "published") || versions?.[0] || null;

  if (!templateId || (templates && !template)) {
    return <p className="text-sm text-muted-foreground">Template not found.</p>;
  }
  if (!template || !versions || !config) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!version || version.content.length === 0) {
    return (
      <div>
        <BackLink templateId={templateId} name={template.name} router={router} />
        <p className="text-sm text-muted-foreground">This version has no sections yet — nothing to preview.</p>
      </div>
    );
  }

  const fieldValues = resolveContractFields(SAMPLE_LEAD, config);
  const resolved: ContractSection[] = resolveSections(version.content, fieldValues);

  async function download() {
    if (!config) return;
    let cover: string | null = null;
    try {
      cover = config.contractCoverImage || (await loadImageAsDataUri("/contract-cover.jpg"));
    } catch {
      // Missing cover image shouldn't stop the preview from downloading.
    }
    const doc = buildContractFromSections(template!.name, resolved, styleSettings, cover);
    doc.save(contractFilename(SAMPLE_LEAD.name));
  }

  return (
    <div>
      <BackLink templateId={templateId} name={template.name} router={router} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Preview — v{version.versionNumber}</h1>
        <Button onClick={download}>
          <FileDown />
          Download preview PDF
        </Button>
      </div>

      <p className="mb-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
        Preview — sample data, not a real client.
      </p>

      <Card className="mx-auto max-w-3xl">
        <CardContent className="flex flex-col gap-4 py-8">
          {resolved.map((section) =>
            section.kind === "heading" ? (
              <div key={section.id} className="text-center text-lg font-semibold">
                {renderWithTokens(section.text ?? "")}
              </div>
            ) : section.kind === "signature_block" ? (
              <div key={section.id} className="border-t pt-4 text-center text-sm text-muted-foreground">
                Signed and delivered — Sign / Name / Designation (Vendor and Purchaser)
              </div>
            ) : section.kind === "image" ? (
              <div key={section.id} className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                [Image: {section.imageRef || "not set"}]
              </div>
            ) : (
              <ExplainableSection key={section.id} text={section.text ?? ""} />
            ),
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BackLink({ templateId, name, router }: { templateId: string; name: string; router: ReturnType<typeof useRouter> }) {
  return (
    <Button asChild variant="ghost" size="sm" className="mb-2">
      <Link href={`/dashboard/contract-of-sale/templates/${templateId}`}>
        <ArrowLeft />
        {name}
      </Link>
    </Button>
  );
}

function ExplainableSection({ text }: { text: string }) {
  const explain = useClauseExplainer();
  const [open, setOpen] = useState(false);

  return (
    <div className="text-sm leading-relaxed">
      <div>{renderWithTokens(text)}</div>
      {!open ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          disabled={explain.isPending}
          onClick={() => {
            setOpen(true);
            explain.mutate(text);
          }}
        >
          <Sparkles className="size-3" />
          {explain.isPending ? "Explaining…" : "Explain this clause"}
        </Button>
      ) : (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-2.5 text-xs">
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-semibold tracking-wide text-primary">AI</span>
          <span className="text-muted-foreground">{explain.isPending ? "Thinking…" : explain.isError ? "Couldn't explain this clause right now." : explain.data || "No explanation available."}</span>
        </div>
      )}
    </div>
  );
}
