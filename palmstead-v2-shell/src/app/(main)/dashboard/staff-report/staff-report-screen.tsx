"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ArrowRight, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { requireSupabase } from '@/lib/supabase.client';
import { useAuthStore } from '@/stores/auth/auth-store';
import { pdfBrandedHeader, pdfReportFooter, pdfSectionTitle } from '@/webnext/shared/lib/pdfReport';

type Row = Record<string, unknown>;
type ReportSection = 'attendance' | 'calls' | 'leads' | 'visits' | 'tasks' | 'banners' | 'inspections';
type ReportRows = Record<ReportSection, Row[]>;
const sections: { id: ReportSection; title: string; url: string; columns: { key: string; title: string }[] }[] = [
  { id: 'attendance', title: 'Attendance', url: '/dashboard/attendance/reports', columns: [{ key: 'work_date', title: 'Day' }, { key: 'sign_in_at', title: 'In' }, { key: 'sign_out_at', title: 'Out' }] },
  { id: 'calls', title: 'Calls and activity', url: '/dashboard/pipeline/reports', columns: [{ key: 'created_at', title: 'When' }, { key: 'client', title: 'Client' }, { key: 'action', title: 'Action' }, { key: 'outcome', title: 'Outcome' }] },
  { id: 'leads', title: 'New leads', url: '/dashboard/pipeline/reports', columns: [{ key: 'date_added', title: 'Added' }, { key: 'name', title: 'Client' }, { key: 'stage', title: 'Stage' }, { key: 'lead_source', title: 'Source' }] },
  { id: 'visits', title: 'Site visits', url: '/dashboard/site-visits/reports', columns: [{ key: 'visit_date', title: 'Visit day' }, { key: 'name', title: 'Client' }, { key: 'site', title: 'Site' }, { key: 'status', title: 'Status' }] },
  { id: 'tasks', title: 'Scheduled work', url: '/dashboard/operations/reports', columns: [{ key: 'item_date', title: 'Day' }, { key: 'title', title: 'Task' }, { key: 'status', title: 'Status' }, { key: 'completed_at', title: 'Completed' }] },
  { id: 'banners', title: 'Banners I logged', url: '/dashboard/banners/reports', columns: [{ key: 'created_at', title: 'Logged' }, { key: 'name', title: 'Banner' }, { key: 'area', title: 'Area' }, { key: 'status', title: 'Status' }] },
  { id: 'inspections', title: 'Banner inspections I completed', url: '/dashboard/banners/reports', columns: [{ key: 'recorded_at', title: 'Recorded' }, { key: 'banner_name', title: 'Banner' }, { key: 'banner_area', title: 'Area' }, { key: 'observed_condition', title: 'Condition' }, { key: 'finding', title: 'Finding' }] },
];

async function pageRows<T extends Row>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function loadReport(key: string, from: string, to: string): Promise<ReportRows> {
  const db = requireSupabase();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in again to load your personal report.');
  const [attendance, calls, leads, visits, tasks, banners, inspectionRows] = await Promise.all([
    pageRows((a,b) => db.from('attendance_log').select('work_date,sign_in_at,sign_out_at').eq('staff_key',key).gte('work_date',from).lte('work_date',to).order('work_date',{ascending:false}).range(a,b)),
    pageRows((a,b) => db.from('activity_log').select('created_at,client,action,outcome,method').eq('agent_key',key).gte('created_at',`${from}T00:00:00+00:00`).lt('created_at',`${nextDay(to)}T00:00:00+00:00`).order('created_at',{ascending:false}).range(a,b)),
    pageRows((a,b) => db.from('leads').select('date_added,name,stage,lead_source').eq('agent_key',key).is('deleted_at',null).gte('date_added',from).lte('date_added',to).order('date_added',{ascending:false}).range(a,b)),
    pageRows((a,b) => db.from('site_visits').select('visit_date,name,site,status').eq('agent_key',key).is('deleted_at',null).gte('visit_date',from).lte('visit_date',to).order('visit_date',{ascending:false}).range(a,b)),
    pageRows((a,b) => db.from('op_todos').select('item_date,title,status,completed_at').eq('assigned_to',key).gte('item_date',from).lte('item_date',to).order('item_date',{ascending:false}).range(a,b)),
    pageRows((a,b) => db.from('banners').select('created_at,name,area,status').eq('created_by',key).gte('created_at',`${from}T00:00:00+00:00`).lt('created_at',`${nextDay(to)}T00:00:00+00:00`).order('created_at',{ascending:false}).range(a,b)),
    pageRows((a,b) => db.from('banner_inspections').select('recorded_at,observed_condition,finding,banner:banners!banner_id(name,area)').eq('inspector_id',auth.user.id).gte('recorded_at',`${from}T00:00:00+00:00`).lt('recorded_at',`${nextDay(to)}T00:00:00+00:00`).order('recorded_at',{ascending:false}).range(a,b)),
  ]);
  const inspections = inspectionRows.map((row) => {
    const banner = Array.isArray(row.banner) ? row.banner[0] : row.banner;
    return { recorded_at: row.recorded_at, banner_name: banner?.name ?? 'Unknown banner', banner_area: banner?.area ?? '—', observed_condition: row.observed_condition, finding: row.finding };
  });
  return { attendance, calls, leads, visits, tasks, banners, inspections };
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function display(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && value.includes('T')) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-GB',{timeZone:'Africa/Accra',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  return String(value);
}

