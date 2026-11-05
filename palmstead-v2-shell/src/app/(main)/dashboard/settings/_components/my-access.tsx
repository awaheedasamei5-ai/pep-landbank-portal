"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSupabase } from "@/lib/supabase.client";

const AREAS = [
  { label: "Operations to-dos", view: "operations.todos.view", manage: "operations.todos.manage" },
  { label: "Operations projects", view: "operations.projects.view", manage: "operations.projects.manage" },
  { label: "Operations meetings", view: "operations.meetings.view", manage: "operations.meetings.manage" },
  { label: "Personal notes", view: "notes.view", manage: "notes.manage" },
  { label: "Memorandum", view: "memorandum.view", manage: "memorandum.manage" },
] as const;

type AccessLevel = "Full" | "View only" | "No access";

export function MyAccess() {
  const [levels, setLevels] = useState<AccessLevel[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const client = requireSupabase();
    void Promise.all(
      AREAS.map(async (area): Promise<AccessLevel> => {
        const [view, manage] = await Promise.all([
          client.rpc("has_permission", { p_key: area.view }),
          client.rpc("has_permission", { p_key: area.manage }),
        ]);
        if (view.error || manage.error) throw new Error("Access could not be loaded.");
        if (!view.data) return "No access";
        return manage.data ? "Full" : "View only";
      }),
    )
      .then((result) => {
        if (!cancelled) setLevels(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>My access</CardTitle>
        <CardDescription>
          Your current access to the areas with individual controls. Management can change these assignments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            Your access could not be loaded. Reload this page to retry.
          </p>
        )}
        {!error && !levels && (
          <p role="status" className="text-muted-foreground text-sm">
            Checking your access…
          </p>
        )}
        {!error && levels && (
          <ul className="flex flex-col gap-3">
            {AREAS.map((area, index) => (
              <li
                key={area.view}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
              >
                <span className="min-w-0 font-medium text-sm">{area.label}</span>
                <Badge variant={levels[index] === "No access" ? "outline" : "secondary"}>{levels[index]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
