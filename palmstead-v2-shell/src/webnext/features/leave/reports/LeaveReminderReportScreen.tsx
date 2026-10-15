"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { ReportQuery } from "./leaveReport";
import {
  buildReminderReport,
  parseReminderFilters,
  reminderFilterError,
  reminderReportUrl,
  reminderReportCsv,
  reminderSectionData,
  reminderStatuses,
  reminderStatusLabels,
  relationshipLabels,
  type ReminderFilters,
  type ReminderSnapshot,
  type ReminderView,
} from "./leaveReminderReport";

const views: ReminderView[] = ["overview", "comparison", "messages"];
const time = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Accra", hour12: false }) : "Not recorded";
const title = (value: string) => value[0].toUpperCase() + value.slice(1);
function SelectField({
  id,
  label,
  value,
  options,
  change,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  change: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={change}>
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
function DateScope({
  filters,
  apply,
  disabled,
}: {
  filters: ReminderFilters;
  apply: (filters: ReminderFilters) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next = { ...filters, from: String(values.get("from") ?? ""), to: String(values.get("to") ?? "") };
    const problem = reminderFilterError(next);
    setError(problem);
    if (!problem) apply(next);
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <fieldset disabled={disabled} className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 flex-1 basis-40 gap-2">
          <Label htmlFor="reminder-from">Queued from</Label>
          <Input
            className="w-full min-w-0"
            id="reminder-from"
            type="date"
            min="1901-01-01"
            max="2199-12-31"
            required
            name="from"
            defaultValue={filters.from}
          />
        </div>
        <div className="grid min-w-0 flex-1 basis-40 gap-2">
          <Label htmlFor="reminder-to">Queued to</Label>
          <Input
            className="w-full min-w-0"
            id="reminder-to"
            type="date"
            min="1901-01-01"
            max="2199-12-31"
            required
            name="to"
            defaultValue={filters.to}
          />
        </div>
        <Button type="submit" variant="outline">
          Apply dates
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LeaveReminderReportScreen({ queryParams }: { queryParams: ReportQuery }) {
  const profile = useSessionStore((state) => state.profile);
  const router = useRouter();
  const filters = useMemo(
    () => parseReminderFilters(queryParams, new Date().toISOString().slice(0, 10)),
    [queryParams],
  );
  const view: ReminderView = views.find((item) => item === queryParams.view) ?? "overview";
  const validation = reminderFilterError(filters);
  const [pending, transition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [page, setPage] = useState(0);
  const apply = (next: ReminderFilters) => {
    setPage(0);
    transition(() => router.replace(reminderReportUrl(next, view), { scroll: false }));
  };
  const query = useQuery({
    queryKey: ["leaveReminderReports", profile?.key, profile?.role, filters.from, filters.to, filters.compare],
    enabled: profile?.role === "manager" && !validation,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc("get_leave_reminder_report", {
        p_from: filters.from,
        p_to: filters.to,
        p_compare: filters.compare,
      });
      if (error) throw error;
      return data as ReminderSnapshot;
    },
    staleTime: 30_000,
  });
  const result = useMemo(() => {
    if (!query.data || validation) return { report: null, error: "" };
    try {
      return { report: buildReminderReport(query.data, filters), error: "" };
    } catch (error) {
      return { report: null, error: error instanceof Error ? error.message : "The reminder report could not be read." };
    }
  }, [query.data, filters, validation]);
  const report = result.report;
  const pageCount = Math.max(1, Math.ceil((report?.current.length ?? 0) / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const disabled = !report || pending || query.isFetching || query.isError || exporting;
  async function pdf(section: ReminderView | "full") {
    if (!report) return;
    setExporting(true);
    setExportError("");
    try {
      const { createReminderReportPdf } = await import("./leaveReminderReportPdf");
      const response = await fetch("/trulander-logo.png");
      if (!response.ok) throw new Error("The company logo could not be loaded. Try again.");
      const blob = await response.blob();
      const logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("The logo could not be read."));
        reader.readAsDataURL(blob);
      });
      createReminderReportPdf(report, logo, section).save(
        `leave-reminders-${filters.from}-${filters.to}-${section}.pdf`,
      );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The PDF could not be created.");
    } finally {
      setExporting(false);
    }
  }
  if (!profile) return <p>Loading your profile…</p>;
  if (profile.role !== "manager")
    return (
      <Alert>
        <AlertTitle>Management access required</AlertTitle>
        <AlertDescription>
          <Link href="/dashboard/leave/reports" className="underline">
            Open your personal Leave reports
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="grid min-w-0 gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard/leave/management/reports">
            <ArrowLeft />
            Leave reports
          </Link>
        </Button>
        <PageHeader
          title="Leave reminder reports"
          description="Messages queued in a selected period, their current outcomes and the comparison behind them."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={query.isFetching || !!validation} onClick={() => query.refetch()}>
                <RefreshCw />
                Refresh
              </Button>
              <Button disabled={disabled} onClick={() => pdf("full")}>
                <Download />
                {exporting ? "Preparing PDF…" : "Full reminder PDF"}
              </Button>
              <Button variant="outline" disabled={disabled} onClick={() => pdf(view)}>
                Current section PDF
              </Button>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  report &&
                  downloadCsv(
                    reminderReportCsv(report, view),
                    `leave-reminders-${filters.from}-${filters.to}-${view}.csv`,
                  )
                }
              >
                Current section CSV
              </Button>
            </div>
          }
        />
      </div>
      <nav aria-label="Reminder report sections" className="flex flex-wrap gap-2 border-b pb-3">
        {views.map((item) => (
          <Button asChild key={item} size="sm" variant={view === item ? "secondary" : "ghost"}>
            <Link aria-current={view === item ? "page" : undefined} href={reminderReportUrl(filters, item)}>
              {title(item)}
            </Link>
          </Button>
        ))}
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/leave/management/reminders">Operational monitor — all time</Link>
        </Button>
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>Reminder scope</CardTitle>
          <CardDescription>
            Queue creation dates in Ghana time, not the staff member’s leave dates. Request status, emergency and quota
            filters from Leave activity reports do not apply here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 break-words text-muted-foreground text-sm">
              {filters.from} to {filters.to} · {report?.employeeLabel ?? "Selected request-owner scope"} ·{" "}
              {filters.status === "all" ? "All outcomes" : reminderStatusLabels[filters.status]} ·{" "}
              {relationshipLabels[filters.relationship]}
            </p>
            <Button
              size="sm"
              variant="outline"
              aria-expanded={filtersOpen}
              aria-controls="reminder-report-controls"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {filtersOpen ? "Hide filters" : "Edit filters"}
            </Button>
          </div>
          <div id="reminder-report-controls" hidden={!filtersOpen}>
            <DateScope key={`${filters.from}:${filters.to}`} filters={filters} apply={apply} disabled={pending} />
            <fieldset disabled={pending} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SelectField
                id="reminder-owner"
                label="Request owner"
                value={filters.employee}
                change={(employee) => apply({ ...filters, employee })}
                options={[
                  { value: "all", label: "All request owners" },
                  ...(report?.employeeOptions ?? []).map((person) => ({ value: person.key, label: person.name })),
                  ...(!report?.employeeOptions.some((person) => person.key === filters.employee) &&
                  filters.employee !== "all"
                    ? [{ value: filters.employee, label: "Selected owner (no messages)" }]
                    : []),
                ]}
              />
              <SelectField
                id="reminder-status"
                label="Current message outcome"
                value={filters.status}
                change={(status) => apply({ ...filters, status: status as ReminderFilters["status"] })}
                options={[
                  { value: "all", label: "All outcomes" },
                  ...reminderStatuses.map((value) => ({ value, label: reminderStatusLabels[value] })),
                ]}
              />
              <SelectField
                id="reminder-recipient"
                label="Recipient relationship"
                value={filters.relationship}
                change={(relationship) =>
                  apply({ ...filters, relationship: relationship as ReminderFilters["relationship"] })
                }
                options={Object.entries(relationshipLabels).map(([value, label]) => ({ value, label }))}
              />
              <SelectField
                id="reminder-compare"
                label="Compare with"
                value={filters.compare}
                change={(compare) => apply({ ...filters, compare: compare as ReminderFilters["compare"] })}
                options={[
                  { value: "previous_period", label: "Previous equal number of days" },
                  { value: "previous_year", label: "Same dates last year" },
                ]}
              />
            </fieldset>
          </div>
        </CardContent>
      </Card>
      {(validation || result.error || query.isError || exportError) && (
        <Alert variant="destructive">
          <AlertTitle>Report needs attention</AlertTitle>
          <AlertDescription>
            {validation ||
              result.error ||
              exportError ||
              "The reminder report could not be loaded. Use Refresh to try again."}
          </AlertDescription>
        </Alert>
      )}
      {query.isPending && !validation && (
        <p className="text-muted-foreground text-sm">Loading authorized reminder records…</p>
      )}
      {report && (
        <>
          <p className="text-muted-foreground text-xs">
            Management — internal · Snapshot {time(report.snapshot.generatedAt)} Ghana time. Comparison:{" "}
            {report.snapshot.previous.from} to {report.snapshot.previous.to}. Current statuses apply to both cohorts.
          </p>
          <Alert>
            <AlertTitle>Provider acceptance is not delivery confirmation</AlertTitle>
            <AlertDescription>
              No handset or read receipts are recorded here. Failed or uncertain messages require review in the
              operational monitor; this report sends no messages.
            </AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle>{title(view)}</CardTitle>
              <CardDescription>
                Downloads contain all matched records in this section; display pagination does not limit exports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {view === "overview" && (
                <>
                  <dl className="flex flex-wrap gap-x-10 gap-y-5 border-b pb-5">
                    {[
                      ["Messages in scope", report.current.length],
                      ["Source requests", report.requests],
                      ["Provider accepted", report.accepted],
                      ["Needs attention", report.attention],
                    ].map(([name, value]) => (
                      <div key={name}>
                        <dt className="text-muted-foreground text-sm">{name}</dt>
                        <dd className="font-semibold text-2xl tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-5 space-y-3 text-sm">
                    <p>
                      {report.current.length
                        ? `${report.acceptedPercentage?.toFixed(1)}% of matched records are currently provider accepted.`
                        : "No messages were queued in this period and scope. Saving a future leave plan does not immediately queue a reminder."}
                    </p>
                    <p>
                      {report.previous.length} matched messages in the comparison period.{" "}
                      {report.attention
                        ? `${report.attention} current records need operational review.`
                        : "No failed or uncertain records in the selected scope."}
                    </p>
                    <Link className="underline underline-offset-4" href={reminderReportUrl(filters, "messages")}>
                      Inspect contributing message records
                    </Link>
                  </div>
                </>
              )}
              {view === "comparison" && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {reminderSectionData(report, "comparison").headers.map((header) => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.comparison.map((row) => (
                      <TableRow key={row.status}>
                        <TableCell className="whitespace-normal">{reminderStatusLabels[row.status]}</TableCell>
                        <TableCell>{row.current}</TableCell>
                        <TableCell>{row.previous}</TableCell>
                        <TableCell>{row.difference}</TableCell>
                        <TableCell>
                          {row.percentage === null ? "No comparison base" : `${row.percentage.toFixed(1)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {view === "messages" &&
                (report.current.length ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {[
                            "Request / owner",
                            "Recipient / event",
                            "Current outcome",
                            "Queued Ghana UTC",
                            "Current-cycle attempts",
                            "Provider accepted Ghana UTC",
                            "Latest manual retry Ghana UTC",
                            "Next attempt Ghana UTC",
                          ].map((header) => (
                            <TableHead key={header}>{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.current.slice(currentPage * 25, (currentPage + 1) * 25).map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="max-w-72 whitespace-normal break-words">
                              {row.requestExists ? (
                                <Link
                                  className="underline underline-offset-4"
                                  href={`/dashboard/leave/requests/${row.requestId}`}
                                >
                                  {row.reference}
                                </Link>
                              ) : (
                                row.reference
                              )}
                              <span className="mt-1 block text-muted-foreground">{row.ownerName}</span>
                            </TableCell>
                            <TableCell className="max-w-60 whitespace-normal break-words">
                              {row.recipientName}
                              <span className="block text-muted-foreground text-xs">
                                {relationshipLabels[row.relationship]} · {row.event}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-normal">{reminderStatusLabels[row.status]}</TableCell>
                            <TableCell>{time(row.createdAt)}</TableCell>
                            <TableCell>{row.attempts}</TableCell>
                            <TableCell>{time(row.acceptedAt)}</TableCell>
                            <TableCell>{time(row.retriedAt)}</TableCell>
                            <TableCell>{time(row.nextAttemptAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!currentPage}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <span className="text-muted-foreground text-xs">
                        Page {currentPage + 1} of {pageCount} · {report.current.length} matched messages
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
                ) : (
                  <p className="py-6 text-muted-foreground text-sm">
                    No messages were queued in this period and scope.
                  </p>
                ))}
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
