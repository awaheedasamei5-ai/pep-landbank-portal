"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { Image as ImageIcon, Save, Upload } from "lucide-react";
import { useCanAdministerContracts } from "../hooks/useContractRequests";
import { useConfig, useUpdateConfig } from "../../manager/hooks/useConfigSettings";
import { useContractStyleSettings, useUpdateContractStyleSettings } from "../hooks/useContractStyleSettings";
import { friendlyError } from "../../../shared/lib/friendlyError";
import { buildContractOfSalePdf } from "../lib/contractPdf";
import type { Config, Lead } from "../../../types/domain";

const MAX_IMAGE_BYTES = 500 * 1024;
const FONT_OPTIONS: { value: "times" | "helvetica" | "courier"; label: string; sample: string }[] = [
  { value: "times", label: "Times (serif, traditional)", sample: "font-serif" },
  { value: "helvetica", label: "Helvetica (sans, modern)", sample: "font-sans" },
  { value: "courier", label: "Courier (mono, typewriter)", sample: "font-mono" },
];

// NEW page (docs/plans/16-contract-of-sale-build-plan.md §4) -- the
// user's own explicit ask: "a page for editing the contract texts,
// fonts etc." Two real, independently-writable layers, both genuinely
// wired into PDF output, not cosmetic:
// 1. Branding (CEO name, cover image, wordmark) -- real app_config
//    columns already READ by contractPdf.ts but never whitelisted for
//    WRITING anywhere (fixed in data/source.ts as part of this page).
// 2. Typography (heading/body font family, heading/base size) -- the new
//    contract_style_settings table, wired into contractSectionsPdf.ts's
//    title/heading/image-placeholder/signature-block rendering. Body
//    paragraph/clause text stays on the proven legacy clause-numbering
//    renderer for now (see that file's own comment) -- flagged here too
//    rather than implying every pixel of the document is configurable.
export function ContractStyleScreen() {
  const canManage = useCanAdministerContracts();
  const { data: config } = useConfig();
  const { data: styleSettings } = useContractStyleSettings();

  if (!canManage) {
    return <PageHeader title="Style & text" description="You don't have access to this. Ask a manager if you need it." />;
  }

  return (
    <div>
      <PageHeader title="Style & text" description="Branding and typography for the generated Contract of Sale PDF." />
      <div className="grid gap-6 lg:grid-cols-2">
        {config && <BrandingCard config={config} />}
        {styleSettings !== undefined && <TypographyCard settings={styleSettings} />}
        {config && <LegalTextCard config={config} />}
      </div>
    </div>
  );
}

