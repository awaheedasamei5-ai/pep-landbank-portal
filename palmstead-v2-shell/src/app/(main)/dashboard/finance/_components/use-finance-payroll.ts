"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Payroll (Accounting app, Part B.8 -- docs/plans/05-accounting-app-blueprint.md).
// Schema/RLS/RPCs verified live via direct SQL simulation before any UI
// was written (including a real bug caught and fixed: generate_payroll_run's
// own date filter compared a component's effective_from against the
// period's START instead of its END, silently excluding every component
// set up during the same month payroll first runs).
export interface PayrollStaff {
  id: string;
  profileKey: string | null;
  name: string;
  roleTitle: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  active: boolean;
}

export interface SalaryComponent {
  id: string;
  payrollStaffId: string;
  componentName: string;
  componentType: "earning" | "deduction";
  amount: number;
  effectiveFrom: string;
}

export interface PayrollRun {
  id: string;
  period: string;
  status: "draft" | "signed_off" | "paid";
  generatedBy: string | null;
  generatedAt: string | null;
  signedOffBy: string | null;
  signedOffAt: string | null;
}

export interface PayrollRunLine {
  id: string;
  payrollRunId: string;
  payrollStaffId: string;
  staffName: string;
  componentName: string;
  componentType: "earning" | "deduction";
  amount: number;
}

function mapStaff(r: {
  id: string;
  profile_key: string | null;
  name: string;
  role_title: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  active: boolean;
}): PayrollStaff {
  return {
    id: r.id,
    profileKey: r.profile_key,
    name: r.name,
    roleTitle: r.role_title,
    bankName: r.bank_name,
    bankAccountName: r.bank_account_name,
    bankAccountNumber: r.bank_account_number,
    active: r.active,
  };
}

export function usePayrollStaff() {
  return useQuery({
    queryKey: ["payroll-staff"],
    queryFn: async (): Promise<PayrollStaff[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("payroll_staff").select("id,profile_key,name,role_title,bank_name,bank_account_name,bank_account_number,active").order("name");
      if (error) throw error;
      return (data ?? []).map(mapStaff);
    },
  });
}

export function useUpsertPayrollStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; profileKey: string | null; name: string; roleTitle: string; bankName: string; bankAccountName: string; bankAccountNumber: string; createdBy: string | undefined }) => {
      const sb = requireSupabase();
      const payload = {
        profile_key: input.profileKey,
        name: input.name,
        role_title: input.roleTitle || null,
        bank_name: input.bankName || null,
        bank_account_name: input.bankAccountName || null,
        bank_account_number: input.bankAccountNumber || null,
      };
      if (input.id) {
        const { error } = await sb.from("payroll_staff").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("payroll_staff").insert({ ...payload, created_by: input.createdBy ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-staff"] }),
  });
}

export function useSetPayrollStaffActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("payroll_staff").update({ active: input.active }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-staff"] }),
  });
}

export function useSalaryComponents(staffId: string | null) {
  return useQuery({
    queryKey: ["payroll-salary-components", staffId],
    enabled: !!staffId,
    queryFn: async (): Promise<SalaryComponent[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("payroll_salary_components")
        .select("id,payroll_staff_id,component_name,component_type,amount,effective_from")
        .eq("payroll_staff_id", staffId as string)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        payrollStaffId: r.payroll_staff_id,
        componentName: r.component_name,
        componentType: r.component_type,
        amount: Number(r.amount),
        effectiveFrom: r.effective_from,
      }));
    },
  });
}

export function useAddSalaryComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { payrollStaffId: string; componentName: string; componentType: "earning" | "deduction"; amount: number }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("payroll_salary_components").insert({
        payroll_staff_id: input.payrollStaffId,
        component_name: input.componentName,
        component_type: input.componentType,
        amount: input.amount,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["payroll-salary-components", vars.payrollStaffId] }),
  });
}

export function useDeleteSalaryComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; payrollStaffId: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("payroll_salary_components").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["payroll-salary-components", vars.payrollStaffId] }),
  });
}

export function usePayrollRuns() {
  return useQuery({
    queryKey: ["payroll-runs"],
    queryFn: async (): Promise<PayrollRun[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("payroll_runs").select("id,period,status,generated_by,generated_at,signed_off_by,signed_off_at").order("period", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        period: r.period,
        status: r.status,
        generatedBy: r.generated_by,
        generatedAt: r.generated_at,
        signedOffBy: r.signed_off_by,
        signedOffAt: r.signed_off_at,
      }));
    },
  });
}

export function usePayrollRunLines(runId: string | null) {
  return useQuery({
    queryKey: ["payroll-run-lines", runId],
    enabled: !!runId,
    queryFn: async (): Promise<PayrollRunLine[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("payroll_run_lines")
        .select("id,payroll_run_id,payroll_staff_id,staff_name,component_name,component_type,amount")
        .eq("payroll_run_id", runId as string)
        .order("staff_name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        payrollRunId: r.payroll_run_id,
        payrollStaffId: r.payroll_staff_id,
        staffName: r.staff_name,
        componentName: r.component_name,
        componentType: r.component_type,
        amount: Number(r.amount),
      }));
    },
  });
}

export function useGeneratePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (period: string) => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("generate_payroll_run", { p_period: period });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-runs"] }),
  });
}

export function useSignOffPayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc("sign_off_payroll_run", { p_run_id: runId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-runs"] }),
  });
}
