"use client";

import { useEffect, useState } from "react";

import { Eye, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  friendlyError,
  renderTemplatePreview,
  usePreviewAiTemplate,
  useSaveSmsTemplate,
  useSmsTemplates,
} from "./use-outgoing-sms";

function TemplateCard({ templateId }: { templateId: string }) {
  const templates = useSmsTemplates();
  const template = (templates.data ?? []).find((t) => t.id === templateId);
  const save = useSaveSmsTemplate();
  const previewAi = usePreviewAiTemplate();
  const [body, setBody] = useState(template?.body_template ?? "");
  const [prompt, setPrompt] = useState(template?.ai_system_prompt ?? "");
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setBody(template?.body_template ?? "");
    setPrompt(template?.ai_system_prompt ?? "");
  }, [template?.body_template, template?.ai_system_prompt]);

  if (!template) return null;
  const isAi = template.ai_system_prompt !== null || template.body_template === null;
  const dirty = (template.body_template ?? "") !== body || (template.ai_system_prompt ?? "") !== prompt;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {template.label}
          {isAi && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-600 text-xs dark:text-violet-400">
              <Sparkles className="size-3" /> AI-drafted
            </span>
          )}
        </CardTitle>
        <CardDescription>{template.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!isAi && (
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Message text..." />
        )}
        {isAi && (
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder="AI drafting instructions..."
          />
        )}
        {preview !== null && (
          <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm">
            <p className="mb-1 font-medium text-muted-foreground text-xs">
              Preview with sample data (never sent):
            </p>
            <p className="whitespace-pre-wrap">{preview}</p>
          </div>
        )}
        {previewError && <p className="text-destructive text-sm">{previewError}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {template.updated_by ? `Last edited by ${template.updated_by}` : "Never edited -- showing the real default"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={previewAi.isPending}
              onClick={async () => {
                setPreviewError(null);
                if (isAi) {
                  try {
                    const message = await previewAi.mutateAsync(template.kind);
                    setPreview(message);
                  } catch (e) {
                    setPreviewError(friendlyError(e));
                  }
                } else {
                  setPreview(renderTemplatePreview(body || template.body_template || ""));
                }
              }}
            >
              <Eye data-icon="inline-start" /> {previewAi.isPending ? "Drafting..." : "Preview"}
            </Button>
            <SubmitButton
              size="sm"
              loading={save.isPending}
              disabled={!dirty}
              onClick={async () => {
                await save.mutateAsync({
                  id: template.id,
                  body_template: isAi ? null : body,
                  ai_system_prompt: isAi ? prompt : null,
                });
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
            >
              {saved ? "Saved" : "Save"}
            </SubmitButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TemplatesPanel() {
  const templates = useSmsTemplates();

  if (templates.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }
  if (templates.error) {
    return <p className="text-destructive text-sm">{friendlyError(templates.error)}</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(templates.data ?? []).map((t) => (
        <TemplateCard key={t.id} templateId={t.id} />
      ))}
    </div>
  );
}
