"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

type Visit = {
  id:string; agent_key:string; agent_name:string; name:string; site:string|null;
  visit_date:string; visit_time:string|null; status:string|null; source:string|null;
  attended:boolean|null; deleted_at:string|null; feedback_after:string|null;
  lead_id:string|null; rescheduled_at:string|null; created_at:string;
};
type Staff = {agent_key:string;name:string;active:boolean};
type VisitData = {visits:Visit[];staff:Staff[]};
type Outcome = 'all'|'attended'|'not-attended'|'cancelled'|'pending';

async function allPages(make:(from:number,to:number)=>PromiseLike<{data:Visit[]|null;error:{message:string}|null}>):Promise<Visit[]> {
  const rows:Visit[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await make(offset,offset+999);
    if(error) throw new Error(error.message);
    rows.push(...(data??[]));
    if((data??[]).length<1000) return rows;
  }
}
async function loadVisits(key:string,manager:boolean,from:string,to:string,staffKey:string):Promise<VisitData>{
  const db=requireSupabase();
  const scope=manager?staffKey:key;
  const [visits,staff]=await Promise.all([
    allPages((a,b)=>{
      let q=db.from('site_visits').select('id,agent_key,agent_name,name,site,visit_date,visit_time,status,source,attended,deleted_at,feedback_after,lead_id,rescheduled_at,created_at').gte('visit_date',from).lte('visit_date',to).order('visit_date',{ascending:false});
      if(scope) q=q.eq('agent_key',scope);
      return q.range(a,b);
    }),
    manager?db.from('profiles').select('agent_key,name,active').neq('role','manager').order('name').then(({data,error})=>{if(error)throw new Error(error.message);return(data??[]) as Staff[]}):Promise.resolve([] as Staff[]),
  ]);
  return {visits,staff};
}
function outcome(v:Visit):Exclude<Outcome,'all'>{
  if(v.deleted_at) return 'cancelled';
  if(v.attended===true) return 'attended';
  if(v.attended===false) return 'not-attended';
  return 'pending';
}
function outcomeLabel(value:Exclude<Outcome,'all'>):string{
  return {'attended':'Attended','not-attended':'Did not attend',cancelled:'Cancelled',pending:'Unconfirmed'}[value];
}
function percent(part:number,total:number){return total?((part/total)*100).toFixed(1)+'%':'—';}
function weekOf(day:string){
  const d=new Date(day+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
function nextY(doc:jsPDF,y:number){
  const bottom=(doc as jsPDF&{lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??y;
  if(bottom>245){doc.addPage();return 20}
  return bottom+12;
}

export function SiteVisitReportsScreen(){
  const profile=useAuthStore((s)=>s.profile);
  const queryClient=useQueryClient();
  const manager=profile?.role==='manager';
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Accra'});
  const [from,setFrom]=useState(today.slice(0,7)+'-01');
  const [to,setTo]=useState(today);
  const [staffKey,setStaffKey]=useState('');
  const [site,setSite]=useState('');
  const [source,setSource]=useState('');
  const [status,setStatus]=useState<Outcome>('all');
  const [pdfBusy,setPdfBusy]=useState(false);
  const [pdfError,setPdfError]=useState('');
  const valid=!!from&&!!to&&from<=to;
  const report=useQuery({queryKey:['site-visit-report',profile?.key,manager,from,to,staffKey],queryFn:()=>loadVisits(profile!.key,manager,from,to,staffKey),enabled:!!profile&&valid,staleTime:60000});
  useEffect(()=>{
    if(!profile?.key)return;
    const db=requireSupabase();
    const channel=db.channel(`site-visit-report-${profile.key}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'site_visits'},()=>{
        void queryClient.invalidateQueries({queryKey:['site-visit-report']});
      }).subscribe();
    return ()=>{void db.removeChannel(channel)};
  },[profile?.key,queryClient]);
  const visits=report.data?.visits??[];
  const sites=useMemo(()=>[...new Set(visits.map((v)=>v.site?.trim()).filter((v):v is string=>!!v))].sort(),[visits]);
  const sources=useMemo(()=>[...new Set(visits.map((v)=>v.source?.trim()).filter((v):v is string=>!!v))].sort(),[visits]);
  const filtered=useMemo(()=>visits.filter((v)=>(!site||v.site?.trim()===site)&&(!source||v.source?.trim()===source)&&(status==='all'||outcome(v)===status)),[visits,site,source,status]);
  const counts=useMemo(()=>({
    records:filtered.length,
    attended:filtered.filter((v)=>outcome(v)==='attended').length,
    noShow:filtered.filter((v)=>outcome(v)==='not-attended').length,
    cancelled:filtered.filter((v)=>outcome(v)==='cancelled').length,
    unconfirmed:filtered.filter((v)=>outcome(v)==='pending').length,
    pastUnconfirmed:filtered.filter((v)=>outcome(v)==='pending'&&v.visit_date<today).length,
    withFeedback:filtered.filter((v)=>!!v.feedback_after?.trim()).length,
    linked:filtered.filter((v)=>!!v.lead_id).length,
    rescheduled:filtered.filter((v)=>!!v.rescheduled_at).length,
  }),[filtered,today]);
  const activeBookings=counts.records-counts.cancelled;
  const recordedOutcomes=counts.attended+counts.noShow;
  const trend=useMemo(()=>{
    const byWeek=new Map<string,{week:string,visits:number,attended:number}>();
    for(const visit of filtered){
      const week=weekOf(visit.visit_date);
      const item=byWeek.get(week)??{week,visits:0,attended:0};
      item.visits++;
      if(outcome(visit)==='attended') item.attended++;
      byWeek.set(week,item);
    }
    return [...byWeek.values()].sort((a,b)=>a.week.localeCompare(b.week));
  },[filtered]);
  async function download(){
    if(!report.data||!profile)return;
    setPdfBusy(true);setPdfError('');
    try{
      const doc=new jsPDF();
      const staffLabel=manager?(report.data.staff.find((s)=>s.agent_key===staffKey)?.name??'All staff'):profile.name;
      let y=pdfBrandedHeader(doc,'Site visits report',from+' to '+to,[staffLabel,'Generated '+new Date().toLocaleString('en-GB',{timeZone:'Africa/Accra'})],null);
      doc.setFontSize(9);
      doc.text('Date basis: scheduled visit date. Attendance is counted only when explicitly marked.',14,y);y+=6;
      doc.text('Unconfirmed is not a no-show. Staff follow-up text is not a client survey.',14,y);y+=6;
      doc.text('A linked lead is not a sale. Rates exclude cancelled records.',14,y);y+=13;
      y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Scope and outcomes');
      autoTable(doc,{startY:y,margin:{left:14,right:14},body:[
        ['Site',site||'All sites'],['Source',source||'All sources'],['Outcome',status==='all'?'All outcomes':outcomeLabel(status)],
        ['Visit records in scope',counts.records],['Attended',counts.attended],['Explicitly not attended',counts.noShow],
        ['Cancelled',counts.cancelled],['Attendance not recorded',counts.unconfirmed],['Past visits with unknown attendance',counts.pastUnconfirmed],
        ['Outcome recording coverage',percent(recordedOutcomes,activeBookings)],['Attended among recorded outcomes',percent(counts.attended,recordedOutcomes)],
        ['Staff follow-up text recorded',counts.withFeedback],['Linked to pipeline lead',counts.linked],['Unlinked to pipeline lead',counts.records-counts.linked],['Rescheduled',counts.rescheduled],
      ].map(([label,value])=>[String(label),String(value)]),theme:'striped',styles:{fontSize:9,cellPadding:2},columnStyles:{0:{fontStyle:'bold'}}});
      y=nextY(doc,y);
      if(y>195){doc.addPage();y=20}
      y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Visit records versus attended',trend.length>8?'Latest 8 weeks of '+trend.length:'Weekly trend');
      if(trend.length){
        const points=trend.slice(-8);
        const max=Math.max(1,...points.map((p)=>p.visits));
        const chartTop=y+3;
        const base=chartTop+25;
        const width=182/points.length;
        doc.setDrawColor(195,204,216);doc.line(14,base,196,base);
        points.forEach((p,i)=>{
          const x=14+i*width+width/2;
          const planned=21*p.visits/max;
          const attended=21*p.attended/max;
          doc.setFillColor(20,48,93);doc.rect(x-6,base-planned,5,planned,'F');
          if(attended){doc.setFillColor(185,155,55);doc.rect(x+1,base-attended,5,attended,'F')}
          doc.setFontSize(7);doc.setTextColor(71,85,105);
          doc.text(p.week.slice(5),x,base+5,{align:'center'});
        });
        doc.setFontSize(8);doc.setTextColor(20,48,93);doc.text('Visit records',14,base+12);
        doc.setTextColor(145,114,25);doc.text('Attended',41,base+12);
        y=base+15;
      } else {doc.setFontSize(9);doc.text('No visits in this period.',16,y);y+=12}
      doc.setTextColor(0,0,0);
      if(y>245){doc.addPage();y=20}
      y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Visit register',filtered.length+' records');
      autoTable(doc,{startY:y,margin:{left:14,right:14,bottom:18},head:[['Visit date','Staff','Client','Site','Outcome','Lead','Feedback']],body:filtered.map((v)=>[v.visit_date,v.agent_name,v.name,v.site??'—',outcomeLabel(outcome(v)),v.lead_id?'Linked':'—',v.feedback_after?'Recorded':'—']),theme:'grid',styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[11,30,61]}});
      pdfReportFooter(doc,'Palmstead');
      doc.save('Palmstead-site-visits-'+from+'-to-'+to+'.pdf');
    }catch(cause){setPdfError(cause instanceof Error?cause.message:'Could not create the PDF.')}finally{setPdfBusy(false)}
  }
  return <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 p-4 pb-12 md:p-8">
    <Button asChild variant="ghost" className="self-start"><Link href="/dashboard/site-visits"><ArrowLeft className="size-4"/>Back to site visits</Link></Button>
    <div><p className="text-sm font-medium text-primary">Site visit insights</p><h1 className="text-3xl font-semibold tracking-tight">Site visits report</h1><p className="mt-1 text-muted-foreground">Visit records, confirmed outcomes and pipeline linkage. Counts use the scheduled visit date.</p></div>
    <Card><CardHeader><CardTitle>Report filters</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">From<Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">To<Input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
      {manager&&<label className="grid gap-1 text-sm">Staff<select className="h-9 min-w-40 rounded-md border bg-background px-3" value={staffKey} onChange={(e)=>setStaffKey(e.target.value)}><option value="">All staff</option>{report.data?.staff.map((s)=><option key={s.agent_key} value={s.agent_key}>{s.name}{s.active?'':' (former)'}</option>)}</select></label>}
      <label className="grid gap-1 text-sm">Site<select className="h-9 min-w-36 max-w-56 rounded-md border bg-background px-3" value={site} onChange={(e)=>setSite(e.target.value)}><option value="">All sites</option>{sites.map((v)=><option key={v}>{v}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Source<select className="h-9 min-w-36 max-w-56 rounded-md border bg-background px-3" value={source} onChange={(e)=>setSource(e.target.value)}><option value="">All sources</option>{sources.map((v)=><option key={v}>{v}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Outcome<select className="h-9 min-w-40 rounded-md border bg-background px-3" value={status} onChange={(e)=>setStatus(e.target.value as Outcome)}><option value="all">All outcomes</option><option value="attended">Attended</option><option value="not-attended">Did not attend</option><option value="pending">Unconfirmed</option><option value="cancelled">Cancelled</option></select></label>
      <Button onClick={download} disabled={!report.data||pdfBusy}><Download className="size-4"/>{pdfBusy?'Preparing…':'Download filtered PDF'}</Button>
    </CardContent></Card>
    {!valid&&<p role="alert" className="text-destructive">Choose a valid date range.</p>}
    {report.isLoading&&<p>Loading site visits…</p>}
    {report.error&&<p role="alert" className="text-destructive">Could not load visits: {String(report.error)}</p>}
    {pdfError&&<p role="alert" className="text-destructive">{pdfError}</p>}
    {report.data&&<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Visit records',counts.records],['Attended',counts.attended],['Attendance unknown',counts.unconfirmed],
        ['Past visits still unconfirmed',counts.pastUnconfirmed],['Did not attend',counts.noShow],['Cancelled',counts.cancelled],
        ['Outcome recording coverage',percent(recordedOutcomes,activeBookings)],['Attended among recorded outcomes',percent(counts.attended,recordedOutcomes)],
        ['Staff follow-up text',counts.withFeedback],['Linked leads',counts.linked],['Unlinked visits',counts.records-counts.linked],['Rescheduled',counts.rescheduled],
      ].map(([label,value])=><Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Visits by scheduled week</CardTitle></CardHeader><CardContent>{trend.length?<div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="week" tick={{fontSize:11}}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="visits" fill="#14305d" name="Visit records" radius={[4,4,0,0]}/><Bar dataKey="attended" fill="#b99b37" name="Attended" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>:<p className="text-sm text-muted-foreground">No visits in this period.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Visit register</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b">{['Date','Staff','Client','Site','Outcome','Lead','Feedback'].map((h)=><th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead><tbody>{filtered.map((v)=><tr key={v.id} className="border-b last:border-0"><td className="py-2 pr-3">{v.visit_date}</td><td className="py-2 pr-3">{v.agent_name}</td><td className="py-2 pr-3">{v.name}</td><td className="py-2 pr-3">{v.site||'—'}</td><td className="py-2 pr-3">{outcomeLabel(outcome(v))}</td><td className="py-2 pr-3">{v.lead_id?'Linked':'—'}</td><td className="py-2 pr-3">{v.feedback_after?'Recorded':'—'}</td></tr>)}</tbody></table>{!filtered.length&&<p className="py-4 text-sm text-muted-foreground">No visits match these filters.</p>}</div></CardContent></Card>
      <p className="text-xs text-muted-foreground">Outcome recording coverage = attended or explicitly not attended ÷ non-cancelled records. Attendance unknown is not a no-show. Staff follow-up text is not a client survey. A linked lead does not establish a sale.</p>
    </>}
  </main>;
}

