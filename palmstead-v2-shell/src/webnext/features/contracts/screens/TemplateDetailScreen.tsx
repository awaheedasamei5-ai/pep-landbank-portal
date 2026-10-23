"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowDown, ArrowUp, Eye, ImageIcon, Plus, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "cn";
import {
  useContractTemplates,
  useContractTemplateVersions,
  useCreateContractTemplateVersion,
  useUpdateContractTemplateVersion,
  usePublishContractTemplateVersion,
  useDecideContractApproval,
} from "../hooks/useContractTemplates";
import { useCanFulfilContracts } from "../hooks/useContractRequests";
import { MergeFieldsPanel } from "../components/MergeFieldsPanel";
import { ClauseLibraryPanel } from "../components/ClauseLibraryPanel";
import type { ContractSection, ContractSectionKind, ContractTemplateVersion, ContractTemplateVersionStatus } from "../../../types/domain";

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
const SECTION_KIND_LABEL: Record<ContractSectionKind, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  clause: "Clause",
  signature_block: "Signature block",
  image: "Image",
  footer: "Footer",
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// CONTRACT_OF_SALE_BLUEPRINT.md §6.2 -- the page editor + draft/review/
// publish state machine + the Merge Fields/Clause Library right rail.
// Native shadcn rebuild of web-next's TemplateDetailScreen. Scope note,
// honest: click-to-insert-at-caret is real and fully functional; drag-
// and-drop is not built. "A different manager must approve" is a UX gap
// (RLS still requires manager/elizabeth either way, so not a security one).
export function TemplateDetailScreen() {
  const params = useParams<{ id: string }>();
  const templateId = params.id;
  const router = useRouter();
  const canManage = useCanFulfilContracts();
  const { data: templates } = useContractTemplates();
  const { data: versions } = useContractTemplateVersions(templateId ?? "");
  const createVersion = useCreateContractTemplateVersion();
  const updateVersion = useUpdateContractTemplateVersion();
  const publish = usePublishContractTemplateVersion();
  const decideApproval = useDecideContractApproval();

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [content, setContent] = useState<ContractSection[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const template = templates?.find((t) => t.id === templateId);
  const latest = versions?.[0] ?? null;
  const selectedVersion = versions?.find((v) => v.id === selectedVersionId) ?? latest;
  const isLatestDraft = !!selectedVersion && selectedVersion.id === latest?.id && selectedVersion.status === "draft";

  useEffect(() => {
    if (selectedVersion) setContent(selectedVersion.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion?.id]);

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to this. Ask a manager if you need it.</p>;
  }
  if (!templateId || (templates && !template)) {
    return <p className="text-sm text-muted-foreground">Template not found.</p>;
  }
  if (!template || !versions) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  function addSection(kind: ContractSectionKind) {
    setContent((c) => [...c, { id: newId(), kind, text: kind === "signature_block" ? undefined : "" }]);
  }
  function updateSectionText(id: string, text: string) {
    setContent((c) => c.map((s) => (s.id === id ? { ...s, text } : s)));
  }
  function removeSection(id: string) {
    setContent((c) => c.filter((s) => s.id !== id));
  }
  function moveSection(id: string, dir: -1 | 1) {
    setContent((c) => {
      const idx = c.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= c.length) return c;
      const next = [...c];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function insertToken(key: string) {
    const token = `{{${key}}}`;
    const el = activeSectionId ? textareaRefs.current[activeSectionId] : null;
    if (activeSectionId && el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const before = el.value.slice(0, start);
      const after = el.value.slice(end);
      updateSectionText(activeSectionId, `${before}${token}${after}`);
      requestAnimationFrame(() => {
        const node = textareaRefs.current[activeSectionId];
        if (node) {
          node.focus();
          const caret = start + token.length;
          node.setSelectionRange(caret, caret);
        }
      });
    } else {
      setContent((c) => [...c, { id: newId(), kind: "paragraph", text: token }]);
    }
  }

  function insertClause(clauseId: string, body: string) {
    setContent((c) => [...c, { id: newId(), kind: "clause", clauseId, text: body }]);
  }

  async function saveDraft() {
    if (!selectedVersion) return;
    await updateVersion.mutateAsync({ id: selectedVersion.id, patch: { content } });
  }
  async function submitForReview() {
    if (!selectedVersion) return;
    await updateVersion.mutateAsync({ id: selectedVersion.id, patch: { content, status: "in_review" } });
  }
  async function approve() {
    if (!selectedVersion) return;
    await decideApproval.mutateAsync({ templateVersionId: selectedVersion.id, status: "approved", reason: null });
    await publish.mutateAsync(selectedVersion.id);
  }
  async function reject() {
    if (!selectedVersion || !rejectReason.trim()) return;
    await decideApproval.mutateAsync({ templateVersionId: selectedVersion.id, status: "rejected", reason: rejectReason.trim() });
    await updateVersion.mutateAsync({ id: selectedVersion.id, patch: { status: "draft" } });
    setRejecting(false);
    setRejectReason("");
  }
  async function duplicateAsNewDraft() {
    if (!selectedVersion || !latest || !templateId) return;
    const created = await createVersion.mutateAsync({ templateId, versionNumber: latest.versionNumber + 1 });
    await updateVersion.mutateAsync({ id: created.id, patch: { content: selectedVersion.content } });
    setSelectedVersionId(created.id);
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/contract-of-sale/templates">
          <ArrowLeft />
          All templates
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
          {selectedVersion && <Badge variant={STATUS_VARIANT[selectedVersion.status]}>{STATUS_LABEL[selectedVersion.status]}</Badge>}
        </div>

        {selectedVersion && isLatestDraft && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/contract-of-sale/templates/${templateId}/preview?version=${selectedVersion.id}`)}>
              <Eye />
              Preview
            </Button>
            <Button variant="outline" size="sm" disabled={updateVersion.isPending} onClick={saveDraft}>
              {updateVersion.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button size="sm" disabled={updateVersion.isPending} onClick={submitForReview}>
              Submit for review
            </Button>
          </div>
        )}
        {selectedVersion && selectedVersion.status === "in_review" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/contract-of-sale/templates/${templateId}/preview?version=${selectedVersion.id}`)}>
              <Eye />
              Preview
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setRejecting((v) => !v)}>
              Reject
            </Button>
            <Button size="sm" disabled={decideApproval.isPending || publish.isPending} onClick={approve}>
              {decideApproval.isPending || publish.isPending ? "Publishing…" : "Approve"}
            </Button>
          </div>
        )}
        {selectedVersion && !isLatestDraft && selectedVersion.status !== "in_review" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/contract-of-sale/templates/${templateId}/preview?version=${selectedVersion.id}`)}>
              <Eye />
              Preview
            </Button>
            <Button variant="outline" size="sm" onClick={duplicateAsNewDraft} disabled={createVersion.isPending}>
              Duplicate as new draft
            </Button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-dashed bg-muted/40 p-3">
          <Input placeholder="Reason for rejecting" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="flex-1" />
          <Button variant="destructive" size="sm" disabled={!rejectReason.trim() || decideApproval.isPending} onClick={reject}>
            Confirm reject
          </Button>
        </div>
      )}

      {selectedVersion && !isLatestDraft && (
        <div className="mb-4 rounded-md border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
          Viewing v{selectedVersion.versionNumber} (read-only) — {STATUS_LABEL[selectedVersion.status]}. Create a new version to edit.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[200px_1fr] xl:grid-cols-[200px_1fr_280px]">
        <div className="flex flex-col gap-2 lg:order-1">
          {versions.map((v) => (
            <VersionRow key={v.id} version={v} active={v.id === selectedVersion?.id} onSelect={() => setSelectedVersionId(v.id)} />
          ))}
        </div>

        <div className="flex flex-col gap-3 lg:order-2">
          {content.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No sections yet — add one below.</p>}
          {content.map((section, i) => (
            <SectionCard
              key={section.id}
              section={section}
              editable={isLatestDraft}
              canMoveUp={i > 0}
              canMoveDown={i < content.length - 1}
              onTextChange={(t) => updateSectionText(section.id, t)}
              onRemove={() => removeSection(section.id)}
              onMoveUp={() => moveSection(section.id, -1)}
              onMoveDown={() => moveSection(section.id, 1)}
              onFocus={() => setActiveSectionId(section.id)}
              registerRef={(el) => {
                textareaRefs.current[section.id] = el;
              }}
            />
          ))}

          {isLatestDraft && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {(["heading", "paragraph", "clause", "image", "footer", "signature_block"] as ContractSectionKind[]).map((k) => (
                <Button key={k} type="button" variant="outline" size="sm" onClick={() => addSection(k)}>
                  <Plus />
                  {SECTION_KIND_LABEL[k]}
                </Button>
              ))}
            </div>
          )}

          {!isLatestDraft && <p className="text-sm text-muted-foreground">This version is read-only. Duplicate it as a new draft to edit.</p>}
        </div>

        {isLatestDraft && (
          <div className="rounded-md border lg:order-3">
            <Tabs defaultValue="fields">
              <TabsList className="w-full">
                <TabsTrigger value="fields" className="flex-1">
                  <Type className="size-3.5" />
                  Merge Fields
                </TabsTrigger>
                <TabsTrigger value="clauses" className="flex-1">
                  Clause Library
                </TabsTrigger>
              </TabsList>
              <TabsContent value="fields">
                <MergeFieldsPanel templateId={templateId} content={content} onInsert={insertToken} />
              </TabsContent>
              <TabsContent value="clauses">
                <ClauseLibraryPanel onInsert={insertClause} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

function VersionRow({ version, active, onSelect }: { version: ContractTemplateVersion; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn("rounded-md border p-2.5 text-left transition-colors", active ? "border-primary bg-primary/5" : "hover:border-primary/50")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold">v{version.versionNumber}</span>
        <Badge variant={STATUS_VARIANT[version.status]} className="text-[10px]">
          {STATUS_LABEL[version.status]}
        </Badge>
      </div>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">
        {version.createdAt.slice(0, 10)} by {version.createdByName}
      </span>
    </button>
  );
}

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

function SectionCard({
  section,
  editable,
  canMoveUp,
  canMoveDown,
  onTextChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onFocus,
  registerRef,
}: {
  section: ContractSection;
  editable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onTextChange: (text: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onFocus: () => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{SECTION_KIND_LABEL[section.kind]}</span>
        {editable && (
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="icon-sm" disabled={!canMoveUp} onClick={onMoveUp} aria-label="Move up">
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" disabled={!canMoveDown} onClick={onMoveDown} aria-label="Move down">
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove section">
              <X />
            </Button>
          </div>
        )}
      </div>

      {section.kind === "signature_block" ? (
        <p className="text-sm italic text-muted-foreground">Signed and delivered — Sign / Name / Designation (not editable)</p>
      ) : section.kind === "image" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImageIcon className="size-4" />
          {section.imageRef ? `Image: ${section.imageRef}` : "No image set yet"}
        </p>
      ) : editable ? (
        <Textarea ref={registerRef} value={section.text ?? ""} onChange={(e) => onTextChange(e.target.value)} onFocus={onFocus} rows={section.kind === "heading" ? 1 : 3} />
      ) : (
        <div className="text-sm leading-relaxed">{renderWithTokens(section.text ?? "")}</div>
      )}
    </div>
  );
}
