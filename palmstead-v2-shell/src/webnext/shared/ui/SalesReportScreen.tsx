"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useSessionStore } from "../../auth/useSessionStore";
import { getDataSource } from "../../data/source";
import { loadSalesReportData } from "../lib/salesReportData";
import {
  buildSalesReport,
  compareSalesPeriods,
  ghanaDate,
  precedingSalesPeriod,
  reportableSalesLeads,
  salesPaymentPlanLabel,
  type SalesReportFilters,
  type SalesReportScope,
} from "../lib/salesReportModel";
import { buildSalesReportPdf, SALES_PDF_SECTIONS, type SalesPdfSection } from "../lib/salesReportPdf";

const chartConfig = {
  calls: { label: "Genuine calls", color: "var(--chart-1)" },
  newLeads: { label: "New leads", color: "var(--chart-2)" },
  visitRequests: { label: "Visit requests", color: "var(--chart-3)" },
} satisfies ChartConfig;

const EMPTY = "all";
const ghs = (value: number) => `GHS ${value.toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
const pct = (value: number | null) => (value === null ? "N/A" : `${value.toFixed(1)}%`);

function initialFilters(): SalesReportFilters {
  const today = ghanaDate(new Date().toISOString());
  return {
    from: `${today.slice(0, 4)}-01-01`,
    to: today,
    staffKey: "",
    source: "",
    stage: "",
    action: "",
    outcome: "",
    site: "",
    paymentPlan: "",
    pool: "",
    clientId: "",
  };
}

function FilterSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 font-medium text-xs">
      <span id={`sales-filter-${label.replaceAll(" ", "-")}`}>{label}</span>
      <Select value={value || EMPTY} onValueChange={(next) => onChange(next === EMPTY ? "" : next)}>
        <SelectTrigger className="w-full" aria-labelledby={`sales-filter-${label.replaceAll(" ", "-")}`}>
          <SelectValue placeholder={`All ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={EMPTY}>All {label.toLowerCase()}</SelectItem>
            {options.filter(Boolean).map((option) => (
              <SelectItem key={option} value={option}>
                {labels?.[option] ?? option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function SalesReportScreen({ scope }: { scope: SalesReportScope }) {
  const profile = useSessionStore((state) => state.profile);
  const isManager = profile?.role === "manager";
  const [filters, setFilters] = useState<SalesReportFilters>(initialFilters);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pdfSections, setPdfSections] = useState<SalesPdfSection[]>(SALES_PDF_SECTIONS.map((section) => section.key));
  const dataQuery = useQuery({
    queryKey: ["salesReportData", profile?.key],
    queryFn: loadSalesReportData,
    enabled: !!profile,
    staleTime: 60_000,
  });
  const staffQuery = useQuery({
    queryKey: ["salesReportStaff"],
    queryFn: () => getDataSource().staff.list(),
    enabled: !!isManager,
    staleTime: 60_000,
  });
  const names = useMemo(
    () => Object.fromEntries((staffQuery.data ?? []).map((person) => [person.key, person.name])),
    [staffQuery.data],
  );
  const report = useMemo(() => {
    if (!dataQuery.data || !profile || (scope === "master" && !isManager) || filters.from > filters.to) return null;
    return buildSalesReport(dataQuery.data, scope, profile.key, !!isManager, filters, names);
  }, [dataQuery.data, profile, scope, isManager, filters, names]);
  const comparison = useMemo(() => {
    if (!report || !dataQuery.data || !profile) return null;
    const previous = buildSalesReport(
      dataQuery.data,
      scope,
      profile.key,
      !!isManager,
      precedingSalesPeriod(filters),
      names,
    );
    return compareSalesPeriods(report, previous);
  }, [report, dataQuery.data, profile, scope, isManager, filters, names]);
  const activePdfSections = pdfSections.filter((section) => section !== "staff" || isManager);
  const update = (field: keyof SalesReportFilters, value: string) =>
    setFilters((current) => ({ ...current, [field]: value }));
  const choices = useMemo(() => {
    const data = dataQuery.data;
    const reportable = data ? reportableSalesLeads(data) : [];
    const unique = (values: (string | null | undefined)[]) =>
      [...new Set(values.filter((value): value is string => !!value))].sort();
    return {
      source: unique(reportable.map((lead) => lead.leadSource)),
      stage: unique(reportable.map((lead) => lead.stage)),
      action: unique(data?.activity.map((entry) => entry.action) ?? []),
      outcome: unique(data?.activity.map((entry) => entry.outcome) ?? []),
      site: unique(data?.visits.map((visit) => visit.site) ?? []),
      plan: unique(reportable.map((lead) => salesPaymentPlanLabel(lead.paymentPlan))),
      clients: reportable
        .filter((lead) =>
          scope === "master" ? isManager : scope === "company" ? lead.agent === "company" : lead.agent === profile?.key,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [dataQuery.data, scope, isManager, profile?.key]);
  const title = { company: "Company Leads Report", master: "Master Pipeline Report", mine: "My Pipeline Report" }[
    scope
  ];
  const back = scope === "company" ? "/dashboard/company-leads" : "/dashboard/pipeline";

  async function download() {
    if (!report || !profile) return;
    setExporting(true);
    setExportError(null);
    try {
      const pdf = await buildSalesReportPdf(report, profile.name, {
        sections: activePdfSections,
        comparison: comparison ?? undefined,
      });
      pdf.save(`Palmstead-${scope}-sales-${filters.from}-to-${filters.to}.pdf`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not create the PDF.");
    } finally {
      setExporting(false);
    }
  }

  if (scope === "master" && profile && !isManager)
    return <p className="p-4">Management access is required for company-wide reports.</p>;
  return (
    <div className="flex min-w-0 flex-col gap-5 pb-8">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href={back}>
          <ArrowLeft /> Back to {scope === "company" ? "Company Leads" : "Pipeline"}
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={title}
          description={`Calls, lead conversion, site visit requests, approved receipts and trends${isManager ? ", with staff comparisons" : ""}.`}
        />
        <div className="flex flex-wrap gap-2">
          {isManager && (
            <Button asChild variant="outline">
              <Link href="/dashboard/pipeline/daily-reports">Daily Management reports</Link>
            </Button>
          )}
          <Button onClick={download} disabled={!report || exporting || activePdfSections.length === 0}>
            <Download />
            {exporting ? "Preparing PDF…" : "Download PDF"}
          </Button>
        </div>
      </div>
      <Card>
        <CardContent>
          <FieldSet>
            <FieldLegend>PDF sections</FieldLegend>
            <p className="text-muted-foreground text-sm">
              Choose what the downloaded report includes. Its date range and filters always match the screen.
            </p>
            <FieldGroup className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SALES_PDF_SECTIONS.filter((section) => section.key !== "staff" || isManager).map((section) => (
                <Field key={section.key} orientation="horizontal">
                  <Checkbox
                    id={`sales-pdf-${section.key}`}
                    checked={pdfSections.includes(section.key)}
                    onCheckedChange={(checked) =>
                      setPdfSections((current) =>
                        checked === true ? [...current, section.key] : current.filter((key) => key !== section.key),
                      )
                    }
                  />
                  <FieldLabel htmlFor={`sales-pdf-${section.key}`}>{section.label}</FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Report scope</CardTitle>
          <CardDescription>
            Each figure uses the selected Ghana calendar dates. Stage and paid-in-full measures are current snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label htmlFor="sales-from" className="flex flex-col gap-1.5 font-medium text-xs">
            From
            <Input
              id="sales-from"
              type="date"
              value={filters.from}
              onChange={(event) => update("from", event.target.value)}
            />
          </label>
          <label htmlFor="sales-to" className="flex flex-col gap-1.5 font-medium text-xs">
            To
            <Input
              id="sales-to"
              type="date"
              value={filters.to}
              onChange={(event) => update("to", event.target.value)}
            />
          </label>
          {isManager && (
            <FilterSelect
              label="Staff"
              value={filters.staffKey}
              options={(staffQuery.data ?? []).map((person) => person.key)}
              labels={names}
              onChange={(value) => update("staffKey", value)}
            />
          )}
          {scope === "master" && (
            <FilterSelect
              label="Lead pool"
              value={filters.pool}
              options={["personal", "company"]}
              labels={{ personal: "Staff pipelines", company: "Company Leads" }}
              onChange={(value) => update("pool", value)}
            />
          )}
          <FilterSelect
            label="Client"
            value={filters.clientId}
            options={choices.clients.map((lead) => lead.id)}
            labels={Object.fromEntries(
              choices.clients.map((lead) => [
                lead.id,
                `${lead.name} · ${lead.date} · ${lead.agent === "company" ? "Company" : "Staff"}`,
              ]),
            )}
            onChange={(value) => update("clientId", value)}
          />
          <FilterSelect
            label="Source"
            value={filters.source}
            options={choices.source}
            onChange={(value) => update("source", value)}
          />
          <FilterSelect
            label="Stage"
            value={filters.stage}
            options={choices.stage}
            onChange={(value) => update("stage", value)}
          />
          <FilterSelect
            label="Action"
            value={filters.action}
            options={choices.action}
            onChange={(value) => update("action", value)}
          />
          <FilterSelect
            label="Call outcome"
            value={filters.outcome}
            options={choices.outcome}
            onChange={(value) => update("outcome", value)}
          />
          <FilterSelect
            label="Site"
            value={filters.site}
            options={choices.site}
            onChange={(value) => update("site", value)}
          />
          <FilterSelect
            label="Payment plan"
            value={filters.paymentPlan}
            options={choices.plan}
            onChange={(value) => update("paymentPlan", value)}
          />
        </CardContent>
      </Card>
      {filters.from > filters.to && (
        <p role="alert" className="text-destructive text-sm">
          The start date must be before the end date.
        </p>
      )}
      {dataQuery.isPending && <p className="text-muted-foreground text-sm">Loading complete authorized records…</p>}
      {dataQuery.isError && (
        <p role="alert" className="text-destructive text-sm">
          {dataQuery.error.message}
        </p>
      )}
      {exportError && (
        <p role="alert" className="text-destructive text-sm">
          {exportError}
        </p>
      )}
      {report && (
        <>
          {report.excludedImportPlaceholders > 0 && (
            <p className="text-muted-foreground text-sm">
              {report.excludedImportPlaceholders.toLocaleString()} allocation-import names without contact, deal
              value, progress or linked activity are excluded from sales figures and client records in this scope.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["New leads", report.newLeads.length.toLocaleString(), "Created in selected dates"],
              [
                "Genuine calls",
                report.calls.length.toLocaleString(),
                `${report.activities.length - report.calls.length} other recorded events`,
              ],
              ["Reached rate", pct(report.reachedRate), `${report.reached} of ${report.calls.length} calls`],
              [
                "Visit requests",
                report.requestedVisits.length.toLocaleString(),
                `${report.scheduledVisits.length} visits scheduled in dates`,
              ],
              ["Lead to visit", pct(report.newLeadToVisitRate), "Current visit evidence for new lead cohort"],
              ["Lead paid in full", pct(report.newLeadToPaidRate), "Current status of new lead cohort"],
              [
                "Approved receipts",
                ghs(report.approvedPayments.reduce((sum, payment) => sum + payment.amount, 0)),
                `${report.approvedPayments.length} approved entries`,
              ],
              [
                "Client records",
                report.clients.length.toLocaleString(),
                `${report.payingClients} with approved payments to date`,
              ],
              ["Pipeline value", ghs(report.pipelineValue), "Current quoted deal totals"],
              ["Outstanding", ghs(report.outstanding), "Current deal balance snapshot"],
              ["Attributed visit cost", ghs(report.attributedVisitCost), "Recorded attended-visit cost only"],
              [
                "Data gaps",
                report.qualityIssues.length.toLocaleString(),
                "Call outcomes, visit links, company handlers and payment plans needing attention",
              ],
            ].map(([label, value, note]) => (
              <Card key={label}>
                <CardHeader className="gap-1">
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="break-words text-2xl">{value}</CardTitle>
                  <p className="text-muted-foreground text-xs">{note}</p>
                </CardHeader>
              </Card>
            ))}
          </div>
          {comparison && (
            <Card>
              <CardHeader>
                <CardTitle>Previous period comparison</CardTitle>
                <CardDescription>
                  {comparison.from} to {comparison.to}, the same number of Ghana calendar days. Only dated activity is
                  compared; deal values and stages are current snapshots.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Measure</TableHead>
                      <TableHead>Selected period</TableHead>
                      <TableHead>Previous period</TableHead>
                      <TableHead>Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.rows.map((row) => {
                      const format = (value: number) =>
                        row.unit === "money" ? ghs(value) : value.toLocaleString("en-GH");
                      const delta = row.current - row.previous;
                      return (
                        <TableRow key={row.label}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell>{format(row.current)}</TableCell>
                          <TableCell>{format(row.previous)}</TableCell>
                          <TableCell>
                            {delta > 0 ? "+" : ""}
                            {format(delta)}
                            {row.previous > 0 ? ` (${((delta / row.previous) * 100).toFixed(1)}%)` : ""}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Monthly trend</CardTitle>
              <CardDescription>
                Event dates for leads, calls and visit requests. Approved client receipts use payment date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={report.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="newLeads" fill="var(--color-newLeads)" radius={2} />
                  <Bar dataKey="calls" fill="var(--color-calls)" radius={2} />
                  <Bar dataKey="visitRequests" fill="var(--color-visitRequests)" radius={2} />
                </BarChart>
              </ChartContainer>
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Visit requests</TableHead>
                      <TableHead>Approved receipts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.months.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell>{row.month}</TableCell>
                        <TableCell>{row.newLeads}</TableCell>
                        <TableCell>{row.calls}</TableCell>
                        <TableCell>{row.visitRequests}</TableCell>
                        <TableCell>{ghs(row.approvedCash)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {isManager && (
            <Card>
              <CardHeader>
                <CardTitle>Staff comparison</CardTitle>
                <CardDescription>
                  Deals and approved receipts are grouped by lead owner. Company-owned leads stay in the Company pool
                  even when a staff handler is assigned. Calls and visits are linked to those clients.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>New leads</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Reached</TableHead>
                      <TableHead>Reached rate</TableHead>
                      <TableHead>Visit requests</TableHead>
                      <TableHead>Approved receipts</TableHead>
                      <TableHead>Clients</TableHead>
                      <TableHead>Conversations</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Visit cost</TableHead>
                      <TableHead>Visit to paying</TableHead>
                      <TableHead>Known cost / payer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.staff.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.newLeads}</TableCell>
                        <TableCell>{row.calls}</TableCell>
                        <TableCell>{row.reached}</TableCell>
                        <TableCell>{pct(row.reachedRate)}</TableCell>
                        <TableCell>{row.visitRequests}</TableCell>
                        <TableCell>{ghs(row.approvedCash)}</TableCell>
                        <TableCell>{row.clients}</TableCell>
                        <TableCell>{row.conversations}</TableCell>
                        <TableCell>{ghs(row.outstanding)}</TableCell>
                        <TableCell>{ghs(row.attributedVisitCost)}</TableCell>
                        <TableCell>{pct(row.visitToPayingRate)}</TableCell>
                        <TableCell>
                          {row.knownCostPerPayingClient === null ? "N/A" : ghs(row.knownCostPerPayingClient)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ["Lead sources", report.sourceCounts],
              ["Current stages", report.stageCounts],
              ["Call outcomes", report.outcomeCounts],
            ].map(([heading, rows]) => (
              <Card key={heading as string}>
                <CardHeader>
                  <CardTitle>{heading as string}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {(rows as { name: string; count: number }[]).map((row) => (
                    <div key={row.name} className="flex justify-between gap-2 border-b pb-2 text-sm">
                      <span className="min-w-0 break-words">{row.name}</span>
                      <strong>{row.count}</strong>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Records needing attention</CardTitle>
              <CardDescription>
                Calls and visit requests use the selected dates. Company handlers and unverified payment plans reflect
                current lead records. Open a source record to review the gap and its surrounding history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.qualityIssues.length === 0 ? (
                <p className="text-muted-foreground text-sm">No records needing attention in this scope.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Ghana date</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Staff / pool</TableHead>
                      <TableHead>Record</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.qualityIssues.map((issue) => (
                      <TableRow key={`${issue.kind}-${issue.id}`}>
                        <TableCell className="min-w-36 whitespace-normal font-medium">{issue.kind}</TableCell>
                        <TableCell>{issue.date}</TableCell>
                        <TableCell className="min-w-40 whitespace-normal">{issue.client}</TableCell>
                        <TableCell className="min-w-32 whitespace-normal">{issue.owner}</TableCell>
                        <TableCell>
                          <Link className="text-primary underline-offset-2 hover:underline" href={issue.recordUrl}>
                            Open record
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Call register</CardTitle>
              <CardDescription>
                Includes current Call entries and historical Pipeline updates marked Phone Call. Follow-up dates remain
                visible.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ghana date</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.calls
                    .slice()
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {new Date(entry.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Accra" })}
                        </TableCell>
                        <TableCell>{entry.agentName ?? entry.agentKey}</TableCell>
                        <TableCell>
                          <Link
                            className="text-primary underline-offset-2 hover:underline"
                            href={`${back}/${entry.leadId}`}
                          >
                            {entry.client}
                          </Link>
                        </TableCell>
                        <TableCell>{entry.outcome ?? "Unspecified"}</TableCell>
                        <TableCell>{entry.follow ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Client records</CardTitle>
              <CardDescription>
                One deal at a time. Conversations, calls, visits and receipts use the selected dates; value, balance and
                recorded visit cost are current snapshots.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {report.clients.length === 0 && (
                <p className="text-muted-foreground text-sm">No clients match these filters.</p>
              )}
              {report.clients.map((client) => (
                <div key={client.lead.id} className="min-w-0 rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link
                        className="font-semibold text-primary hover:underline"
                        href={`${client.lead.agent === "company" ? "/dashboard/company-leads" : "/dashboard/pipeline"}/${client.lead.id}`}
                      >
                        {client.lead.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {client.ownerName} · Added {client.lead.date} · Stage {client.lead.stage} ·{" "}
                        {salesPaymentPlanLabel(client.lead.paymentPlan)}
                      </p>
                    </div>
                    <span className="text-sm font-medium">{ghs(client.lead.grandTotal)}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <p>
                      Approved in period: <strong>{ghs(client.paidInPeriod)}</strong>
                    </p>
                    <p>
                      Paid to date: <strong>{ghs(client.paidToDate)}</strong>
                    </p>
                    <p>
                      Outstanding: <strong>{ghs(client.outstanding)}</strong>
                    </p>
                    <p>
                      Attributed visit cost: <strong>{ghs(client.attributedVisitCost)}</strong>
                    </p>
                  </div>
                  <p className="mt-2 text-xs">
                    {client.calls.length} calls · {client.conversations.length} conversations · {client.visits.length}{" "}
                    scheduled visits · {client.approvedPayments.length} approved receipts in period
                  </p>
                  <p className="mt-2 text-sm">
                    Next action: {client.lead.nextAction || "Not recorded"}
                    {client.lead.nextActionDate ? ` · Due ${client.lead.nextActionDate}` : ""}
                  </p>
                  {client.conversations.slice(0, 3).map((entry) => (
                    <p key={entry.id} className="mt-2 break-words border-t pt-2 text-sm">
                      <span className="text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Accra" })} ·{" "}
                        {entry.channel} · {names[entry.authorKey] ?? entry.authorKey}
                      </span>
                      <br />
                      {entry.body}
                      {entry.nextAction ? ` · Next: ${entry.nextAction}` : ""}
                    </p>
                  ))}
                  {client.conversations.length > 3 && (
                    <p className="text-muted-foreground mt-2 text-xs">
                      All {client.conversations.length} conversations are included in the PDF.
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-xs">
            Payments are approved client receipts, not booked sales or verified bank cash. A scheduled visit is not
            proof of attendance. Historical owner and stage transitions cannot be reconstructed from current records.
          </p>
        </>
      )}
    </div>
  );
}


