"use client";

import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { BellRing, Check } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

const CHOICES = [
  { value: "0", label: "When the task starts" },
  { value: "15", label: "15 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
] as const;

export function MyTaskReminderPreference() {
  const profile = useAuthStore((state) => state.profile);
  const [draft, setDraft] = useState("0");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const preference = useQuery({
    queryKey: ["myOpTaskPushPreference", profile?.key],
    enabled: Boolean(profile?.active && profile.key),
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc("get_my_op_task_push_preference");
      if (error) throw error;
      return Number(data);
    },
  });

  useEffect(() => {
    if (preference.data !== undefined) setDraft(String(preference.data));
  }, [preference.data]);

  async function save() {
    if (!profile?.active || !profile.key || saving || preference.data === undefined) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { data, error } = await requireSupabase().rpc("set_my_op_task_push_preference", {
        p_minutes: Number(draft),
      });
      if (error) throw error;
      if (Number(data) !== Number(draft)) throw new Error("The saved reminder time did not match your choice.");
      const refreshed = await preference.refetch();
      if (refreshed.isError) throw new Error("Saved, but could not refresh your reminder setting. Reload this page.");
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save your reminder time. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing aria-hidden="true" />
          Task device reminders
        </CardTitle>
        <CardDescription>
          Choose when this account's device alert is queued for a timed task. This does not change company SMS or
          missed-task reminders. You still need to enable reminders on a device in My Schedule.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {preference.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {preference.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load your reminder time</AlertTitle>
            <AlertDescription>Check your connection and refresh the page.</AlertDescription>
          </Alert>
        ) : null}
        {preference.data !== undefined ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-device-lead-time">Alert me</FieldLabel>
              <Select
                value={draft}
                onValueChange={(value) => {
                  setDraft(value);
                  setSaved(false);
                  setSaveError(null);
                }}
                disabled={saving}
              >
                <SelectTrigger id="task-device-lead-time" className="w-full max-w-sm">
                  <SelectValue placeholder="Choose a reminder time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CHOICES.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>Changes retime waiting device alerts for your future tasks.</FieldDescription>
            </Field>
          </FieldGroup>
        ) : null}
        {saveError ? (
          <p role="alert" className="text-destructive text-sm">
            {saveError}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="flex items-center gap-2 text-muted-foreground text-sm">
            <Check aria-hidden="true" /> Reminder time saved.
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || preference.data === undefined || Number(draft) === preference.data}
          >
            {saving ? "Saving…" : "Save reminder time"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