function LegalTextCard({ config }: { config: Config }) {
  const update = useUpdateConfig();
  const [preamble, setPreamble] = useState(config.contractPreamble);
  const [definitions, setDefinitions] = useState(config.contractDefinitions);
  const [terms, setTerms] = useState(config.contractTerms);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = preamble !== config.contractPreamble || definitions !== config.contractDefinitions || terms !== config.contractTerms;

  async function save() {
    setError(null);
    if (!preamble.trim() || !definitions.trim() || !terms.trim()) {
      setError("The standard contract needs all three legal sections.");
      return;
    }
    try {
      const sampleLead = {
        name: "SAMPLE CLIENT NAME",
        address: "SAMPLE CLIENT ADDRESS",
        contact: "0000000000",
        plotType: "Full Plot",
        noPlots: 1,
        paymentPlan: "9 Months",
        amtPaid: 20016,
      } as Lead;
      buildContractOfSalePdf(sampleLead, { ...config, contractPreamble: preamble, contractDefinitions: definitions, contractTerms: terms }, null, null);
      await update.mutateAsync({ contractPreamble: preamble.trim(), contractDefinitions: definitions.trim(), contractTerms: terms.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(friendlyError(e, "The edited wording did not fit the ten-page layout"));
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Standard legal wording</CardTitle>
        <CardDescription>Permanent changes affect future standard contracts. The original approved wording remains available below. Every save checks the ten-page layout first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1"><Label>Opening and WHEREAS clauses</Label><Textarea rows={8} value={preamble} onChange={(e) => setPreamble(e.target.value)} /></div>
        <div className="space-y-1"><Label>Definitions and interpretation</Label><Textarea rows={8} value={definitions} onChange={(e) => setDefinitions(e.target.value)} /></div>
        <div className="space-y-1"><Label>Representations, payment, remedies and notices</Label><Textarea rows={10} value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || update.isPending} onClick={save}>{update.isPending ? "Saving…" : saved ? "Saved" : "Save as company standard"}</Button>
          <Button type="button" variant="outline" onClick={() => { setPreamble(config.contractPreamble); setDefinitions(config.contractDefinitions); setTerms(config.contractTerms); setError(null); }}>Discard unsaved edits</Button>
          <Button type="button" variant="ghost" onClick={() => { setPreamble(config.contractStandardPreamble); setDefinitions(config.contractStandardDefinitions); setTerms(config.contractStandardTerms); setError(null); }}>Load original approved wording</Button>
        </div>
        <p className="text-xs text-muted-foreground">Loading the original does not change new contracts until you save it as the company standard. Review legal changes with Management before issuing.</p>
      </CardContent>
    </Card>
  );
}

function BrandingCard({ config }: { config: NonNullable<ReturnType<typeof useConfig>["data"]> }) {
  const update = useUpdateConfig();
  const [ceoName, setCeoName] = useState(config.contractCeoName);
  const [companyAddress, setCompanyAddress] = useState(config.contractCompanyAddress);
  const [cover, setCover] = useState<string | null>(config.contractCoverImage);
  const [wordmark, setWordmark] = useState<string | null>(config.contractWordmarkImage);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = ceoName !== config.contractCeoName || companyAddress !== config.contractCompanyAddress || cover !== config.contractCoverImage || wordmark !== config.contractWordmarkImage;

  function pickImage(e: React.ChangeEvent<HTMLInputElement>, set: (v: string | null) => void) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG or JPEG).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is too large — please use one under 500KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set(String(reader.result));
    reader.onerror = () => setError("Could not read that file — please try another.");
    reader.readAsDataURL(file);
  }

  async function save() {
    setError(null);
    try {
      if (!companyAddress.trim()) throw new Error("Enter the company address shown in contracts.");
      await update.mutateAsync({ contractCeoName: ceoName.trim(), contractCompanyAddress: companyAddress.trim(), contractCoverImage: cover, contractWordmarkImage: wordmark });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(friendlyError(e, "Failed to save branding"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Shown on the cover page and signature block of every generated Contract of Sale.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>CEO name</Label>
          <Input value={ceoName} onChange={(e) => setCeoName(e.target.value)} placeholder="FRANK ADU PEPRAH" />
        </div>
        <div className="space-y-1.5">
          <Label>Company address on contracts</Label>
          <Textarea value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} rows={2} maxLength={240} placeholder="Post Office Box CO 3644&#10;Tema" />
          <p className="text-xs text-muted-foreground">Appears under the company name, beneath the logo, and in the vendor paragraph. Changing it updates new contracts only.</p>
        </div>

        <ImagePicker label="Cover image" hint="Shown on the contract's cover page." value={cover} onPick={(e) => pickImage(e, setCover)} onReset={() => setCover(null)} />
        <ImagePicker label="Wordmark" hint="The company wordmark/logo mark." value={wordmark} onPick={(e) => pickImage(e, setWordmark)} onReset={() => setWordmark(null)} />

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button disabled={!dirty || update.isPending} onClick={save}>
          <Save />
          {update.isPending ? "Saving…" : saved ? "Saved" : "Save branding"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ImagePicker({
  label,
  hint,
  value,
  onPick,
  onReset,
}: {
  label: string;
  hint: string;
  value: string | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-card">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={`${label} preview`} className="size-full object-contain" />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <label className="cursor-pointer">
            <Upload />
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
          </label>
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset to default
          </Button>
        )}
      </div>
    </div>
  );
}

function TypographyCard({ settings }: { settings: NonNullable<ReturnType<typeof useContractStyleSettings>["data"]> | null }) {
  const update = useUpdateContractStyleSettings();
  const [headingFont, setHeadingFont] = useState<"times" | "helvetica" | "courier">((settings?.headingFont as "times" | "helvetica" | "courier") ?? "times");
  const [headingSize, setHeadingSize] = useState(settings?.headingFontSizePt ?? 14);
  const [saved, setSaved] = useState(false);

  const dirty = headingFont !== (settings?.headingFont ?? "times") || headingSize !== (settings?.headingFontSizePt ?? 14);

  async function save() {
    await update.mutateAsync({ headingFont, headingFontSizePt: headingSize });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No style settings row found yet — contact an engineer.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Typography</CardTitle>
        <CardDescription>Applies to titles, section headings, and the signature block in template-based contracts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>Heading font</Label>
          <Select value={headingFont} onValueChange={(v) => setHeadingFont(v as typeof headingFont)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Heading size (pt)</Label>
          <Input type="number" min={9} max={24} step={0.5} value={headingSize} onChange={(e) => setHeadingSize(Number(e.target.value))} className="w-28" />
        </div>

        <div className="rounded-md border bg-muted/30 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live preview</p>
          <p className={FONT_OPTIONS.find((f) => f.value === headingFont)?.sample} style={{ fontSize: `${headingSize}px`, fontWeight: 700 }}>
            THIS AGREEMENT OF SALE
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Paragraph and clause body text keeps the proven legacy typesetting (with correct clause numbering) — only titles, headings, and the signature block follow this setting.
        </p>

        <Button disabled={!dirty || update.isPending} onClick={save}>
          <Save />
          {update.isPending ? "Saving…" : saved ? "Saved" : "Save typography"}
        </Button>
      </CardContent>
    </Card>
  );
}
