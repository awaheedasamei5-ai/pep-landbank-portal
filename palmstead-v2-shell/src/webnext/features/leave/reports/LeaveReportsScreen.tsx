"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { requireSupabase } from "@/lib/supabase.client";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportSectionCsv } from "./leaveReportExports";
import { LeaveJournalHistory } from "./LeaveJournalHistory";
import { useSessionStore } from "../../../auth/useSessionStore";
import {
  buildLeaveReport,
  type LeaveReportSnapshot,
  type ReportFilters,
  type ReportQuery,
  type ReportSection,
  parseReportFilters,
  leaveReportUrl,
} from "./leaveReport";

const LeaveReportCharts = dynamic(() => import("./LeaveReportCharts"), {
  loading: () => <p className="py-8 text-muted-foreground text-sm">Preparing chart…</p>,
});

const sections = ["overview", "balances", "requests", "coverage", "trends", "exceptions", "history"] as const;
const months = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(Date.UTC(2026, index, 1)).toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
}));
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
function ReportTable({
  headers,
  rows,
  rowLinks,
}: {
  headers: string[];
  rows: (string | number | null)[][];
  rowLinks?: string[];
}) {
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
        {rows.map((row, index) => (
          <TableRow key={row.join("|")}>
            {row.map((value, cell) => (
              <TableCell key={headers[cell]} className="max-w-80 whitespace-normal align-top">
                {cell === 0 && rowLinks?.[index] ? (
                  <Link className="block break-all font-medium underline underline-offset-4" href={rowLinks[index]}>
                    {value ?? "Open request"}
                  </Link>
                ) : (
                  (value ?? "Not recorded")
                )}
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

export function LeaveReportsScreen({
  management = false,
  view = "overview",
  queryParams = {},
}: {
  management?: boolean;
  view?: string;
  queryParams?: ReportQuery;
}) {
  const profile = useSessionStore((state) => state.profile);
  const currentYear = new Date().getUTCFullYear();
  const filters = useMemo(
    () => parseReportFilters(queryParams, currentYear, management),
    [queryParams, currentYear, management],
  );
  const router = useRouter();
  const [changingScope, startScopeChange] = useTransition();
  const setFilters = (change: (previous: ReportFilters) => ReportFilters) => {
    startScopeChange(() =>
      router.replace(
        leaveReportUrl(
          management ? "/dashboard/leave/management/reports" : "/dashboard/leave/reports",
          change(filters),
          view,
        ),
        { scroll: false },
      ),
    );
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
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
        if (snapshot.journalEvents) {
          snapshot.journalEvents = snapshot.journalEvents.filter(
            (row) => row.ownerKey === profile?.key && row.kind !== "ownership_changed",
          );
          snapshot.journalTotal = snapshot.journalEvents.length;
        }
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
  async function downloadPdf(exportSection: "full" | ReportSection = "full") {
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
      createLeaveReportPdf(report, logo, exportSection).save(
        `leave-${management ? "company" : "personal"}-${filters.year}-${String(filters.fromMonth).padStart(2, "0")}-${String(filters.toMonth).padStart(2, "0")}-${exportSection}.pdf`,
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
              <Button
                disabled={
                  !report || exporting || changingScope || !report.journal.complete || !report.snapshot.eventsComplete
                }
                onClick={() => downloadPdf()}
              >
                <Download />
                {exporting ? "Preparing PDF…" : "Download full PDF pack"}
              </Button>
              <Button
                variant="outline"
                disabled={
                  !report ||
                  changingScope ||
                  (selected === "history" && (!report.journal.complete || !report.snapshot.eventsComplete))
                }
                onClick={() =>
                  report &&
                  saveBlob(
                    new Blob([reportSectionCsv(report, selected as ReportSection)], { type: "text/csv;charset=utf-8" }),
                    `leave-${selected}-${filters.year}-${filters.fromMonth}-${filters.toMonth}.csv`,
                  )
                }
              >
                Current section CSV
              </Button>
              <Button
                variant="outline"
                disabled={
                  !report ||
                  exporting ||
                  changingScope ||
                  (selected === "history" && (!report.journal.complete || !report.snapshot.eventsComplete))
                }
                onClick={() => downloadPdf(selected as ReportSection)}
              >
                Current section PDF
              </Button>
            </div>
          }
        />
      </div>
      <nav aria-label="Leave report sections" className="flex flex-wrap gap-1 border-b pb-3">
        {sections.map((section) => (
          <Button key={section} asChild size="sm" variant={selected === section ? "secondary" : "ghost"}>
            <Link
              href={leaveReportUrl(base, filters, section)}
              aria-current={selected === section ? "page" : undefined}
            >
              {label(section)}
            </Link>
          </Button>
        ))}
        {management && report && (
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/dashboard/leave/management/reports/reminders?${new URLSearchParams({ from: report.bounds.start, to: report.bounds.end, employee: filters.employee })}`}
            >
              Reminder period reports
            </Link>
          </Button>
        )}
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>Report scope</CardTitle>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              aria-expanded={filtersOpen}
              aria-controls="leave-report-filter-controls"
              onClick={() => setFiltersOpen((previous) => !previous)}
            >
              {filtersOpen ? "Hide filters" : "Edit filters"}
            </Button>
          </CardAction>
          <CardDescription>
            Annual balances always cover the full selected year. Month, status, emergency and quota filters apply to
            activity tables and comparisons. Annual balances, exceptions and history retain the full-year
            employee/department cohort.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-muted-foreground text-sm">
            {filters.year} · months {filters.fromMonth}–{filters.toMonth} ·{" "}
            {management
              ? filters.employee === "all"
                ? "All authorized employees"
                : (query.data?.roster.find((person) => person.key === filters.employee)?.name ?? filters.employee)
              : "Your own records"}{" "}
            · status {filters.status} · emergency {filters.emergency ?? "all"} · quota {filters.quota ?? "all"} ·{" "}
            {filters.comparisonMode === "previous_period" ? "Previous equal month period" : "Same months last year"}
          </p>
          <div id="leave-report-filter-controls" hidden={!filtersOpen}>
            <fieldset
              disabled={changingScope}
              aria-busy={changingScope}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
            >
              <Picker
                id="leave-report-year"
                title="Year"
                value={String(filters.year)}
                onChange={(value) => update("year", Number(value))}
                options={[
                  ...new Set([
                    filters.year,
                    currentYear + 1,
                    currentYear,
                    currentYear - 1,
                    ...(query.data?.availableYears ?? []),
                  ]),
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
              {management && (
                <Picker
                  id="leave-report-department"
                  title="Current department"
                  value={filters.department ?? "all"}
                  onChange={(value) => update("department", value)}
                  options={[
                    { value: "all", label: "All departments" },
                    { value: "missing", label: "Not recorded" },
                    ...[
                      ...new Set(
                        (query.data?.roster ?? [])
                          .map((person) => person.department)
                          .filter((value): value is string => !!value),
                      ),
                    ]
                      .sort()
                      .map((value) => ({ value: `department:${value}`, label: value })),
                  ]}
                />
              )}
              <Picker
                id="leave-report-emergency"
                title="Emergency activity"
                value={filters.emergency ?? "all"}
                onChange={(value) => update("emergency", value as ReportFilters["emergency"])}
                options={[
                  { value: "all", label: "All requests" },
                  { value: "yes", label: "Emergency only" },
                  { value: "no", label: "Standard only" },
                ]}
              />
              <Picker
                id="leave-report-quota"
                title="Quota activity"
                value={filters.quota ?? "all"}
                onChange={(value) => update("quota", value as ReportFilters["quota"])}
                options={[
                  { value: "all", label: "All quota treatments" },
                  { value: "deducting", label: "Deducting only" },
                  { value: "exempt", label: "Exempt only" },
                ]}
              />
              <Picker
                id="leave-report-compare"
                title="Compare with"
                value={filters.comparisonMode ?? "previous_year"}
                onChange={(value) => update("comparisonMode", value as ReportFilters["comparisonMode"])}
                options={[
                  { value: "previous_year", label: "Same months last year" },
                  { value: "previous_period", label: "Previous equal month period" },
                ]}
              />
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
            </fieldset>
          </div>
          {changingScope && (
            <p className="mt-3 text-muted-foreground text-sm" role="status">
              Updating report scope…
            </p>
          )}
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
                {(
                  {
                    overview: "A reconciled annual position, followed by evidence that needs review.",
                    history:
                      "Available recorded events only. Legacy history is incomplete; private note bodies are excluded.",
                  } as Record<string, string>
                )[selected] ??
                  "Export the full PDF pack or just this section as PDF/CSV. Exports use the selected report filters; table search is for browsing only. Annual sections retain the full-year employee/department cohort."}
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
                      with {report.approvedComparison.previous} in {report.prior.start} to {report.prior.end} (
                      {report.approvedComparison.difference >= 0 ? "+" : ""}
                      {report.approvedComparison.difference} days).
                    </p>
                  </div>
                  <div className="space-y-3 border-l pl-4">
                    <h3 className="font-medium">Insights and review actions</h3>
                    <ul className="space-y-4">
                      {report.insights.map((insight) => (
                        <li key={insight.key}>
                          <Link
                            className="font-medium text-sm underline underline-offset-4"
                            href={leaveReportUrl(base, filters, insight.section)}
                          >
                            {insight.title}
                          </Link>
                          <p className="mt-1 text-muted-foreground text-xs">{insight.detail}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm">
                      {report.exceptions.length} annual review items · {report.qualityCount} records with data issues.
                    </p>
                    <Button asChild variant="outline">
                      <Link href={leaveReportUrl(base, filters, "exceptions")}>Review contributing records</Link>
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
                    rowLinks={visible.map((row) => `/dashboard/leave/requests/${row.id}`)}
                    headers={[
                      "Reference / employee",
                      "Status",
                      "Exact selected dates",
                      "Declared days",
                      "Dates in period",
                      "Quota",
                      "Emergency",
                      "Latest decision",
                      "Created",
                      "Auto submitted",
                      "Usage confirmed",
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
                      row.createdAt,
                      row.autoSubmittedAt,
                      row.usedConfirmedAt,
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
                  <LeaveReportCharts report={report} />
                  <p className="mb-4 text-muted-foreground text-sm">
                    {report.comparisonLabel}: {report.prior.start} to {report.prior.end}. Approved scheduled
                    employee-dates use current statuses. Future dates may be included. No percentage is shown without a
                    comparison base.
                  </p>
                  <ReportTable
                    headers={[
                      "Current month",
                      "Comparison month",
                      "Current days",
                      "Comparison days",
                      "Change (days)",
                      "Change (%)",
                    ]}
                    rows={report.months.map((row) => [
                      `${filters.year}-${String(row.month).padStart(2, "0")}`,
                      row.previousMonth,
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
                  rowLinks={report.exceptions.map((row) => `/dashboard/leave/requests/${row.requestId}`)}
                  headers={["Reference", "Employee", "Review item"]}
                  rows={report.exceptions.map((row) => [row.reference, row.employee, row.message])}
                />
              )}
              {selected === "history" && (
                <>
                  <LeaveJournalHistory
                    key={`${filters.year}:${filters.employee}:${filters.department}:${filters.cohort}`}
                    report={report}
                  />
                  <h3 className="mb-2 font-semibold text-base">Legacy status records</h3>
                  <p className="mb-4 text-muted-foreground text-sm">
                    {report.snapshot.eventsComplete
                      ? "All available matching recorded events loaded."
                      : "Event response is incomplete. Narrower history export is required."}{" "}
                    These pre-capture status records have no immutable schedule snapshots and do not establish a
                    complete historical ledger or submission-to-decision time.
                  </p>
                  <ReportTable
                    rowLinks={report.events.map((row) => `/dashboard/leave/requests/${row.requestId}`)}
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
