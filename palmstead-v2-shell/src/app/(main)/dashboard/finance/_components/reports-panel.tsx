"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { today } from "@/lib/palmstead/format";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useLogDownload } from "@/webnext/shared/hooks/useLogDownload";

import { useCommissionReportConfig } from "./use-finance-commission";
import { type DateRange, useCommissionReport, useExpensesReport, usePaymentsReport, usePayrollReport } from "./use-finance-reports";
import { buildCommissionReportRangePdf, buildExpensesReportPdf, buildPayrollReportPdf, buildPaymentsReportPdf, buildSummaryReportPdf } from "./reports-pdf";

// Real cross-section Report Builder (Part B.10). Section picker + real
// date-range filters, each report pulling real live data for exactly the
// range picked -- no pre-aggregated or sample data. Built on the same
// pdfReport.ts toolkit every other report PDF in this app already uses.
type Section = "summary" | "payments" | "expenses" | "commission" | "payroll";

function money(n: number): string {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function startOfMonth(mk: string): string {
  return `${mk}-01`;
}

function endOfMonth(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: string): DateRange {
  const thisMonth = today().slice(0, 7);
  const [y, m] = thisMonth.split("-").map(Number);
  if (preset === "this-month") return { start: startOfMonth(thisMonth), end: endOfMonth(thisMonth) };
  if (preset === "last-month") {
    const lm = new Date(Date.UTC(y, m - 2, 1));
    const lmKey = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, "0")}`;
    return { start: startOfMonth(lmKey), end: endOfMonth(lmKey) };
  }
  if (preset === "this-quarter") {
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const qStart = `${y}-${String(qStartMonth).padStart(2, "0")}`;
    const qEndDate = new Date(Date.UTC(y, qStartMonth + 2, 0));
    return { start: startOfMonth(qStart), end: qEndDate.toISOString().slice(0, 10) };
  }
  if (preset === "this-year") return { start: `${y}-01-01`, end: `${y}-12-31` };
  return { start: startOfMonth(thisMonth), end: endOfMonth(thisMonth) };
}

export function ReportsPanel() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const { data: reportConfig } = useCommissionReportConfig();
  const [section, setSection] = useState<Section>("summary");
  const [range, setRange] = useState<DateRange>(() => presetRange("this-month"));
  const [downloading, setDownloading] = useState(false);
  const logDownload = useLogDownload();
  const activeSection: Section = isManager ? section : section === "expenses" ? "expenses" : "payments";
  const personalKey = isManager ? undefined : profile?.key;
  const validRange = Boolean(range.start && range.end && range.start <= range.end);

  const needsPayments = validRange && Boolean(isManager || personalKey) && (activeSection === "payments" || activeSection === "summary");
  const needsExpenses = validRange && Boolean(isManager || personalKey) && (activeSection === "expenses" || activeSection === "summary");
  const needsCommission = validRange && isManager && (activeSection === "commission" || activeSection === "summary");
  const needsPayroll = validRange && isManager && (activeSection === "payroll" || activeSection === "summary");

  const paymentsQ = usePaymentsReport(range, needsPayments, personalKey);
  const expensesQ = useExpensesReport(range, needsExpenses, personalKey);
  const commissionQ = useCommissionReport(range, needsCommission);
  const payrollQ = usePayrollReport(range, needsPayroll);

  const loading =
    (needsPayments && paymentsQ.isLoading) || (needsExpenses && expensesQ.isLoading) || (needsCommission && commissionQ.isLoading) || (needsPayroll && payrollQ.isLoading);

  const summary = useMemo(() => {
    const collected = (paymentsQ.data ?? []).filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0);
    const expensesTotal = (expensesQ.data ?? []).filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0);
    const commissionTotal = (commissionQ.data ?? []).reduce((s, r) => s + r.total, 0);
    const payrollTotal = (payrollQ.data ?? []).reduce((s, r) => s + r.net, 0);
    return { collected, expensesTotal, commissionTotal, payrollTotal, net: collected - expensesTotal - commissionTotal - payrollTotal };
  }, [paymentsQ.data, expensesQ.data, commissionQ.data, payrollQ.data]);

  async function download() {
    if (!reportConfig || !validRange || (!isManager && !personalKey)) return;
    setDownloading(true);
    try {
      const fname = `${isManager ? "" : "my_"}${activeSection}_report_${range.start}_${range.end}.pdf`;
      if (activeSection === "payments") {
        const doc = await buildPaymentsReportPdf(range, paymentsQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
        logDownload(fname, 'pdf', doc.output('datauristring'));
      } else if (activeSection === "expenses") {
        const doc = await buildExpensesReportPdf(range, expensesQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
        logDownload(fname, 'pdf', doc.output('datauristring'));
      } else if (activeSection === "commission") {
        const doc = await buildCommissionReportRangePdf(range, commissionQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
        logDownload(fname, 'pdf', doc.output('datauristring'));
      } else if (activeSection === "payroll") {
        const doc = await buildPayrollReportPdf(range, payrollQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
        logDownload(fname, 'pdf', doc.output('datauristring'));
      } else {
        const doc = await buildSummaryReportPdf(range, paymentsQ.data ?? [], expensesQ.data ?? [], commissionQ.data ?? [], payrollQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
        logDownload(fname, 'pdf', doc.output('datauristring'));
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Reports</h2>
        <p className="text-sm text-muted-foreground">
          {isManager ? "Pick a company section and date range, then download its PDF report." : "Review your own payments and expenses for a date range, then download a PDF."}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Section</Label>
              <Select value={activeSection} onValueChange={(v) => setSection(v as Section)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isManager && <SelectItem value="summary">Financial summary</SelectItem>}
                  <SelectItem value="payments">{isManager ? "Payments" : "My payments"}</SelectItem>
                  <SelectItem value="expenses">{isManager ? "Expenses" : "My expenses"}</SelectItem>
                  {isManager && <SelectItem value="commission">Commission</SelectItem>}
                  {isManager && <SelectItem value="payroll">Payroll</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Quick range</Label>
              <Select onValueChange={(v) => setRange(presetRange(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Custom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-month">This month</SelectItem>
                  <SelectItem value="last-month">Last month</SelectItem>
                  <SelectItem value="this-quarter">This quarter</SelectItem>
                  <SelectItem value="this-year">This year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>From</Label>
              <Input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>To</Label>
              <Input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className="w-40" />
            </div>
            <Button onClick={download} disabled={downloading || loading || !validRange || !reportConfig || (!isManager && !personalKey) || paymentsQ.isError || expensesQ.isError || commissionQ.isError || payrollQ.isError}>
              <Download data-icon="inline-start" />
              {downloading ? "Preparing…" : "Download PDF"}
            </Button>
          </div>
          {!validRange && <p role="alert" className="text-sm text-destructive">Choose a valid date range with From on or before To.</p>}
          {(paymentsQ.isError || expensesQ.isError || commissionQ.isError || payrollQ.isError) && (
            <p role="alert" className="text-sm text-destructive">The report data could not be loaded. Check your connection and try again.</p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              {activeSection === "summary" ? "Financial summary" : activeSection[0].toUpperCase() + activeSection.slice(1)} · {range.start} to {range.end}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeSection === "summary" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "Collected", value: summary.collected },
                  { label: "Expenses", value: -summary.expensesTotal },
                  { label: "Commission", value: -summary.commissionTotal },
                  { label: "Payroll", value: -summary.payrollTotal },
                  { label: "Net", value: summary.net },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className="font-medium tabular-nums">{money(item.value)}</div>
                  </div>
                ))}
              </div>
            )}
            {activeSection === "payments" && <p className="text-sm text-muted-foreground">{(paymentsQ.data ?? []).length} payment(s) in range · {money((paymentsQ.data ?? []).filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0))} approved</p>}
            {activeSection === "expenses" && <p className="text-sm text-muted-foreground">{(expensesQ.data ?? []).length} expense(s) in range · {money((expensesQ.data ?? []).filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0))} approved</p>}
            {activeSection === "commission" && <p className="text-sm text-muted-foreground">{(commissionQ.data ?? []).length} agent-month row(s) · {money((commissionQ.data ?? []).reduce((s, r) => s + r.total, 0))} total</p>}
            {activeSection === "payroll" && <p className="text-sm text-muted-foreground">{(payrollQ.data ?? []).length} payee-run row(s) · {money((payrollQ.data ?? []).reduce((s, r) => s + r.net, 0))} total net pay</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
