"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { today } from "@/lib/palmstead/format";
import { useAuthStore } from "@/stores/auth/auth-store";

import { useCommissionReportConfig } from "./use-finance-commission";
import { type DateRange, useCommissionReport, useExpensesReport, usePaymentsReport, usePayrollReport } from "./use-finance-reports";
import { buildCommissionReportRangePdf, buildExpensesReportPdf, buildPayrollReportPdf, buildPaymentsReportPdf, buildSummaryReportPdf } from "./reports-pdf";

// Real cross-section Report Builder (Part B.10). Section picker + real
// date-range filters, each report pulling real live data for exactly the
// range picked -- no pre-aggregated or sample data. Built on the same
// pdfReport.ts toolkit every other report PDF in this app already uses.
type Section = "summary" | "payments" | "expenses" | "commission" | "payroll";
const managementSections: Section[] = ["summary", "payments", "expenses", "commission", "payroll"];
const staffSections: Section[] = ["payments", "expenses", "commission"];

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
  const { data: reportConfig, error: reportConfigError } = useCommissionReportConfig(isManager);
  const [section, setSection] = useState<Section>("summary");
  const activeSection = isManager || staffSections.includes(section) ? section : "payments";
  const availableSections = isManager ? managementSections : staffSections;
  const [range, setRange] = useState<DateRange>(() => presetRange("this-month"));
  const [downloading, setDownloading] = useState(false);

  const needsPayments = activeSection === "payments" || activeSection === "summary";
  const needsExpenses = activeSection === "expenses" || activeSection === "summary";
  const needsCommission = activeSection === "commission" || activeSection === "summary";
  const needsPayroll = isManager && (activeSection === "payroll" || activeSection === "summary");

  const paymentsQ = usePaymentsReport(range, needsPayments);
  const expensesQ = useExpensesReport(range, needsExpenses);
  const commissionQ = useCommissionReport(range, needsCommission);
  const payrollQ = usePayrollReport(range, needsPayroll);

  const loading =
    (needsPayments && paymentsQ.isLoading) ||
    (needsExpenses && expensesQ.isLoading) ||
    (needsCommission && commissionQ.isLoading) ||
    (needsPayroll && payrollQ.isLoading);
  const reportError =
    reportConfigError ||
    (needsPayments && paymentsQ.error) ||
    (needsExpenses && expensesQ.error) ||
    (needsCommission && commissionQ.error) ||
    (needsPayroll && payrollQ.error);

  const summary = useMemo(() => {
    const collected = (paymentsQ.data ?? []).filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0);
    const expensesTotal = (expensesQ.data ?? []).filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0);
    const commissionTotal = (commissionQ.data ?? []).reduce((s, r) => s + r.total, 0);
    const payrollTotal = (payrollQ.data ?? []).reduce((s, r) => s + r.net, 0);
    return { collected, expensesTotal, commissionTotal, payrollTotal, net: collected - expensesTotal - commissionTotal - payrollTotal };
  }, [paymentsQ.data, expensesQ.data, commissionQ.data, payrollQ.data]);

  async function download() {
    if (!reportConfig) return;
    setDownloading(true);
    try {
      const fname = `${activeSection}_report_${range.start}_${range.end}.pdf`;
      if (activeSection === "payments") {
        const doc = await buildPaymentsReportPdf(range, paymentsQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
      } else if (activeSection === "expenses") {
        const doc = await buildExpensesReportPdf(range, expensesQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
      } else if (activeSection === "commission") {
        const doc = await buildCommissionReportRangePdf(range, commissionQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
      } else if (activeSection === "payroll" && isManager) {
        const doc = await buildPayrollReportPdf(range, payrollQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
      } else if (activeSection === "summary" && isManager) {
        const doc = await buildSummaryReportPdf(range, paymentsQ.data ?? [], expensesQ.data ?? [], commissionQ.data ?? [], payrollQ.data ?? [], reportConfig.companyName, profile?.name, reportConfig.logoImage);
        doc.save(fname);
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">{isManager ? "Reports" : "My reports"}</h2>
        <p className="text-sm text-muted-foreground">
          {isManager
            ? "Pick a section and a date range, then download a real PDF report."
            : "Review and download reports for your own payment, expense, and commission records."}
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
                  {availableSections.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item === "summary" ? "Financial summary" : item[0].toUpperCase() + item.slice(1)}
                    </SelectItem>
                  ))}
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
            <Button onClick={download} disabled={downloading || loading || !!reportError || !reportConfig}>
              <Download data-icon="inline-start" />
              {downloading ? "Preparing…" : "Download PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {reportError ? (
        <Alert variant="destructive">
          <AlertDescription>We couldn’t load this report. Check your connection and try again.</AlertDescription>
        </Alert>
      ) : loading ? (
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
            {!isManager && <p className="mb-3 text-sm text-muted-foreground">This view is restricted to your own records.</p>}
            {activeSection === "summary" && isManager && (
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
            {activeSection === "commission" && <p className="text-sm text-muted-foreground">{(commissionQ.data ?? []).length} personal month row(s) · {money((commissionQ.data ?? []).reduce((s, r) => s + r.total, 0))} calculated</p>}
            {activeSection === "payroll" && isManager && <p className="text-sm text-muted-foreground">{(payrollQ.data ?? []).length} payee-run row(s) · {money((payrollQ.data ?? []).reduce((s, r) => s + r.net, 0))} total net pay</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

