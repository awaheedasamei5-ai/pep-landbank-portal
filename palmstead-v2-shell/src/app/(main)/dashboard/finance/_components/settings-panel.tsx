"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";

import { type FinanceSettings, useFinanceSettings, useRemoveCompanyLogo, useUpdateFinanceSettings, useUploadCompanyLogo } from "./use-finance-settings";

// Real Accounting Settings (Part B.7). Closes two real gaps: the
// company-identity app_config columns (quote_company_name/company_phone/
// etc.) existed in the schema with zero settings UI anywhere in this
// shell, and the new bank-account columns (Part B.3) were only editable
// via direct SQL. Both are what every report PDF in this app (Receipt/
// Commission/Payroll) reads from -- edit here, every PDF picks it up.
function LogoUpload() {
  const { data: settings } = useFinanceSettings();
  const upload = useUploadCompanyLogo();
  const remove = useRemoveCompanyLogo();

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {settings?.receiptLogoImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.receiptLogoImage} alt="Company logo" className="size-full object-contain" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="logo-upload" className="w-fit cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
          {upload.isPending ? "Uploading…" : "Upload logo"}
        </Label>
        <input
          id="logo-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
          }}
        />
        {settings?.receiptLogoImage && (
          <Button variant="ghost" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
            <Trash2 data-icon="inline-start" className="text-destructive" />
            Remove
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Falls back to the default Trulander logo when empty. Used on Receipt, Commission and Payroll PDFs.</p>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const { data: settings, isLoading } = useFinanceSettings();
  const update = useUpdateFinanceSettings();
  const [form, setForm] = useState<FinanceSettings | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (!isManager) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Settings are visible to Management only.</CardContent>
      </Card>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  function field(key: keyof FinanceSettings, label: string, placeholder?: string) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={key}>{label}</Label>
        <Input
          id={key}
          value={(form?.[key] as string) ?? ""}
          placeholder={placeholder}
          onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Settings</h2>
        <p className="text-sm text-muted-foreground">Company identity and bank details used across every Accounting PDF.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company identity</CardTitle>
          <CardDescription>Shown on receipts, quotations, commission and payroll reports.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LogoUpload />
          <Separator />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("companyName", "Company name", "Trulander JSF Limited")}
            {field("companyTin", "Tax ID (TIN)")}
            {field("companyPhone", "Phone")}
            {field("companyEmail", "Email")}
          </div>
          {field("companyAddress", "Company address")}
          {field("footerAddress", "Document footer address")}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receiptThanksText">Receipt thank-you note</Label>
            <Textarea
              id="receiptThanksText"
              value={form.receiptThanksText}
              onChange={(e) => setForm((f) => (f ? { ...f, receiptThanksText: e.target.value } : f))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company bank account</CardTitle>
          <CardDescription>Shown on the Commission and Payroll sign-off sections, so a report can go straight to the bank.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("bankName", "Bank")}
          {field("bankAccountName", "Account name")}
          {field("bankAccountNumber", "Account number")}
          {field("bankBranch", "Branch")}
          {field("bankSwiftCode", "SWIFT / sort code")}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton loading={update.isPending} onClick={() => form && update.mutate(form)}>
          Save settings
        </SubmitButton>
      </div>
    </div>
  );
}
