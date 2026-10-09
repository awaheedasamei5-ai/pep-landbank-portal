"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Staff Complaints (OSS item 2, B.5) -- a workplace/HR grievance
// channel, genuinely distinct from the real client-facing `complaints`
// table (plot/owner shape, used by Sales desk). Schema field-for-field
// from the real source repo's migration 001.
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const STATUSES = ["submitted", "investigating", "resolved", "closed"] as const;
export type ComplaintStatus = (typeof STATUSES)[number];

export interface StaffComplaint {
  id: string;
  staffKey: string | null;
  isAnonymous: boolean;
  subject: string;
  message: string;
  severity: Severity;
  category: string | null;
  status: ComplaintStatus;
  resolutionNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

async function fetchComplaints(): Promise<StaffComplaint[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("staff_complaints")
    .select("id,staff_key,is_anonymous,subject,message,severity,category,status,resolution_note,reviewed_by,reviewed_at,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    staffKey: c.staff_key,
    isAnonymous: c.is_anonymous,
    subject: c.subject,
    message: c.message,
    severity: c.severity,
    category: c.category,
    status: c.status,
    resolutionNote: c.resolution_note,
    reviewedBy: c.reviewed_by,
    reviewedAt: c.reviewed_at,
    createdAt: c.created_at,
  }));
}

export function useStaffComplaints() {
  return useQuery({ queryKey: ["staffComplaints"], queryFn: fetchComplaints });
}

export function useSubmitComplaint(staffKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { subject: string; message: string; severity: Severity; category: string | null; isAnonymous: boolean }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("staff_complaints").insert({
        subject: data.subject,
        message: data.message,
        severity: data.severity,
        category: data.category,
        is_anonymous: data.isAnonymous,
        staff_key: data.isAnonymous ? null : staffKey,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staffComplaints"] }),
  });
}

export function useUpdateComplaintStatus(reviewedBy: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, resolutionNote }: { id: string; status: ComplaintStatus; resolutionNote?: string }) => {
      const sb = requireSupabase();
      const patch: Record<string, unknown> = { status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() };
      if (resolutionNote !== undefined) patch.resolution_note = resolutionNote;
      const { error } = await sb.from("staff_complaints").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staffComplaints"] }),
  });
}
