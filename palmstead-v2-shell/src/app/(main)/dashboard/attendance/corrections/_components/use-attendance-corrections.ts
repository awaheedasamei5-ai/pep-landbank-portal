"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Attendance Corrections (OSS item 2, B.7) -- confirmed before
// building that the real remaining gap is a staff-initiated dispute of
// an already-recorded clock-in/out value (attendance_exceptions and
// attendance_reviews, both from item 1, cover different things -- see
// docs/plans/02-general-staff-portal-plan.md).
export type CorrectionField = "sign_in_at" | "sign_out_at";
export type CorrectionStatus = "submitted" | "approved" | "rejected" | "applied";

export interface AttendanceLogRow {
  id: string;
  workDate: string;
  signInAt: string | null;
  signOutAt: string | null;
}

export interface Correction {
  id: string;
  attendanceLogId: string;
  staffKey: string;
  field: CorrectionField;
  originalValue: string | null;
  proposedValue: string;
  reason: string;
  status: CorrectionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  workDate: string | null;
}

export function useMyRecentAttendance(staffKey: string | undefined) {
  return useQuery({
    queryKey: ["myRecentAttendance", staffKey],
    queryFn: async (): Promise<AttendanceLogRow[]> => {
      if (!staffKey) return [];
      const sb = requireSupabase();
      const { data, error } = await sb.from("attendance_log").select("id,work_date,sign_in_at,sign_out_at").eq("staff_key", staffKey).order("work_date", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, workDate: r.work_date, signInAt: r.sign_in_at, signOutAt: r.sign_out_at }));
    },
    enabled: Boolean(staffKey),
  });
}

async function fetchCorrections(isManager: boolean, staffKey: string | undefined): Promise<Correction[]> {
  const sb = requireSupabase();
  let query = sb
    .from("attendance_corrections")
    .select("id,attendance_log_id,staff_key,field,original_value,proposed_value,reason,status,reviewed_by,reviewed_at,created_at,attendance_log(work_date)")
    .order("created_at", { ascending: false });
  if (!isManager && staffKey) query = query.eq("staff_key", staffKey);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    attendanceLogId: r.attendance_log_id,
    staffKey: r.staff_key,
    field: r.field,
    originalValue: r.original_value,
    proposedValue: r.proposed_value,
    reason: r.reason,
    status: r.status,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    workDate: (r.attendance_log as unknown as { work_date: string }[] | null)?.[0]?.work_date ?? null,
  }));
}

export function useAttendanceCorrections(isManager: boolean, staffKey: string | undefined) {
  return useQuery({ queryKey: ["attendanceCorrections", isManager, staffKey], queryFn: () => fetchCorrections(isManager, staffKey) });
}

export function useSubmitCorrection(staffKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { attendanceLogId: string; field: CorrectionField; originalValue: string | null; proposedValue: string; reason: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("attendance_corrections").insert({
        attendance_log_id: data.attendanceLogId,
        staff_key: staffKey,
        field: data.field,
        original_value: data.originalValue,
        proposed_value: data.proposedValue,
        reason: data.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendanceCorrections"] }),
  });
}

export function useApproveCorrection(reviewedBy: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (correction: Correction) => {
      const sb = requireSupabase();
      // Real distinction preserved: approving a correction actually
      // writes the real attendance_log row (status goes straight to
      // "applied", not a separate approved-but-pending-write limbo --
      // for a 7-person team, a manager approving IS deciding to apply
      // it; there's no payroll-processing lag to model here).
      const { error: logError } = await sb.from("attendance_log").update({ [correction.field]: correction.proposedValue }).eq("id", correction.attendanceLogId);
      if (logError) throw logError;
      const { error } = await sb.from("attendance_corrections").update({ status: "applied", reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() }).eq("id", correction.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendanceCorrections"] });
      qc.invalidateQueries({ queryKey: ["myRecentAttendance"] });
    },
  });
}

export function useRejectCorrection(reviewedBy: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (correctionId: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("attendance_corrections").update({ status: "rejected", reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() }).eq("id", correctionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendanceCorrections"] }),
  });
}
