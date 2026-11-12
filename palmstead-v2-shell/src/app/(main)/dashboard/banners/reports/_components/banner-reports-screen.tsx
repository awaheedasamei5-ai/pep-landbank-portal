"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ArrowLeft, Download, MapPin } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";
import { pdfBrandedHeader, pdfReportFooter, pdfSectionTitle } from "@/webnext/shared/lib/pdfReport";

type BannerRow = {
  id: string;
  name: string;
  area: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string | null;
};
type UpdateRow = { id: string; banner_id: string; status: string; changed_by_name: string | null; created_at: string };
type LeadRow = { banner_id: string | null };
type InspectionRow = {
  id: string;
  banner_id: string;
  inspector_id: string;
  observed_condition: string;
  finding: string;
  gps_accuracy_m: number | null;
  recorded_at: string;
  inspector: { name: string } | { name: string }[] | null;
};
type Data = { banners: BannerRow[]; updates: UpdateRow[]; inspections: InspectionRow[]; leadCounts: Record<string, number> | null };
type DateBasis = "added" | "last-update" | "last-inspection";
const statusNames: Record<string, string> = {
  placed: "Good condition",
  needs_maintenance: "Needs maintenance",
  being_replaced: "Being replaced",
  location_only: "Scouted only",
};
const statusOrder = ["placed", "needs_maintenance", "being_replaced", "location_only"];
function label(status: string) {
  return statusNames[status] ?? status.replace(/_/g, " ");
}
function inspectorName(row: InspectionRow) {
  const person = Array.isArray(row.inspector) ? row.inspector[0] : row.inspector;
  return person?.name ?? "Staff";
}
function validPoint(b: BannerRow) {
  return (
    b.lat != null &&
    b.lng != null &&
    Number.isFinite(b.lat) &&
    Number.isFinite(b.lng) &&
    Math.abs(b.lat) <= 90 &&
    Math.abs(b.lng) <= 180
  );
}
function areaKey(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}
function monthKey(value: string) {
  return value.slice(0, 7);
}
function monthName(value: string) {
  return new Date(value + "-01T00:00:00Z").toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
async function pages<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await make(start, start + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) return all;
  }
}
async function loadData(): Promise<Data> {
  const db = requireSupabase();
  const [banners, updates, inspections, leads] = await Promise.all([
    pages<BannerRow>((a, b) =>
      db
        .from("banners")
        .select("id,name,area,status,lat,lng,created_by,created_by_name,created_at,updated_at")
        .order("created_at", { ascending: false })
        .range(a, b),
    ),
    pages<UpdateRow>((a, b) =>
      db
        .from("banner_status_log")
        .select("id,banner_id,status,changed_by_name,created_at")
        .order("created_at", { ascending: false })
        .range(a, b),
    ),
    pages<InspectionRow>((a, b) =>
      db.from("banner_inspections")
        .select("id,banner_id,inspector_id,observed_condition,finding,gps_accuracy_m,recorded_at,inspector:profiles!inspector_id(name)")
        .order("recorded_at", { ascending: false })
        .range(a, b),
    ),
    pages<LeadRow>((a, b) =>
      db.from("leads").select("banner_id").not("banner_id", "is", null).is("deleted_at", null).range(a, b),
    ).catch(() => null),
  ]);
  const leadCounts: Record<string, number> = {};
  if (leads)
    for (const lead of leads) if (lead.banner_id) leadCounts[lead.banner_id] = (leadCounts[lead.banner_id] ?? 0) + 1;
  return { banners, updates, inspections, leadCounts: leads ? leadCounts : null };
}

