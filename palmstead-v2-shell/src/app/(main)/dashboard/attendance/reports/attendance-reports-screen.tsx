"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ArrowLeft, Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireSupabase } from '@/lib/supabase.client';
import { useAuthStore } from '@/stores/auth/auth-store';
import { pdfBrandedHeader, pdfReportFooter, pdfSectionTitle } from '@/webnext/shared/lib/pdfReport';

type AttendanceRow = { id: string; staff_key: string; staff_name: string; work_date: string; sign_in_at: string | null; sign_out_at: string | null; late_reason: string | null; is_off_site_in: boolean | null; is_off_site_out: boolean | null };
type ExceptionRow = { id: string; staff_key: string; exception_date: string; exception_type: string; status: string; reason: string | null };
type Policy = { work_start_time: string; work_end_time: string; grace_minutes: number; effective_from: string; work_days: number[] | null };
type Staff = { agent_key: string; name: string; active: boolean };
type AttendanceData = { rows: AttendanceRow[]; exceptions: ExceptionRow[]; policies: Policy[]; staff: Staff[] };

async function allPages<T>(make: (from: number,to: number)=>PromiseLike<{ data:T[]|null; error:{message:string}|null }>): Promise<T[]> {
  const result:T[]=[];
  for (let from=0;;from+=1000) {
    const {data,error}=await make(from,from+999);
    if(error) throw new Error(error.message);
    result.push(...(data??[]));
    if((data??[]).length<1000) return result;
  }
}

async function loadAttendance(key: string, manager: boolean, from: string, to: string, staffKey: string): Promise<AttendanceData> {
  const db=requireSupabase();
  const scope=manager ? staffKey : key;
  const [rows,exceptions,policies,staff]=await Promise.all([
    allPages<AttendanceRow>((a,b)=>{
      let q=db.from('attendance_log').select('id,staff_key,staff_name,work_date,sign_in_at,sign_out_at,late_reason,is_off_site_in,is_off_site_out').gte('work_date',from).lte('work_date',to).order('work_date',{ascending:false});
      if(scope) q=q.eq('staff_key',scope);
      return q.range(a,b);
    }),
    allPages<ExceptionRow>((a,b)=>{
      let q=db.from('attendance_exceptions').select('id,staff_key,exception_date,exception_type,status,reason').gte('exception_date',from).lte('exception_date',to).order('exception_date',{ascending:false});
      if(scope) q=q.eq('staff_key',scope);
      return q.range(a,b);
    }),
    db.from('attendance_policy').select('work_start_time,work_end_time,grace_minutes,effective_from,work_days').lte('effective_from',to).order('effective_from',{ascending:false}).then(({data,error})=>{if(error)throw new Error(error.message);return (data??[]) as Policy[]}),
    manager ? db.from('profiles').select('agent_key,name,active').neq('role','manager').order('name').then(({data,error})=>{if(error)throw new Error(error.message);return (data??[]) as Staff[]}) : Promise.resolve([] as Staff[]),
  ]);
  return {rows,exceptions,policies,staff};
}

function policyFor(day:string,policies:Policy[]):Policy|undefined { return policies.find((p)=>p.effective_from<=day); }
function localTime(value:string|null):string {
  if(!value) return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-GB',{timeZone:'Africa/Accra',hour:'2-digit',minute:'2-digit',hour12:false});
}
function workMinutes(row:AttendanceRow):number {
  if(!row.sign_in_at||!row.sign_out_at) return 0;
  const diff=(new Date(row.sign_out_at).getTime()-new Date(row.sign_in_at).getTime())/60000;
  return Number.isFinite(diff)&&diff>0 ? diff : 0;
}
function lateMinutes(row:AttendanceRow,policies:Policy[]):number|null {
  if(!row.sign_in_at) return null;
  const policy=policyFor(row.work_date,policies);
  if(!policy || !/^\d\d:\d\d/.test(policy.work_start_time)) return null;
  const weekday=new Date(`${row.work_date}T00:00:00Z`).getUTCDay();
  if(policy.work_days?.length && !policy.work_days.includes(weekday)) return null;
  const local=new Date(row.sign_in_at).toLocaleTimeString('en-GB',{timeZone:'Africa/Accra',hour:'2-digit',minute:'2-digit',hour12:false});
  const [hour,minute]=local.split(':').map(Number);
  const [startHour,startMinute]=policy.work_start_time.split(':').map(Number);
  return Math.max(0,hour*60+minute-startHour*60-startMinute-policy.grace_minutes);
}
function hours(minutes:number):string {return `${(minutes/60).toFixed(1)} h`;}
function makeDays(from:string,to:string,rows:AttendanceRow[]) {
  const weeks=new Map<string,{week:string,days:number,hours:number}>();
  for(const row of rows){
    const date=new Date(`${row.work_date}T00:00:00Z`);
    const monday=new Date(date);monday.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
    const week=monday.toISOString().slice(0,10);
    const item=weeks.get(week)??{week,days:0,hours:0};item.days++;item.hours+=workMinutes(row)/60;weeks.set(week,item);
  }
  return [...weeks.values()].sort((a,b)=>a.week.localeCompare(b.week));
}

