"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ghs } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

type Metric = "leads" | "outstanding" | "fully-paid" | "complaints";
type LeadRow = {
  id: string;
  name: string;
  agent_key: string;
  stage: string | null;
  date_added: string | null;
  grand_total: number | null;
  amt_paid: number | null;
};
type ComplaintRow = {
  id: string;
  name: string | null;
  agent_key: string;
  category: string | null;
  status: string;
  created_at: string;
};

const metrics: { key: Metric; title: string; description: string }[] = [
  { key: "leads", title: "Leads", description: "Every active lead in this view" },
  { key: "outstanding", title: "Outstanding", description: "Clients with a payment balance" },
  { key: "fully-paid", title: "Fully paid", description: "Clients whose payment meets their contract total" },
  { key: "complaints", title: "Open complaints", description: "Complaints awaiting resolution" },
];

async function loadInsight(staffKey: string, isManager: boolean, metric: Metric) {
  const client = requireSupabase();
  if (metric === "complaints") {
    const query = client.from("complaints")
      .select("id,name,agent_key,category,status,created_at")
      .order("created_at", { ascending: false });
    const { data, error } = await (isManager ? query : query.eq("agent_key", staffKey));
    if (error) throw error;
    return { leads: [] as LeadRow[], complaints: ((data ?? []) as ComplaintRow[]).filter((row) => row.status !== "Resolved") };
  }
  const query = client.from("leads")
    .select("id,name,agent_key,stage,date_added,grand_total,amt_paid")
    .is("deleted_at", null)
    .order("date_added", { ascending: false });
  const { data, error } = await (isManager ? query : query.eq("agent_key", staffKey));
  if (error) throw error;
  const leads = ((data ?? []) as LeadRow[]).filter((lead) => {
    const total = Number(lead.grand_total ?? 0);
    const paid = Number(lead.amt_paid ?? 0);
    if (metric === "outstanding") return total > paid;
    if (metric === "fully-paid") return total > 0 && paid >= total;
    return true;
  });
  return { leads, complaints: [] as ComplaintRow[] };
}

export function HomeInsightScreen({ metric: rawMetric }: { metric?: string }) {
  const metric: Metric = metrics.some((item) => item.key === rawMetric) ? rawMetric as Metric : "leads";
  const profile = useAuthStore((state) => state.profile);
  const staffKey = profile?.key;
  const isManager = profile?.role === "manager";
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["homeInsight", metric, staffKey, isManager],
    enabled: Boolean(staffKey),
    queryFn: () => loadInsight(staffKey as string, isManager, metric),
  });
  const selected = metrics.find((item) => item.key === metric)!;
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => metric === "complaints"
    ? (data?.complaints ?? []).filter((row) => `${row.name ?? ""} ${row.category ?? ""} ${row.status}`.toLowerCase().includes(term))
    : (data?.leads ?? []).filter((row) => `${row.name} ${row.agent_key} ${row.stage ?? ""}`.toLowerCase().includes(term)),
  [data, metric, term]);
  const outstanding = metric === "outstanding"
    ? (data?.leads ?? []).reduce((sum, row) => sum + Math.max(Number(row.grand_total ?? 0) - Number(row.amt_paid ?? 0), 0), 0)
    : 0;

  return (
    <main className="flex w-full min-w-0 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/dashboard/default" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Home</Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Workspace insights · {isManager ? "Company-wide" : "My records"}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{selected.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
      </div>
      <nav aria-label="Home insight sections" className="flex flex-wrap gap-2">
        {metrics.map((item) => <Link key={item.key} href={`/dashboard/default/insights?metric=${item.key}`} aria-current={metric === item.key ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${metric === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>{item.title}</Link>)}
      </nav>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm text-muted-foreground">{metric === "outstanding" ? "Balance across listed clients" : "Matching records"}</p><p className="mt-1 text-3xl font-semibold tabular-nums">{isLoading ? "…" : metric === "outstanding" ? ghs(outstanding) : rows.length}</p></div>
          <div className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={`Search ${selected.title.toLowerCase()}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" className="pl-9" /></div>
        </CardContent>
      </Card>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Could not load these records. Please try again.</p>}
      {!isLoading && !error && rows.length === 0 && <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No records match this view.</p>}
      <div className="grid gap-3">
        {metric === "complaints" ? (rows as ComplaintRow[]).map((row) => (
          <Link key={row.id} href="/dashboard/complaints" className="flex min-w-0 items-center justify-between gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary">
            <div className="min-w-0"><p className="truncate font-medium">{row.name || "Unnamed client"}</p><p className="mt-1 text-sm text-muted-foreground">{row.category || "Complaint"} · {row.status} · {row.created_at.slice(0, 10)}</p></div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )) : (rows as LeadRow[]).map((row) => (
          <Link key={row.id} href={row.agent_key === "company" ? `/dashboard/company-leads/${row.id}` : `/dashboard/pipeline/${row.id}`} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate font-medium">{row.name}</p><p className="mt-1 text-sm text-muted-foreground">{row.agent_key === "company" ? "Company lead" : isManager ? row.agent_key : "My lead"} · {row.date_added || "No date"}</p></div>
            <div className="flex items-center justify-between gap-4 sm:justify-end"><div className="text-sm tabular-nums"><p>{ghs(row.grand_total ?? 0)} total</p><p className="text-muted-foreground">{ghs(Math.max(Number(row.grand_total ?? 0) - Number(row.amt_paid ?? 0), 0))} due</p></div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></div>
          </Link>
        ))}
      </div>
    </main>
  );
}