export function BannerReportsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateBasis, setDateBasis] = useState<DateBasis>("added");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [quality, setQuality] = useState("all");
  const [inspectionFilter, setInspectionFilter] = useState("all");
  const [inspector, setInspector] = useState("");
  const [inspectionAgeDays, setInspectionAgeDays] = useState(30);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const valid = !(from && to && from > to);
  const report = useQuery({
    queryKey: ["banner-operational-report", profile?.key],
    queryFn: loadData,
    enabled: !!profile,
    staleTime: 60000,
  });
  const banners = report.data?.banners ?? [];
  const bannerById = useMemo(() => new Map(banners.map((banner) => [banner.id, banner])), [banners]);
  const updates = report.data?.updates ?? [];
  const inspections = report.data?.inspections ?? [];
  const latest = useMemo(() => {
    const byId = new Map<string, UpdateRow>();
    for (const row of updates) if (!byId.has(row.banner_id)) byId.set(row.banner_id, row);
    return byId;
  }, [updates]);
  const latestInspection = useMemo(() => {
    const byId = new Map<string, InspectionRow>();
    for (const row of inspections) if (!byId.has(row.banner_id)) byId.set(row.banner_id, row);
    return byId;
  }, [inspections]);
  const inspectors = useMemo(
    () => [...new Map(inspections.map((row) => [row.inspector_id, inspectorName(row)]))].sort((a, b) => a[1].localeCompare(b[1])),
    [inspections],
  );
  const areas = useMemo(
    () =>
      [...new Map(banners.filter((b) => areaKey(b.area)).map((b) => [areaKey(b.area), b.area!.trim()])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1]),
      ),
    [banners],
  );
  const owners = useMemo(
    () =>
      [
        ...new Map(
          banners.filter((b) => b.created_by).map((b) => [b.created_by!, b.created_by_name || b.created_by!]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [banners],
  );
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
  const staleCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const inspectionCutoff = new Date(Date.now() - inspectionAgeDays * 86400000).toISOString();
  const filtered = useMemo(
    () =>
      banners.filter((b) => {
        if (area && areaKey(b.area) !== area) return false;
        if (status && b.status !== status) return false;
        if (owner && b.created_by !== owner) return false;
        if (quality === "mapped" && !validPoint(b)) return false;
        if (quality === "unmapped" && validPoint(b)) return false;
        if (quality === "stale" && latest.get(b.id)?.created_at && latest.get(b.id)!.created_at >= staleCutoff)
          return false;
        const visit = latestInspection.get(b.id);
        if (inspectionFilter === "never" && visit) return false;
        if (inspectionFilter === "recent" && (!visit || visit.recorded_at < inspectionCutoff)) return false;
        if (inspectionFilter === "needs-check" && visit && visit.recorded_at >= inspectionCutoff) return false;
        if (inspectionFilter === "finding" && (!visit || !["needs_maintenance", "being_replaced"].includes(visit.observed_condition))) return false;
        if (inspector && visit?.inspector_id !== inspector) return false;
        const date = (dateBasis === "added" ? b.created_at : dateBasis === "last-update" ? (latest.get(b.id)?.created_at ?? "") : (visit?.recorded_at ?? "")).slice(0, 10);
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
      }),
    [banners, area, status, owner, quality, latest, staleCutoff, latestInspection, inspectionFilter, inspector, inspectionCutoff, dateBasis, from, to],
  );
  const ids = useMemo(() => new Set(filtered.map((b) => b.id)), [filtered]);
  const periodUpdates = useMemo(
    () =>
      updates.filter(
        (u) =>
          ids.has(u.banner_id) &&
          (!from || u.created_at.slice(0, 10) >= from) &&
          (!to || u.created_at.slice(0, 10) <= to),
      ),
    [updates, ids, from, to],
  );
  const periodInspections = useMemo(
    () => inspections.filter((row) => ids.has(row.banner_id) && (!from || row.recorded_at.slice(0, 10) >= from) && (!to || row.recorded_at.slice(0, 10) <= to)),
    [inspections, ids, from, to],
  );
  const recentlyInspected = filtered.filter((b) => {
    const visit = latestInspection.get(b.id);
    return visit && visit.recorded_at >= inspectionCutoff;
  }).length;
  const neverInspected = filtered.filter((b) => !latestInspection.has(b.id)).length;
  const needsInspection = filtered.length - recentlyInspected;
  const mapped = filtered.filter(validPoint).length;
  const stale = filtered.filter((b) => !latest.get(b.id) || latest.get(b.id)!.created_at < staleCutoff).length;
  const good = filtered.filter((b) => b.status === "placed").length;
  const needsWork = filtered.filter((b) => b.status === "needs_maintenance" || b.status === "being_replaced").length;
  const scouted = filtered.filter((b) => b.status === "location_only").length;
  const visibleLeads = report.data?.leadCounts
    ? filtered.reduce((sum, b) => sum + (report.data!.leadCounts![b.id] ?? 0), 0)
    : null;
  const statusChart = statusOrder.map((key) => ({
    status: label(key),
    count: filtered.filter((b) => b.status === key).length,
  }));
  const months = useMemo(() => {
    const byMonth = new Map<string, { month: string; added: number; updates: number; inspections: number }>();
    for (const b of filtered) {
      const key = monthKey(b.created_at);
      const item = byMonth.get(key) ?? { month: key, added: 0, updates: 0, inspections: 0 };
      item.added++;
      byMonth.set(key, item);
    }
    for (const u of periodUpdates) {
      const key = monthKey(u.created_at);
      const item = byMonth.get(key) ?? { month: key, added: 0, updates: 0, inspections: 0 };
      item.updates++;
      byMonth.set(key, item);
    }
    for (const visit of periodInspections) {
      const key = monthKey(visit.recorded_at);
      const item = byMonth.get(key) ?? { month: key, added: 0, updates: 0, inspections: 0 };
      item.inspections++;
      byMonth.set(key, item);
    }
    return [...byMonth.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((r) => ({ ...r, label: monthName(r.month) }));
  }, [filtered, periodUpdates, periodInspections]);
  async function download() {
    if (!report.data || !profile || !valid) return;
    setPdfBusy(true);
    setPdfError("");
    try {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      let y = pdfBrandedHeader(
        doc,
        "Banner operations report",
        from || to ? `${from || "All time"} to ${to || today}` : "Inventory snapshot",
        [`Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Accra" })}`, profile.name],
        null,
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(
        "Inventory shows current condition. Dates filter " +
          (dateBasis === "added" ? "banner creation" : dateBasis === "last-update" ? "latest logged status update" : "latest physical inspection") +
          ".",
        14,
        y,
      );
      y += 7;
      y = pdfSectionTitle(doc, y, pageW, "Scope and condition");
      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        body: [
          ["Area", areas.find(([key]) => key === area)?.[1] || "All areas"],
          ["Status", status ? label(status) : "All statuses"],
          ["Logged by", owners.find(([key]) => key === owner)?.[1] || "All staff"],
          ["Map quality", quality],
          ["Inspection coverage filter", inspectionFilter === "all" ? "All banners" : inspectionFilter.replace(/-/g, " ")],
          ["Inspection lookback", `${inspectionAgeDays} days`],
          ["Banners", filtered.length],
          ["Good condition", good],
          ["Needs work", needsWork],
          ["Scouted only", scouted],
          ["Mapped coordinates", mapped],
          ["No logged update in 30 days", stale],
          ["Status entries in period", periodUpdates.length],
          [`Inspected in last ${inspectionAgeDays} days`, recentlyInspected],
          ["Never physically inspected", neverInspected],
          [`No inspection in ${inspectionAgeDays} days`, needsInspection],
          ["Physical inspections in period", periodInspections.length],
          ["Latest inspector", inspectors.find(([id]) => id === inspector)?.[1] ?? "All staff"],
          ["Visible linked leads", visibleLeads ?? "Unavailable"],
        ].map(([k, v]) => [String(k), String(v)]),
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 1.1 },
        columnStyles: { 0: { fontStyle: "bold" } },
      });
      y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      y = pdfSectionTitle(doc, y, pageW, "Condition mix");
      const max = Math.max(1, ...statusChart.map((r) => r.count));
      statusChart.forEach((row, i) => {
        const yy = y + i * 9;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(row.status, 14, yy + 4);
        doc.setFillColor(i === 0 ? 30 : 180, i === 0 ? 84 : 155, i === 0 ? 95 : 55);
        doc.rect(62, yy, (90 * row.count) / max, 5, "F");
        doc.text(String(row.count), 157, yy + 4);
      });
      y += 40;
      if (months.length) {
        if (y > 230) {
          doc.addPage();
          y = 20;
        }
        y = pdfSectionTitle(doc, y, pageW, "Monthly activity", "Latest 12 months in scope");
        autoTable(doc, {
          startY: y,
          margin: { left: 14, right: 14 },
          head: [["Month", "Banners added", "Status entries", "Physical inspections"]],
          body: months.map((row) => [row.label, row.added, row.updates, row.inspections]),
          theme: "striped",
          styles: { fontSize: 7, cellPadding: 1.1 },
        });
        y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
      }
      if (y > 245) {
        doc.addPage();
        y = 20;
      }
      y = pdfSectionTitle(doc, y, pageW, "Banner register", filtered.length + " records");
      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14, bottom: 18 },
        head: [["Banner", "Area", "Condition", "Last inspection", "Inspector", "Map", "Visible leads"]],
        body: filtered.map((b) => [
          b.name,
          b.area || "—",
          label(b.status),
          latestInspection.get(b.id)?.recorded_at.slice(0, 10) || "Never",
          latestInspection.get(b.id) ? inspectorName(latestInspection.get(b.id)!) : "—",
          validPoint(b) ? "Mapped" : "Check coordinates",
          report.data!.leadCounts == null ? "Unavailable" : (report.data!.leadCounts[b.id] ?? 0),
        ]),
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [11, 30, 61] },
      });
      if (periodInspections.length) {
        y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
        if (y > 230) { doc.addPage(); y = 20; }
        y = pdfSectionTitle(doc, y, pageW, "Physical inspection register", `${periodInspections.length} records in selected scope`);
        autoTable(doc, {
          startY: y,
          margin: { left: 14, right: 14, bottom: 18 },
          head: [["Recorded", "Banner", "Inspector", "Observed condition", "Finding", "Device accuracy"]],
          body: periodInspections.map((visit) => [
            visit.recorded_at.slice(0, 16).replace("T", " "),
            bannerById.get(visit.banner_id)?.name || "Unknown",
            inspectorName(visit),
            label(visit.observed_condition),
            visit.finding || "—",
            visit.gps_accuracy_m == null ? "Not captured" : `±${Math.round(visit.gps_accuracy_m)} m`,
          ]),
          theme: "grid",
          styles: { fontSize: 6.7, cellPadding: 1.3, overflow: "linebreak" },
          headStyles: { fillColor: [11, 30, 61] },
        });
      }
      pdfReportFooter(doc, "Palmstead");
      doc.save(`Palmstead-banner-report-${today}.pdf`);
    } catch (cause) {
      setPdfError(cause instanceof Error ? cause.message : "Could not create the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }
  return (
    <main className="flex w-full min-w-0 flex-col gap-5 p-4 pb-12 md:p-8">
      <Button asChild variant="ghost" className="self-start">
        <Link href="/dashboard/banners">
          <ArrowLeft data-icon="inline-start" />
          Back to Banner Tracking
        </Link>
      </Button>
      <div>
        <p className="text-sm font-medium text-primary">Field operations</p>
        <h1 className="text-3xl font-semibold tracking-tight">Banner report</h1>
        <p className="mt-1 text-muted-foreground">
          Current condition, inspection coverage, location quality and recorded field activity.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Report filters</CardTitle>
          <CardDescription>Choose the inventory and activity to include in the report.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="banner-date-basis">Date basis</FieldLabel>
              <select
                id="banner-date-basis"
                className="h-9 w-full rounded-md border bg-background px-3"
                value={dateBasis}
                onChange={(e) => setDateBasis(e.target.value as DateBasis)}
              >
                <option value="added">Date added</option>
                <option value="last-update">Latest status entry</option>
                <option value="last-inspection">Latest physical inspection</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-from">From</FieldLabel>
              <Input id="banner-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-to">To</FieldLabel>
              <Input id="banner-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-area">Area</FieldLabel>
              <select
                id="banner-area"
                className="h-9 w-full rounded-md border bg-background px-3"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              >
                <option value="">All areas</option>
                {areas.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-condition">Condition</FieldLabel>
              <select
                id="banner-condition"
                className="h-9 w-full rounded-md border bg-background px-3"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All conditions</option>
                {statusOrder.map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-owner">Logged by</FieldLabel>
              <select
                id="banner-owner"
                className="h-9 w-full rounded-md border bg-background px-3"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="">All staff</option>
                {owners.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-quality">Field attention</FieldLabel>
              <select
                id="banner-quality"
                className="h-9 w-full rounded-md border bg-background px-3"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="all">All locations</option>
                <option value="mapped">Mapped</option>
                <option value="unmapped">Check coordinates</option>
                <option value="stale">No update in 30 days</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-inspection">Inspection coverage</FieldLabel>
              <select id="banner-inspection" className="h-9 w-full rounded-md border bg-background px-3" value={inspectionFilter} onChange={(e) => setInspectionFilter(e.target.value)}>
                <option value="all">All banners</option>
                <option value="never">Never physically inspected</option>
                <option value="needs-check">No recent inspection</option>
                <option value="recent">Recently inspected</option>
                <option value="finding">Latest inspection needs work</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-inspection-age">Recent means within</FieldLabel>
              <select id="banner-inspection-age" className="h-9 w-full rounded-md border bg-background px-3" value={inspectionAgeDays} onChange={(e) => setInspectionAgeDays(Number(e.target.value))}>
                <option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="banner-inspector">Last inspected by</FieldLabel>
              <select id="banner-inspector" className="h-9 w-full rounded-md border bg-background px-3" value={inspector} onChange={(e) => setInspector(e.target.value)}>
                <option value="">All staff</option>
                {inspectors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Button className="self-end" onClick={download} disabled={!report.data || pdfBusy || !valid}>
              <Download data-icon="inline-start" />
              {pdfBusy ? "Preparing…" : "Download filtered PDF"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
      {!valid && (
        <p role="alert" className="text-destructive">
          Choose a valid date range.
        </p>
      )}
      {report.isLoading && <p>Loading banner records…</p>}
      {report.error && (
        <p role="alert" className="text-destructive">
          Could not load banner report: {String(report.error)}
        </p>
      )}
      {pdfError && (
        <p role="alert" className="text-destructive">
          {pdfError}
        </p>
      )}
      {report.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Banners in scope", filtered.length],
              ["Good condition", good],
              ["Needs work", needsWork],
              ["Scouted only", scouted],
              ["Mapped", mapped],
              ["No update in 30 days", stale],
              ["Status entries in period", periodUpdates.length],
              [`Inspected within ${inspectionAgeDays} days`, recentlyInspected],
              ["Never physically inspected", neverInspected],
              [`No inspection in ${inspectionAgeDays} days`, needsInspection],
              ["Physical inspections in period", periodInspections.length],
              ["Visible linked leads", visibleLeads ?? "Unavailable"],
            ].map(([k, v]) => (
              <Card key={k}>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">{k}</p>
                  <p className="mt-1 text-2xl font-semibold">{v}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Current condition</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChart} layout="vertical" margin={{ left: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="status" width={105} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--chart-2)" name="Banners" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Placements, updates and inspections</CardTitle>
              </CardHeader>
              <CardContent>
                {months.length ? (
                  <div className="h-56 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={months}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="added" fill="var(--chart-2)" name="Added" />
                        <Bar dataKey="updates" fill="var(--chart-4)" name="Status entries" />
                        <Bar dataKey="inspections" fill="var(--chart-3)" name="Physical inspections" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No activity in this scope.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Banner register</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      {["Banner", "Area", "Condition", "Last inspection", "Inspector", "Location", "Leads"].map((h) => (
                        <th key={h} className="py-2 pr-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b) => (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <Link
                            className="font-medium text-primary hover:underline"
                            href={`/dashboard/banners/${b.id}`}
                          >
                            {b.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{b.area || "—"}</td>
                        <td className="py-2 pr-3">{label(b.status)}</td>
                        <td className="py-2 pr-3">{latestInspection.get(b.id)?.recorded_at.slice(0, 10) || "Never"}</td>
                        <td className="py-2 pr-3">{latestInspection.get(b.id) ? inspectorName(latestInspection.get(b.id)!) : "—"}</td>
                        <td className="py-2 pr-3">
                          {validPoint(b) ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              Mapped
                            </span>
                          ) : (
                            "Check coordinates"
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {report.data!.leadCounts == null ? "Unavailable" : (report.data!.leadCounts[b.id] ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <p className="py-4 text-sm text-muted-foreground">No banners match these filters.</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Physical inspection register</CardTitle>
              <CardDescription>{periodInspections.length} inspection records for the selected banners and dates. Photos remain private in each banner detail.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead><tr className="border-b">{["Recorded", "Banner", "Inspector", "Observed condition", "Finding", "Device accuracy"].map((heading) => <th key={heading} className="py-2 pr-3">{heading}</th>)}</tr></thead>
                  <tbody>{periodInspections.map((visit) => <tr key={visit.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{new Date(visit.recorded_at).toLocaleString("en-GB", { timeZone: "Africa/Accra" })}</td>
                    <td className="py-2 pr-3"><Link className="font-medium text-primary hover:underline" href={`/dashboard/banners/${visit.banner_id}`}>{bannerById.get(visit.banner_id)?.name || "Banner"}</Link></td>
                    <td className="py-2 pr-3">{inspectorName(visit)}</td>
                    <td className="py-2 pr-3">{label(visit.observed_condition)}</td>
                    <td className="py-2 pr-3 max-w-72 break-words">{visit.finding || "—"}</td>
                    <td className="py-2 pr-3">{visit.gps_accuracy_m == null ? "Not captured" : `±${Math.round(visit.gps_accuracy_m)} m`}</td>
                  </tr>)}</tbody>
                </table>
                {!periodInspections.length && <p className="py-4 text-sm text-muted-foreground">No physical inspections in this scope yet.</p>}
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Status entries and physical inspections are separate records. Device coordinates are optional evidence, not proof of a visit. Lead totals include only records your role can see.
          </p>
        </>
      )}
    </main>
  );
}