export function AttendanceReportsScreen(){
  const profile=useAuthStore((s)=>s.profile);
  const manager=profile?.role==='manager';
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Accra'});
  const [from,setFrom]=useState(`${today.slice(0,7)}-01`);
  const [to,setTo]=useState(today);
  const [staffKey,setStaffKey]=useState('');
  const [pdfBusy,setPdfBusy]=useState(false);
  const [pdfError,setPdfError]=useState('');
  const valid=!!from&&!!to&&from<=to;
  const report=useQuery({queryKey:['attendance-report',profile?.key,manager,from,to,staffKey],queryFn:()=>loadAttendance(profile!.key,manager,from,to,staffKey),enabled:!!profile&&valid,staleTime:60000});
  const rows=report.data?.rows??[];
  const policies=report.data?.policies??[];
  const summary=useMemo(()=>({
    recorded:rows.length,
    complete:rows.filter((r)=>r.sign_in_at&&r.sign_out_at).length,
    open:rows.filter((r)=>r.sign_in_at&&!r.sign_out_at).length,
    minutes:rows.reduce((sum,r)=>sum+workMinutes(r),0),
    late:rows.filter((r)=>(lateMinutes(r,policies)??0)>0).length,
    offSite:rows.filter((r)=>r.is_off_site_in||r.is_off_site_out).length,
    exceptions:report.data?.exceptions.length??0,
  }),[rows,policies,report.data?.exceptions.length]);
  const trend=useMemo(()=>makeDays(from,to,rows),[from,to,rows]);

  async function download(){
    if(!report.data||!profile) return;
    setPdfBusy(true);setPdfError('');
    try{
      const doc=new jsPDF();
      const staffLabel=manager ? (report.data.staff.find((s)=>s.agent_key===staffKey)?.name??'All staff') : profile.name;
      const pageW=doc.internal.pageSize.getWidth();
      let y=pdfBrandedHeader(doc,'Attendance report',`${from} to ${to}`,[staffLabel,'Generated '+new Date().toLocaleString('en-GB',{timeZone:'Africa/Accra'})],null);
      doc.setFontSize(9);doc.text('Recorded check-ins only. Unmarked days are not classified as absences.',14,y);y+=12;
      y=pdfSectionTitle(doc,y,pageW,'Summary');
      const metrics=[['Recorded days',summary.recorded],['Complete shifts',summary.complete],['Open shifts',summary.open],['Worked hours from complete shifts',hours(summary.minutes)],['Late check-ins vs policy',summary.late],['Off-site records',summary.offSite],['Exception requests',summary.exceptions]];
      autoTable(doc,{startY:y,margin:{left:14,right:14},body:metrics.map(([label,value])=>[String(label),String(value)]),theme:'striped',styles:{fontSize:9},columnStyles:{0:{fontStyle:'bold'}}});
      y=((doc as jsPDF&{lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??y)+12;
      if(y>245){doc.addPage();y=20}y=pdfSectionTitle(doc,y,pageW,'Daily register',`${rows.length} records`);
      autoTable(doc,{startY:y,margin:{left:14,right:14,bottom:18},head:[['Date','Staff','In','Out','Hours','Late','Location']],body:rows.map((r)=>[r.work_date,r.staff_name,localTime(r.sign_in_at),localTime(r.sign_out_at),r.sign_out_at?hours(workMinutes(r)):'—',lateMinutes(r,policies)==null?'—':`${lateMinutes(r,policies)} min`,r.is_off_site_in||r.is_off_site_out?'Off-site':'Office']),theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[11,30,61]}});
      y=((doc as jsPDF&{lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??y)+12;
      if(y>245){doc.addPage();y=20}y=pdfSectionTitle(doc,y,pageW,'Exception requests',`${report.data.exceptions.length} records`);
      if(report.data.exceptions.length)autoTable(doc,{startY:y,margin:{left:14,right:14,bottom:18},head:[['Date','Type','Status','Reason']],body:report.data.exceptions.map((r)=>[r.exception_date,r.exception_type,r.status,r.reason??'—']),theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[11,30,61]}});
      else {doc.setFontSize(9);doc.text('No exception requests in this period.',17,y)}
      pdfReportFooter(doc,'Palmstead');doc.save(`Palmstead-attendance-${from}-to-${to}.pdf`);
    }catch(cause){setPdfError(cause instanceof Error?cause.message:'Could not create the PDF.')}finally{setPdfBusy(false)}
  }

  return <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 p-4 pb-12 md:p-8">
    <Button asChild variant="ghost" className="self-start"><Link href="/dashboard/attendance"><ArrowLeft className="size-4"/>Back to attendance</Link></Button>
    <div><p className="text-sm font-medium text-primary">Attendance insights</p><h1 className="text-3xl font-semibold tracking-tight">Attendance report</h1><p className="mt-1 text-muted-foreground">Recorded presence, worked time and exceptions. Unmarked days are not treated as absences.</p></div>
    <Card><CardHeader><CardTitle>Report filters</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">From<Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">To<Input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
      {manager&&<label className="grid gap-1 text-sm">Staff<select className="h-9 min-w-48 rounded-md border bg-background px-3" value={staffKey} onChange={(e)=>setStaffKey(e.target.value)}><option value="">All staff</option>{report.data?.staff.map((s)=><option key={s.agent_key} value={s.agent_key}>{s.name}{s.active?'':' (former)'}</option>)}</select></label>}
      <Button onClick={download} disabled={!report.data||pdfBusy}><Download className="size-4"/>{pdfBusy?'Preparing…':'Download PDF'}</Button>
    </CardContent></Card>
    {!valid&&<p role="alert" className="text-destructive">Choose a valid date range.</p>}
    {report.isLoading&&<p>Loading attendance…</p>}
    {report.error&&<p role="alert" className="text-destructive">Could not load attendance: {String(report.error)}</p>}
    {pdfError&&<p role="alert" className="text-destructive">{pdfError}</p>}
    {report.data&&<><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Recorded days',summary.recorded],['Worked hours',hours(summary.minutes)],['Late check-ins',summary.late],['Open shifts',summary.open],['Complete shifts',summary.complete],['Off-site records',summary.offSite],['Exception requests',summary.exceptions]
    ].map(([label,value])=><Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Recorded days by week</CardTitle></CardHeader><CardContent>{trend.length ? <div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="week" tick={{fontSize:11}}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="days" fill="#14305d" name="Recorded days" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>:<p className="text-sm text-muted-foreground">No check-ins in this period.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Daily register</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b">{['Day','Staff','In','Out','Hours','Late','Location'].map((h)=><th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead><tbody>{rows.map((r)=><tr key={r.id} className="border-b last:border-0"><td className="py-2 pr-3">{r.work_date}</td><td className="py-2 pr-3">{r.staff_name}</td><td className="py-2 pr-3">{localTime(r.sign_in_at)}</td><td className="py-2 pr-3">{localTime(r.sign_out_at)}</td><td className="py-2 pr-3">{r.sign_out_at?hours(workMinutes(r)):'—'}</td><td className="py-2 pr-3">{lateMinutes(r,policies)==null?'—':`${lateMinutes(r,policies)} min`}</td><td className="py-2 pr-3">{r.is_off_site_in||r.is_off_site_out?'Off-site':'Office'}</td></tr>)}</tbody></table>{!rows.length&&<p className="py-4 text-sm text-muted-foreground">No recorded check-ins in this period.</p>}</div></CardContent></Card>
    <Card><CardHeader><CardTitle>Exception requests</CardTitle></CardHeader><CardContent>{report.data.exceptions.length?<div className="space-y-2">{report.data.exceptions.map((r)=><div key={r.id} className="flex flex-wrap gap-2 border-b py-2 text-sm"><span>{r.exception_date}</span><strong>{r.exception_type}</strong><span>{r.status}</span><span className="text-muted-foreground">{r.reason}</span></div>)}</div>:<p className="text-sm text-muted-foreground">No exception requests in this period.</p>}</CardContent></Card></>}
  </main>;
}
