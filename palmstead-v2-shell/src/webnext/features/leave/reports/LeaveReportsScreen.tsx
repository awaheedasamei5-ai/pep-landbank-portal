"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { requireSupabase } from "@/lib/supabase.client";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSessionStore } from "../../../auth/useSessionStore";
import { buildLeaveReport, leaveReportCsv, type LeaveReportSnapshot, type ReportFilters } from "./leaveReport";

const sections = ["overview", "balances", "requests", "coverage", "trends", "exceptions", "history"] as const;
const months = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(Date.UTC(2026, index, 1)).toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
}));
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number | null)[][] }) {
  return rows.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header}>{header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.join("|")}>
            {row.map((value, cell) => (
              <TableCell key={headers[cell]} className="max-w-80 whitespace-normal align-top">
                {value ?? "Not recorded"}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ) : (
    <p className="py-8 text-muted-foreground text-sm">No matching records in this scope.</p>
  );
}
function Picker({
  id,
  title,
  value,
  onChange,
  options,
}: {
  id: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{title}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LeaveReportsScreen({ management = false, view = "overview" }: { management?: boolean; view?: string }) {
  const profile = useSessionStore((state) => state.profile);
  const currentYear = new Date().getUTCFullYear();
  const [filters, setFilters] = useState<ReportFilters>({
    year: currentYear,
    fromMonth: 1,
    toMonth: 12,
    employee: "all",
    status: "all",
    cohort: "all",
  });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const permitted = !!profile && (!management || profile.role === "manager");
  const query = useQuery({
    queryKey: ["leaveReports", profile?.key, profile?.role, management, filters.year],
    enabled: permitted,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc("get_leave_report_snapshot", { p_year: filters.year });
      if (error) throw error;
      const snapshot = data as LeaveReportSnapshot;
      if (!snapshot || !Array.isArray(snapshot.requests) || !Array.isArray(snapshot.roster))
        throw new Error("The report response could not be read.");
      if (!management) {
        snapshot.scope = "personal";
        snapshot.requests = snapshot.requests.filter((row) => row.agentKey === profile?.key);
        snapshot.roster = snapshot.roster.filter((row) => row.key === profile?.key);
        const ids = new Set(snapshot.requests.map((row) => row.id));
        snapshot.events = snapshot.events.filter((row) => ids.has(row.requestId));
        // Do not relabel a bounded/incomplete company response as complete.
        snapshot.totalRequests = snapshot.requests.length;
      }
      return snapshot;
    },
    staleTime: 30_000,
  });
  const selected = sections.includes(view as (typeof sections)[number]) ? view : "overview";
  const result = useMemo(() => {
    if (!query.data) return { report: null, error: "" };
    try {
      return { report: buildLeaveReport(query.data, filters), error: "" };
    } catch (error) {
      return { report: null, error: error instanceof Error ? error.message : "Report calculation failed." };
    }
  }, [query.data, filters]);
  const report = result.report;
  const base = management ? "/dashboard/leave/management/reports" : "/dashboard/leave/reports";
  const update = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const filteredRegister = report?.register ?? [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const searched = filteredRegister.filter((row) =>
    `${row.requestNo ?? row.id} ${row.agentName}`.toLowerCase().includes(search.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(searched.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = searched.slice(currentPage * 25, (currentPage + 1) * 25);
  async function downloadPdf() {
    if (!report) return;
    setExporting(true);
    setExportError("");
    try {
      const { createLeaveReportPdf } = await import("./leaveReportPdf");
      const response = await fetch("/trulander-logo.png");
      if (!response.ok) throw new Error("The company logo could not be loaded. Try the download again.");
      const blob = await response.blob();
      const logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Logo could not be read."));
        reader.readAsDataURL(blob);
      });
      createLeaveReportPdf(report, logo).save(
        `leave-${management ? "company" : "personal"}-${filters.year}-full-pack.pdf`,
      );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The PDF could not be generated.");
    } finally {
      setExporting(false);
    }
  }
  if (!profile) return <p>Loading your profile…</p>;
  if (!permitted)
    return (
      <Alert>
        <AlertTitle>Management access required</AlertTitle>
        <AlertDescription>
          <Link className="underline" href="/dashboard/leave/reports">
            Open your personal Leave reports
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="grid min-w-0 gap-5">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href={management ? "/dashboard/leave/management" : "/dashboard/leave"}>
            <ArrowLeft />
            Leave
          </Link>
        </Button>
        <PageHeader
          title={management ? "Leave reports" : "My leave reports"}
          description="Annual balances, actual selected dates and the records behind the figures."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>
                <RefreshCw />
                Refresh
              </Button>
              <Button disabled={!report || exporting} onClick={downloadPdf}>
                <Download />
                {exporting ? "Preparing PDF…" : "Download full PDF pack"}
              </Button>
              <Button
                variant="outline"
                disabled={!report}
                onClick={() =>
                  report &&
                  saveBlob(
                    new Blob([leaveReportCsv(report)], { type: "text/csv;charset=utf-8" }),
                    `leave-requests-${filters.year}.csv`,
                  )
                }
              >
                Request CSV
              </Button>
            </div>
          }
        />
      </div>
      <nav aria-label="Leave report sections" className="flex flex-wrap gap-1 border-b pb-3">
        {sections.map((section) => (
          <Button key={section} asChild size="sm" variant={selected === section ? "secondary" : "ghost"}>
            <Link href={`${base}?view=${section}`} aria-current={selected === section ? "page" : undefined}>
              {label(section)}
            </Link>
          </Button>
        ))}
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>Report scope</CardTitle>
          <CardDescription>
            Annual balances always cover the full selected year. Month and status filters apply to activity tables and
            comparisons.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Picker
            id="leave-report-year"
            title="Year"
            value={String(filters.year)}
            onChange={(value) => update("year", Number(value))}
            options={[
              ...new Set([currentYear + 1, currentYear, currentYear - 1, ...(query.data?.availableYears ?? [])]),
            ]
              .sort((a, b) => b - a)
              .map((year) => ({ value: String(year), label: String(year) }))}
          />
          <Picker
            id="leave-report-from"
            title="From month"
            value={String(filters.fromMonth)}
            onChange={(value) =>
              setFilters((previous) => ({
                ...previous,
                fromMonth: Number(value),
                toMonth: Math.max(Number(value), previous.toMonth),
              }))
            }
            options={months.map((month) => ({ value: String(month.value), label: month.label }))}
          />
          <Picker
            id="leave-report-to"
            title="To month"
            value={String(filters.toMonth)}
            onChange={(value) =>
              setFilters((previous) => ({
                ...previous,
                toMonth: Number(value),
                fromMonth: Math.min(Number(value), previous.fromMonth),
              }))
            }
            options={months.map((month) => ({ value: String(month.value), label: month.label }))}
          />
          {management && (
            <>
              <Picker
                id="leave-report-employee"
                title="Employee"
                value={filters.employee}
                onChange={(value) => update("employee", value)}
                options={[
                  { value: "all", label: "All authorized employees" },
                  ...(query.data?.roster ?? []).map((person) => ({ value: person.key, label: person.name })),
                ]}
              />
              <Picker
                id="leave-report-cohort"
                title="Employee status"
                value={filters.cohort}
                onChange={(value) => update("cohort", value as ReportFilters["cohort"])}
                options={["all", "active", "inactive"].map((value) => ({ value, label: label(value) }))}
              />
            </>
          )}
          <Picker
            id="leave-report-status"
            title="Activity status"
            value={filters.status}
            onChange={(value) => update("status", value)}
            options={["all", "planned", "pending", "approved", "declined", "rescheduled"].map((value) => ({
              value,
              label: label(value),
            }))}
          />
        </CardContent>
      </Card>
      {(query.isError || result.error || exportError) && (
        <Alert variant="destructive">
          <AlertTitle>Report needs attention</AlertTitle>
          <AlertDescription>
            {exportError || result.error || "The report could not be loaded. Use Refresh to try again."}
          </AlertDescription>
        </Alert>
      )}
      {query.isPending && <p className="text-muted-foreground text-sm">Loading authorized report records…</p>}
      {report && (
        <>
          <p className="text-muted-foreground text-xs">
            {management ? "Management — internal" : "Personal — private"} · Snapshot{" "}
            {new Date(report.snapshot.generatedAt).toLocaleString("en-GB", { timeZone: "Africa/Accra" })} Ghana time ·{" "}
            {report.bounds.start} to {report.bounds.end}. Current company policy: {report.snapshot.annualDays} days per
            eligible employee; historical allocations are not recorded.
          </p>
          <Card>
            <CardHeader>
              <CardTitle>{label(selected)}</CardTitle>
              <CardDescription>
                {selected === "overview"
                  ? "A reconciled annual position, followed by evidence that needs review."
                  : selected === "history"
                    ? "Available recorded events only. Legacy history is incomplete; private note bodies are excluded."
                    : "The PDF pack contains every report section. Request CSV contains all activity-filtered requests; the table search below is for browsing only."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selected === "overview" && (
                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <div>
                    <ReportTable
                      headers={["Annual measure", "Days"]}
                      rows={[
                        ["Reserved", report.totalReserved],
                        ["Confirmed used (included in reserved)", report.totalConfirmed],
                        [
                          "Available (sum of eligible employee balances)",
                          report.balances.reduce((sum, row) => sum + (row.available ?? 0), 0),
                        ],
                        ["Over-reserved", report.balances.reduce((sum, row) => sum + (row.overReserved ?? 0), 0)],
                      ]}
                    />
                    <p className="mt-4 text-sm">
                      Approved scheduled employee-dates: <strong>{report.approvedComparison.current}</strong>, compared
                      with {report.approvedComparison.previous} in the same month range of {filters.year - 1} (
                      {report.approvedComparison.difference >= 0 ? "+" : ""}
                      {report.approvedComparison.difference} days).
                    </p>
                  </div>
                  <div className="space-y-3 border-l pl-4">
                    <h3 className="font-medium">Review actions</h3>
                    <p className="text-sm">
                      {report.exceptions.length} annual review items · {report.qualityCount} records with data issues.
                    </p>
                    <Button asChild variant="outline">
                      <Link href={`${base}?view=exceptions`}>Review contributing records</Link>
                    </Button>
                    {management && (
                      <Button asChild variant="outline">
                        <Link href="/dashboard/leave/management/reminders">Reminder reliability (all time)</Link>
                      </Button>
                    )}
                    <p className="text-muted-foreground text-xs">
                      Past approval without confirmation is not proof of absence. Historical policy and full
                      decision-cycle turnaround are unavailable.
                    </p>
                  </div>
                </div>
              )}
              {selected === "balances" && (
                <ReportTable
                  headers={[
                    "Employee / department",
                    "Policy",
                    "Planned",
                    "Pending",
                    "Approved",
                    "Rescheduled",
                    "Reserved",
                    "Confirmed used",
                    "Available",
                    "Exempt",
                    "Over",
                  ]}
                  rows={report.balances.map((row) => [
                    `${row.name} / ${row.department ?? "Not recorded"}${row.active ? "" : " (inactive/former)"}`,
                    row.allowance,
                    row.planned,
                    row.pending,
                    row.approved,
                    row.rescheduled,
                    row.reserved,
                    row.confirmedUsed,
                    row.available,
                    row.exempt,
                    row.overReserved,
                  ])}
                />
              )}
              {selected === "requests" && (
                <>
                  <div className="mb-4 max-w-sm space-y-2">
                    <Label htmlFor="leave-register-search">Find reference or employee (table only)</Label>
                    <Input
                      id="leave-register-search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(0);
                      }}
                    />
                  </div>
                  <ReportTable
                    headers={[
                      "Reference / employee",
                      "Status",
                      "Exact selected dates",
                      "Declared days",
                      "Dates in period",
                      "Quota",
                      "Emergency",
                      "Latest decision",
                    ]}
                    rows={visible.map((row) => [
                      `${row.requestNo ?? row.id} / ${row.agentName}`,
                      row.status,
                      row.dates.join(", "),
                      row.daysCount,
                      row.datesInPeriod.length,
                      row.deductQuota === false ? "Exempt" : "Deducting",
                      row.isEmergency ? "Yes" : "No",
                      row.decidedAt,
                    ])}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <span>
                      Page {currentPage + 1} of {pageCount} · {searched.length} matches
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage + 1 >= pageCount}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}
              {selected === "coverage" && (
                <ReportTable
                  headers={["Actual date", "Employees", "Approved staff", "Tentative staff", "Overlap"]}
                  rows={report.coverage.map((row) => [
                    row.date,
                    row.employees
                      .map((key) => report.people.find((person) => person.key === key)?.name ?? key)
                      .join(", "),
                    row.approved,
                    row.tentative,
                    row.overlap ? "Review coverage" : "No",
                  ])}
                />
              )}
              {selected === "trends" && (
                <>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Approved scheduled employee-dates; current status, same complete month range in each year. Future
                    dates may be included. No percentage is shown without a prior-year base.
                  </p>
                  <ReportTable
                    headers={["Month", String(filters.year), String(filters.year - 1), "Change (days)", "Change (%)"]}
                    rows={report.months.map((row) => [
                      months[row.month - 1].label,
                      row.current,
                      row.previous,
                      row.difference,
                      row.percentage === null ? "No prior base" : `${row.percentage.toFixed(1)}%`,
                    ])}
                  />
                </>
              )}
              {selected === "exceptions" && (
                <ReportTable
                  headers={["Reference", "Employee", "Review item"]}
                  rows={report.exceptions.map((row) => [row.reference, row.employee, row.message])}
                />
              )}
              {selected === "history" && (
                <>
                  <p className="mb-4 text-muted-foreground text-sm">
                    {report.snapshot.eventsComplete
                      ? "All available matching recorded events loaded."
                      : "Event response is incomplete. Narrower history export is required."}{" "}
                    This does not establish a complete historical ledger.
                  </p>
                  <ReportTable
                    headers={["Request", "Timestamp", "Actor key", "From", "To"]}
                    rows={report.events.map((event) => [
                      report.snapshot.requests.find((request) => request.id === event.requestId)?.requestNo ??
                        event.requestId,
                      event.createdAt,
                      event.actorKey,
                      event.fromStatus ?? "Created",
                      event.toStatus,
                    ])}
                  />
                </>
              )}
            </CardContent>
          </Card>
          <details className="rounded-lg border p-4 text-sm">
            <summary className="cursor-pointer font-medium">Definitions and data limitations</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              {report.definitions.map((definition) => (
                <li key={definition}>{definition}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
