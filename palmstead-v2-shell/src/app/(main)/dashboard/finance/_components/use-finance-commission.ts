"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Commission (Finance app, Part B.4 -- docs/plans/04-finance-app-plan.md).
// No new math: get_commission_breakdown() is the exact formula already
// running live in run_monthly_commission_check() (confirmed via
// pg_get_functiondef before this was written), just parameterized by
// month. The RPC itself restricts a non-manager caller to their own
// agent_key server-side (v_restrict_key in its own body) -- there is no
// separate "staff mode" query here, the same call just comes back scoped.
export interface CommissionRow {
  agentKey: string;
  agentName: string;
  personal: number;
  poolShare: number;
  total: number;
  isPoolEligible: boolean;
  poolTotal: number;
  eligibleCount: number;
}

type RawRow = {
  agent_key: string;
  agent_name: string;
  personal: number;
  pool_share: number;
  total: number;
  is_pool_eligible: boolean;
  pool_total: number;
  eligible_count: number;
};

export function useCommissionBreakdown(month: string) {
  return useQuery({
    queryKey: ["commission-breakdown", month],
    queryFn: async (): Promise<CommissionRow[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("get_commission_breakdown", { p_month: month, p_agent_key: null });
      if (error) throw error;
      return ((data ?? []) as RawRow[]).map((r) => ({
        agentKey: r.agent_key,
        agentName: r.agent_name,
        personal: Number(r.personal),
        poolShare: Number(r.pool_share),
        total: Number(r.total),
        isPoolEligible: r.is_pool_eligible,
        poolTotal: Number(r.pool_total),
        eligibleCount: r.eligible_count,
      }));
    },
  });
}

export interface CommissionReportConfig {
  companyName: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  bankSwiftCode: string;
  logoImage: string | null;
}

// Real company bank-account details for the Commission report's sign-off
// section -- "so it can be taken to the bank for payment," per the user's
// own words. Editable via Finance Settings (Part B.7, now real -- see
// use-finance-settings.ts); blank fields render as "—" on the PDF rather
// than blocking the report, same graceful-empty pattern already used for
// company_phone/email/tin elsewhere. logoImage is a real uploaded
// company logo (Settings), checked before the bundled
// /trulander-logo.png fallback every report PDF uses.
export function useCommissionReportConfig() {
  return useQuery({
    queryKey: ["commission-report-config"],
    queryFn: async (): Promise<CommissionReportConfig> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("app_config")
        .select("quote_company_name,company_bank_name,company_bank_account_name,company_bank_account_number,company_bank_branch,company_bank_swift_code,receipt_logo_image")
        .limit(1)
        .single();
      if (error) throw error;
      const row = data as {
        quote_company_name: string | null;
        company_bank_name: string | null;
        company_bank_account_name: string | null;
        company_bank_account_number: string | null;
        company_bank_branch: string | null;
        company_bank_swift_code: string | null;
        receipt_logo_image: string | null;
      };
      return {
        companyName: row.quote_company_name ?? "Palmstead",
        bankName: row.company_bank_name ?? "",
        bankAccountName: row.company_bank_account_name ?? "",
        bankAccountNumber: row.company_bank_account_number ?? "",
        bankBranch: row.company_bank_branch ?? "",
        logoImage: row.receipt_logo_image,
        bankSwiftCode: row.company_bank_swift_code ?? "",
      };
    },
  });
}

export function useRaiseCommissionConcern(callerKey: string | undefined, callerName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { month: string; total: number; note: string }) => {
      const sb = requireSupabase();
      const body = `${callerName ?? "A staff member"} is raising a concern about their ${input.month} commission (currently showing GHS ${input.total.toLocaleString("en-GH")}): ${input.note}`;
      const { error } = await sb.from("messages").insert({ sender_key: callerKey ?? null, sender_name: callerName ?? null, recipient_key: "manager", body });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });
}
