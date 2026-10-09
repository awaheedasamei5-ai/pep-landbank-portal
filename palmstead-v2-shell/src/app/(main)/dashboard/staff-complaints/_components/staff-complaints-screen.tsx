"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, EyeOff, MessageSquareWarning, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { requireSupabase } from "@/lib/supabase.client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";
import {
  SEVERITIES,
  STATUSES,
  type ComplaintStatus,
  type Severity,
  type StaffComplaint,
  useStaffComplaints,
  useSubmitComplaint,
  useUpdateComplaintStatus,
} from "./use-staff-complaints";

// Real Staff Complaints (OSS item 2, B.5): a workplace grievance channel,
// separate from client complaints. Anonymous means staff_key is
// genuinely null in the row -- Management can't trace it back, and the
// UI says so plainly at submission time per the blueprint's own edge
// case.
const SEVERITY_VARIANT: Record<Severity, "outline" | "default" | "destructive"> = {
  low: "outline",
  medium: "default",
  high: "destructive",
  critical: "destructive",
};

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  submitted: "Submitted",
  investigating: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
};

function useStaffNames() {
  return useQuery({
    queryKey: ["staffNamesForComplaints"],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("profiles").select("agent_key,name");
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.agent_key as string, p.name as string]));
    },
  });
}

function SubmitForm({ onDone }: { onDone: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const submit = useSubmitComplaint(profile?.key);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<Severity>("low");
  const [category, setCategory] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  async function submitForm() {
    if (!subject.trim() || !message.trim()) return;
    await submit.mutateAsync({ subject: subject.trim(), message: message.trim(), severity, category: category || null, isAnonymous });
    setSubject("");
    setMessage("");
    setSeverity("low");
    setCategory("");
    setIsAnonymous(false);
    onDone();
  }

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 pt-6">
        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea placeholder="What's going on?" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} className="max-w-48" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
          Submit anonymously
        </label>
        {isAnonymous && (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <EyeOff className="size-3.5" />
            Anonymous submissions can&apos;t be followed up with you directly -- Management won&apos;t know who sent this.
          </p>
        )}
        <SubmitButton type="button" loading={submit.isPending} onClick={submitForm}>
          Submit
        </SubmitButton>
      </CardContent>
    </Card>
  );
}

function ComplaintCard({ complaint, isManager, staffNames }: { complaint: StaffComplaint; isManager: boolean; staffNames: Map<string, string> }) {
  const updateStatus = useUpdateComplaintStatus(useAuthStore((s) => s.profile?.key));
  const [resolutionNote, setResolutionNote] = useState(complaint.resolutionNote ?? "");

  return (
    <Card className={complaint.severity === "critical" ? "border-destructive/50" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {complaint.subject}
              <Badge variant={SEVERITY_VARIANT[complaint.severity]} className="capitalize">
                {complaint.severity}
              </Badge>
              {complaint.category && <Badge variant="outline">{complaint.category}</Badge>}
            </CardTitle>
            <CardDescription>
              {complaint.isAnonymous ? "Anonymous" : (staffNames.get(complaint.staffKey ?? "") ?? complaint.staffKey ?? "Unknown")} ·{" "}
              {formatDistanceToNow(new Date(complaint.createdAt), { addSuffix: true })}
            </CardDescription>
          </div>
          <Badge variant="outline">{STATUS_LABEL[complaint.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="whitespace-pre-wrap text-sm">{complaint.message}</p>
        {isManager && (
          <div className="grid gap-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={complaint.status} onValueChange={(v) => updateStatus.mutate({ id: complaint.id, status: v as ComplaintStatus, resolutionNote })}>
                <SelectTrigger className="w-40" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Private resolution notes..."
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              onBlur={() => resolutionNote !== (complaint.resolutionNote ?? "") && updateStatus.mutate({ id: complaint.id, status: complaint.status, resolutionNote })}
              rows={2}
            />
          </div>
        )}
        {!isManager && complaint.resolutionNote && !complaint.isAnonymous && (
          <p className="border-t pt-2 text-muted-foreground text-xs">Management note: {complaint.resolutionNote}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function StaffComplaintsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const { data, isLoading } = useStaffComplaints();
  const { data: staffNames } = useStaffNames();
  const [showForm, setShowForm] = useState(false);

  const visible = isManager ? (data ?? []) : (data ?? []).filter((c) => c.staffKey === profile?.key);
  const criticalOpen = visible.filter((c) => c.severity === "critical" && c.status !== "resolved" && c.status !== "closed");

  return (
    <div>
      <PageHeader
        title="Staff Complaints"
        description="A private channel for workplace concerns -- separate from client complaints."
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus />
            Submit a concern
          </Button>
        }
      />

      {showForm && <SubmitForm onDone={() => setShowForm(false)} />}

      {isManager && criticalOpen.length > 0 && (
        <Card className="mb-4 border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-2 pt-6 text-destructive text-sm">
            <AlertTriangle className="size-4" />
            {criticalOpen.length} critical complaint{criticalOpen.length === 1 ? "" : "s"} need attention.
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!isLoading && visible.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <MessageSquareWarning className="size-8" />
            <p>{isManager ? "No complaints submitted." : "You haven't submitted anything -- that's a good sign."}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {visible.map((c) => (
          <ComplaintCard key={c.id} complaint={c} isManager={isManager} staffNames={staffNames ?? new Map()} />
        ))}
      </div>
    </div>
  );
}
