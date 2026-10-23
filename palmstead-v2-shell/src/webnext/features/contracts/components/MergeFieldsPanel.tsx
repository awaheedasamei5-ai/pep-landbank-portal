"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useContractFields, useCreateContractField } from "../hooks/useContractTemplates";
import type { ContractSection } from "../../../types/domain";

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const TOKEN_SCAN = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

interface MergeFieldsPanelProps {
  templateId: string;
  content: ContractSection[];
  onInsert: (key: string) => void;
}

// CONTRACT_OF_SALE_BLUEPRINT.md §6.2/§7 -- direct port of the real
// Syncfusion Document Template Studio MergeFieldsPanel.jsx pattern: a
// chip list unioned from three sources (this template's own fields, the
// common/global catalog, and fields already typed in the version's own
// content), click-to-insert-at-caret, and an Add Field dialog with scope
// + validated camelCase name. Native shadcn rebuild of web-next's panel.
export function MergeFieldsPanel({ templateId, content, onInsert }: MergeFieldsPanelProps) {
  const { data: fields } = useContractFields();
  const createField = useCreateContractField();
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<"template" | "common">("template");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const catalogKeys = new Set((fields ?? []).filter((f) => f.scope === "common" || f.templateId === templateId).map((f) => f.key));
  const docKeys = new Set<string>();
  for (const section of content) {
    for (const match of (section.text ?? "").matchAll(TOKEN_SCAN)) docKeys.add(match[1]);
  }
  const allKeys = [...catalogKeys, ...[...docKeys].filter((k) => !catalogKeys.has(k))];

  function openDialog() {
    setAdding(true);
    setScope("template");
    setKey("");
    setError(null);
  }

  async function submit() {
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Field name is required.");
      return;
    }
    if (!KEY_PATTERN.test(trimmed)) {
      setError("Must start with a letter and contain only letters/digits.");
      return;
    }
    try {
      await createField.mutateAsync({ key: trimmed, scope, templateId: scope === "template" ? templateId : null });
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that field.");
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">
        {content.length === 0 ? "Merge fields will appear here when a template is opened." : "Click a field to insert at the caret."}
      </p>

      {allKeys.length === 0 && content.length > 0 && <p className="text-xs text-muted-foreground">No merge fields yet. Use Add field below.</p>}
      <div className="flex flex-wrap gap-1.5">
        {allKeys.map((k) => (
          <button
            key={k}
            type="button"
            title={`Insert {{${k}}}`}
            onClick={() => onInsert(k)}
            className="rounded-full border bg-card px-2.5 py-1 font-mono text-xs transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
          >
            {k}
          </button>
        ))}
      </div>

      {!adding && (
        <Button type="button" variant="outline" size="sm" onClick={openDialog}>
          <Plus />
          Add field
        </Button>
      )}

      {adding && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <Label className="text-xs">Save to</Label>
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as "template" | "common")}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="template" id="scope-template" />
              <Label htmlFor="scope-template" className="text-xs font-normal">This template</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="common" id="scope-common" />
              <Label htmlFor="scope-common" className="text-xs font-normal">Common (all templates)</Label>
            </div>
          </RadioGroup>
          <Input placeholder="e.g. clientLegalName" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={createField.isPending} onClick={submit}>
              {createField.isPending ? "Adding…" : "Add"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
