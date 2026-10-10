"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";
import { resizeImageToDataUri } from "@/webnext/shared/lib/image";

// Real Accounting Settings (Part B.7 -- docs/plans/05-accounting-app-blueprint.md).
// Writes directly to the existing app_config row (RLS already allows
// manager UPDATE, confirmed live before this was built -- no new policy
// needed). Covers two real, previously-unreachable-from-the-UI gaps:
// company identity fields (quote_company_name/company_phone/etc. existed
// in the schema with zero settings surface anywhere in this shell) and
// the new bank-account columns (Part B.3), plus a real company logo
// upload that Commission/Payroll/Receipt PDFs now check before falling
// back to the bundled /trulander-logo.png.
export interface FinanceSettings {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyTin: string;
  companyAddress: string;
  footerAddress: string;
  receiptThanksText: string;
  receiptLogoImage: string | null;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  bankSwiftCode: string;
}

const SETTINGS_COLUMNS =
  "quote_company_name,company_phone,company_email,company_tin,company_address,quote_footer_address,receipt_thanks_text,receipt_logo_image,company_bank_name,company_bank_account_name,company_bank_account_number,company_bank_branch,company_bank_swift_code";

type RawSettings = {
  quote_company_name: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_tin: string | null;
  company_address: string | null;
  quote_footer_address: string | null;
  receipt_thanks_text: string | null;
  receipt_logo_image: string | null;
  company_bank_name: string | null;
  company_bank_account_name: string | null;
  company_bank_account_number: string | null;
  company_bank_branch: string | null;
  company_bank_swift_code: string | null;
};

function mapSettings(row: RawSettings): FinanceSettings {
  return {
    companyName: row.quote_company_name ?? "",
    companyPhone: row.company_phone ?? "",
    companyEmail: row.company_email ?? "",
    companyTin: row.company_tin ?? "",
    companyAddress: row.company_address ?? "",
    footerAddress: row.quote_footer_address ?? "",
    receiptThanksText: row.receipt_thanks_text ?? "",
    receiptLogoImage: row.receipt_logo_image,
    bankName: row.company_bank_name ?? "",
    bankAccountName: row.company_bank_account_name ?? "",
    bankAccountNumber: row.company_bank_account_number ?? "",
    bankBranch: row.company_bank_branch ?? "",
    bankSwiftCode: row.company_bank_swift_code ?? "",
  };
}

export function useFinanceSettings() {
  return useQuery({
    queryKey: ["finance-settings"],
    queryFn: async (): Promise<FinanceSettings> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("app_config").select(SETTINGS_COLUMNS).eq("id", 1).single();
      if (error) throw error;
      return mapSettings(data as RawSettings);
    },
  });
}

export function useUpdateFinanceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FinanceSettings) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from("app_config")
        .update({
          quote_company_name: input.companyName || null,
          company_phone: input.companyPhone || null,
          company_email: input.companyEmail || null,
          company_tin: input.companyTin || null,
          company_address: input.companyAddress || null,
          quote_footer_address: input.footerAddress || null,
          receipt_thanks_text: input.receiptThanksText || null,
          company_bank_name: input.bankName || null,
          company_bank_account_name: input.bankAccountName || null,
          company_bank_account_number: input.bankAccountNumber || null,
          company_bank_branch: input.bankBranch || null,
          company_bank_swift_code: input.bankSwiftCode || null,
        })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-settings"] });
      qc.invalidateQueries({ queryKey: ["commission-report-config"] });
    },
  });
}

export function useUploadCompanyLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const dataUri = await resizeImageToDataUri(file, 300, 300, 0.9);
      const sb = requireSupabase();
      const { error } = await sb.from("app_config").update({ receipt_logo_image: dataUri }).eq("id", 1);
      if (error) throw error;
      return dataUri;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-settings"] });
      qc.invalidateQueries({ queryKey: ["commission-report-config"] });
    },
  });
}

export function useRemoveCompanyLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const sb = requireSupabase();
      const { error } = await sb.from("app_config").update({ receipt_logo_image: null }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-settings"] });
      qc.invalidateQueries({ queryKey: ["commission-report-config"] });
    },
  });
}
