"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { useCanFulfilContracts } from "../hooks/useContractRequests";
import { useContractTemplates, useContractTemplateVersions, useCreateContractTemplate, useCreateContractTemplateVersion } from "../hooks/useContractTemplates";
import type { ContractTemplate, ContractTemplateVersionStatus } from "../../../types/domain";

const STATUS_LABEL: Record<ContractTemplateVersionStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  archived: "Archived",
};

const STATUS_VARIANT: Record<ContractTemplateVersionStatus, "outline" | "secondary" | "destructive"> = {
  draft: "outline",
  in_review: "secondary",
  published: "secondary",
  archived: "outline",
};

// CONTRACT_OF_SALE_BLUEPRINT.md §6.1 -- colored thumbnail-card grid,
// converged from PandaDoc's real template library and Syncfusion's
// Document Template Studio Dashboard.jsx (both real sources studied for
// the blueprint). Native shadcn rebuild of web-next's TemplateStudioScreen.
export function TemplateStudioScreen() {
  const canManage = useCanFulfilContracts();
  const router = useRouter();
  const { data: templates, isLoading } = useContractTemplates();
  const createTemplate = useCreateContractTemplate();
  const createVersion = useCreateContractTemplateVersion();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  if (!canManage) {
    return <PageHeader title="Templates" description="You don't have access to this. Ask a manager if you need it." />;
  }

  async function submitNew() {
    if (!name.trim()) return;
    const template = await createTemplate.mutateAsync({ name: name.trim() });
    await createVersion.mutateAsync({ templateId: template.id, versionNumber: 1 });
    setName("");
    setCreating(false);
    router.push(`/dashboard/contract-of-sale/templates/${template.id}`);
  }

  return (
    <div>
      <PageHeader title="Templates" description="Template Studio — draft, version, and publish the Contract of Sale document." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {creating ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col gap-3 pt-6">
              <Input autoFocus placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitNew()} />
              <div className="flex gap-2">
                <Button size="sm" disabled={createTemplate.isPending || !name.trim()} onClick={submitNew}>
                  {createTemplate.isPending ? "Creating…" : "Create"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="group">
            <Card className="h-full border-dashed transition-colors group-hover:border-primary/50">
              <CardContent className="flex h-full min-h-32 flex-col items-center justify-center gap-2 pt-6 text-muted-foreground group-hover:text-primary">
                <Plus className="size-6" />
                <span className="text-sm font-medium">New template</span>
              </CardContent>
            </Card>
          </button>
        )}

        {isLoading && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">Loading…</CardContent>
          </Card>
        )}
        {!isLoading && (templates ?? []).length === 0 && !creating && (
          <Card className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">No contract templates yet — create one to get started.</CardContent>
          </Card>
        )}

        {templates?.map((t) => (
          <TemplateCard key={t.id} template={t} onOpen={() => router.push(`/dashboard/contract-of-sale/templates/${t.id}`)} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template, onOpen }: { template: ContractTemplate; onOpen: () => void }) {
  const { data: versions } = useContractTemplateVersions(template.id);
  const published = versions?.find((v) => v.status === "published");
  const latest = versions?.[0] ?? null;
  const pillStatus: ContractTemplateVersionStatus | "none" = published ? "published" : (latest?.status ?? "none");

  return (
    <button type="button" onClick={onOpen} className="group text-left">
      <Card className="h-full overflow-hidden transition-colors group-hover:border-primary/50">
        <div className="h-1.5 bg-primary" />
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Layers className="size-4" />
            </span>
            {pillStatus === "none" ? (
              <Badge variant="outline">No published version</Badge>
            ) : (
              <Badge variant={STATUS_VARIANT[pillStatus]}>{STATUS_LABEL[pillStatus]}</Badge>
            )}
          </div>
          <CardTitle className="mt-2">{template.name}</CardTitle>
        </CardHeader>
        {latest && <CardContent className="font-mono text-xs text-muted-foreground">v{latest.versionNumber} · updated {latest.createdAt.slice(0, 10)}</CardContent>}
      </Card>
    </button>
  );
}