export function StaffReportScreen() {
  const profile = useAuthStore((s) => s.profile);
  const today = new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Accra'});
  const [from,setFrom] = useState(`${today.slice(0,7)}-01`);
  const [to,setTo] = useState(today);
  const [selected,setSelected] = useState<ReportSection[]>(sections.map((s) => s.id));
  const [exporting,setExporting] = useState(false);
  const [exportError,setExportError] = useState('');
  const valid = from !== '' && to !== '' && from <= to;
  const report = useQuery({ queryKey:['staff-report',profile?.key,from,to],queryFn:()=>loadReport(profile!.key,from,to),enabled:!!profile?.key && valid,staleTime:60000 });
  const counts = useMemo(() => sections.map((s) => ({...s,count:report.data?.[s.id].length ?? 0})),[report.data]);

  async function download() {
    if (!report.data || !profile || !selected.length) return;
    setExporting(true);
    setExportError('');
    try {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      let y = pdfBrandedHeader(doc,'Staff activity report',`${from} to ${to}`,[profile.name,'Generated '+new Date().toLocaleString('en-GB',{timeZone:'Africa/Accra'})],null);
      doc.setFontSize(9);
      doc.text('Personal records across the selected Palmstead apps. All times are Ghana local time.',14,y);
      y += 10;
      for (const section of counts.filter((s)=>selected.includes(s.id))) {
        if (y > 250) { doc.addPage(); y = 20; }
        y = pdfSectionTitle(doc,y,pageW,section.title,`${section.count} records`);
        const rows = report.data[section.id];
        if (!rows.length) { doc.setFontSize(9); doc.text('No records in this date range.',17,y); y += 12; continue; }
        autoTable(doc,{ startY:y,margin:{left:14,right:14,bottom:18},head:[section.columns.map((c)=>c.title)],body:rows.map((r)=>section.columns.map((c)=>display(r[c.key]))),theme:'grid',styles:{fontSize:8,cellPadding:2.5,overflow:'linebreak'},headStyles:{fillColor:[11,30,61]},alternateRowStyles:{fillColor:[246,248,250]} });
        y = (doc as jsPDF & { lastAutoTable?: { finalY:number } }).lastAutoTable?.finalY ?? y + 12;
        y += 12;
      }
      pdfReportFooter(doc,'Palmstead');
      doc.save(`Palmstead-staff-report-${from}-to-${to}.pdf`);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : 'The PDF could not be generated.'); }
    finally { setExporting(false); }
  }

  return <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 p-4 pb-12 md:p-8">
    <div><p className="text-sm font-medium text-primary">My workspace</p><h1 className="text-3xl font-semibold tracking-tight">Staff Report</h1><p className="mt-1 text-muted-foreground">Review your own work across apps, then download the sections you need.</p></div>
    <Card><CardHeader><CardTitle>Report period</CardTitle></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <label className="grid gap-1 text-sm">From<Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /></label>
      <label className="grid gap-1 text-sm">To<Input type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></label>
      <Button variant="outline" onClick={()=>{setFrom(`${today.slice(0,7)}-01`);setTo(today)}}>This month</Button>
      <Button onClick={download} disabled={!valid || !report.data || !selected.length || exporting}><Download className="size-4" />{exporting ? 'Preparing PDF…' : 'Download selected PDF'}</Button>
    </CardContent></Card>
    {!valid && <p role="alert" className="text-destructive">Choose a valid date range.</p>}
    {report.isLoading && <p>Loading your records…</p>}
    {report.error && <p role="alert" className="text-destructive">Your report could not load: {String(report.error)}</p>}
    {exportError && <p role="alert" className="text-destructive">{exportError}</p>}
    {report.data && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{counts.map((section)=>
      <Card key={section.id} className="min-w-0"><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{section.title}</CardTitle><Checkbox aria-label={`Include ${section.title} in PDF`} checked={selected.includes(section.id)} onCheckedChange={(checked)=>setSelected((current)=>checked ? [...current,section.id] : current.filter((id)=>id!==section.id))} /></div></CardHeader>
      <CardContent><p className="text-3xl font-semibold">{section.count}</p><p className="text-sm text-muted-foreground">records in selected period</p><Button asChild variant="link" className="mt-3 h-auto p-0"><Link href={section.url}>Open detailed view <ArrowRight className="size-4" /></Link></Button></CardContent></Card>
    )}</div>}
    {report.data && <div className="grid gap-4">{counts.filter((s)=>selected.includes(s.id)).map((section)=><Card key={section.id} className="min-w-0"><CardHeader><CardTitle className="text-lg">{section.title}</CardTitle></CardHeader><CardContent>{section.count===0 ? <p className="text-sm text-muted-foreground">No records for this period.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b">{section.columns.map((c)=><th key={c.key} className="py-2 pr-3 font-medium">{c.title}</th>)}</tr></thead><tbody>{report.data![section.id].slice(0,20).map((row,i)=><tr key={i} className="border-b last:border-0">{section.columns.map((c)=><td key={c.key} className="max-w-64 truncate py-2 pr-3" title={display(row[c.key])}>{display(row[c.key])}</td>)}</tr>)}</tbody></table>{section.count>20 && <p className="pt-3 text-sm text-muted-foreground">Showing 20 here; the PDF contains all {section.count} records.</p>}</div>}</CardContent></Card>)}</div>}
  </main>;
}

