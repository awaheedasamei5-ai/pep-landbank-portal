"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, History, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { requireSupabase } from "@/lib/supabase.client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";
import {
  type AttendanceLogRow,
  type Correction,
  useApproveCorrection,
  useAttendanceCorrections,
  useMyRecentAttendance,
  useRejectCorrection,
  useSubmitCorrection,
} from "./use-attendance-corrections";

// Real Attendance Corrections (OSS item 2, B.7): staff dispute a past
// clock-in/out value; Management sees original vs proposed side by
// side and the approval actually writes the real attendance_log row.
const STATUS_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  submitted: "outline",
  approved: "default",
  rejected: "destructive",
  applied: "default",
};

function fmtTime(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function RequestDialog({ log, staffKey }: { log: AttendanceLogRow; staffKey: string | undefined }) {
  const submit = useSubmitCorrection(staffKey);
  const [field, setField] = useState<"sign_in_at" | "sign_out_at">("sign_in_at");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  async function submitForm() {
    if (!time.trim() || !reason.trim()) return;
    const original = field === "sign_in_at" ? log.signInAt : log.signOutAt;
    const proposed = new Date(`${log.workDate}T${time}:00`).toISOString();
    await submit.mutateAsync({ attendanceLogId: log.id, field, originalValue: original, proposedValue: proposed, reason: reason.trim() });
    setTime("");
    setReason("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Request correction
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct {log.workDate}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={field} onValueChange={(v) => setField(v as typeof field)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sign_in_at">Clock-in ({fmtTime(log.signInAt)})</SelectItem>
              <SelectItem value="sign_out_at">Clock-out ({fmtTime(log.signOutAt)})</SelectItem>
            </SelectContent>
          </Select>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
          <Textarea placeholder="Why was this wrong?" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <SubmitButton type="button" loading={submit.isPending} onClick={submitForm}>
            Submit request
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StaffHistoryTab() {
  const profile = useAuthStore((s) => s.profile);
  const { data: logs, isLoading } = useMyRecentAttendance(profile?.key);
  const { data: corrections } = useAttendanceCorrections(false, profile?.key);

  const correctionsByLog = new Map<string, Correction[]>();
  for (const c of corrections ?? []) {
    const list = correctionsByLog.get(c.attendanceLogId) ?? [];
    list.push(c);
    correctionsByLog.set(c.attendanceLogId, list);
  }

  return (
    <Card>
      <CardContent className="grid gap-2 pt-6">
        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (logs?.length ?? 0) === 0 && <p className="text-muted-foreground text-sm">No attendance records yet.</p>}
        {logs?.map((log) => {
          const pending = correctionsByLog.get(log.id)?.find((c) => c.status === "submitted");
          return (
            <div key={log.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
              <div>
                <p className="font-medium text-sm">{log.workDate}</p>
                <p className="text-muted-foreground text-xs">
                  In {fmtTime(log.signInAt)} · Out {fmtTime(log.signOutAt)}
                </p>
              </div>
              {pending ? (
                <Badge variant="outline">Correction pending</Badge>
              ) : (
                <RequestDialog log={log} staffKey={profile?.key} />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ManagementQueueTab() {
  const profile = useAuthStore((s) => s.profile);
  const { data, isLoading } = useAttendanceCorrections(true, profile?.key);
  const approve = useApproveCorrection(profile?.key);
  const reject = useRejectCorrection(profile?.key);
  const { data: staffNames } = useQuery({
    queryKey: ["staffNamesForCorrections"],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data: rows, error } = await sb.from("profiles").select("agent_key,name");
      if (error) throw error;
      return new Map((rows ?? []).map((p) => [p.agent_key as string, p.name as string]));
    },
  });

  const pending = (data ?? []).filter((c) => c.status === "submitted");
  const decided = (data ?? []).filter((c) => c.status !== "submitted");

  return (
    <div className="grid gap-4">
      {isLoading && <Skeleton className="h-32 w-full" />}
      {!isLoading && pending.length === 0 && <p className="text-muted-foreground text-sm">No pending requests.</p>}
      {pending.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle className="text-base">{staffNames?.get(c.staffKey) ?? c.staffKey}</CardTitle>
            <CardDescription>
              {c.workDate} · {c.field === "sign_in_at" ? "Clock-in" : "Clock-out"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Original: {fmtTime(c.originalValue)}</span>
              <span>→</span>
              <span className="font-medium">Proposed: {fmtTime(c.proposedValue)}</span>
            </div>
            <p className="text-muted-foreground text-sm">{c.reason}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => approve.mutate(c)}>
                <Check />
                Approve &amp; apply
              </Button>
              <Button size="sm" variant="outline" onClick={() => reject.mutate(c.id)}>
                <X />
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {decided.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-semibold text-muted-foreground text-sm">Past decisions</h3>
          {decided.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
              <span>
                {staffNames?.get(c.staffKey) ?? c.staffKey} · {c.workDate}
              </span>
              <Badge variant={STATUS_VARIANT[c.status]} className="capitalize">
                {c.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AttendanceCorrectionsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const [tab, setTab] = useState<"history" | "queue">(isManager ? "queue" : "history");

  return (
    <div>
      <PageHeader
        title="Attendance Corrections"
        description="Dispute a wrong clock-in or clock-out from your attendance history."
        action={
          isManager && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="queue">
                  <History className="size-3.5" />
                  Queue
                </TabsTrigger>
                <TabsTrigger value="history">
                  <Clock className="size-3.5" />
                  My History
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )
        }
      />
      {tab === "queue" && isManager ? <ManagementQueueTab /> : <StaffHistoryTab />}
    </div>
  );
}
