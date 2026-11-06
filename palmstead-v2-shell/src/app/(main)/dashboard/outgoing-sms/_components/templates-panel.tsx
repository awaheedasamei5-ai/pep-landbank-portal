"use client";

import { useEffect, useState } from "react";

import { Sparkles } from "lucide-react";

import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { friendlyError, useSaveSmsTemplate, useSmsTemplates } from "./use-outgoing-sms";

function TemplateCard({ templateId }: { templateId: string }) {
  const templates = useSmsTemplates();
  const template = (templates.data ?? []).find((t) => t.id === templateId);
  const save = useSaveSmsTemplate();
  const [body, setBody] = useState(template?.body_template ?? "");
  const [prompt, setPrompt] = useState(template?.ai_system_prompt ?? "");
  const [saved, setSaved] = useState(false);

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
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {template.updated_by ? `Last edited by ${template.updated_by}` : "Never edited -- showing the real default"}
          </span>
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
