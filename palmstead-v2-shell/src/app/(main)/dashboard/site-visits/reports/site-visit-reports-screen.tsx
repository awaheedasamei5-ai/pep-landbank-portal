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
type Invite = {id:string;site_visit_id:string;sent_at:string|null;submitted_at:string|null};
type Survey = {id:string;invite_id:string;created_at:string;overall_rating:number|null;nps_score:number|null;purchase_intent:string|null};
type ApprovedPayment = {id:string;lead_id:string;amount:number;payment_date:string};
type Cost = {id:string;lead_id:string;source_id:string;amount:number};
type CostDay = {id:string;visit_date:string};
type VisitData = {visits:Visit[];staff:Staff[];invites:Invite[];surveys:Survey[];payments:ApprovedPayment[];costs:Cost[];costDays:CostDay[]};
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
  const inviteRows:Invite[]=[];
  const paymentRows:ApprovedPayment[]=[];
  const costRows:Cost[]=[];
  const visitIds=visits.map((v)=>v.id);
  const leadIds=[...new Set(visits.map((v)=>v.lead_id).filter((id):id is string=>!!id))];
  // Keep each request small enough for PostgREST URL limits. RLS still scopes every row.
  for(let offset=0;offset<visitIds.length;offset+=100){
    const {data,error}=await db.from('site_visit_experience_invites').select('id,site_visit_id,sent_at,submitted_at').in('site_visit_id',visitIds.slice(offset,offset+100));
    if(error)throw new Error(error.message);
    inviteRows.push(...((data??[]) as Invite[]));
  }
  const surveyRows:Survey[]=[];
  const inviteIds=inviteRows.map((invite)=>invite.id);
  for(let offset=0;offset<inviteIds.length;offset+=100){
    const {data,error}=await db.from('site_visit_experience_submissions').select('id,invite_id,created_at,overall_rating,nps_score,purchase_intent').in('invite_id',inviteIds.slice(offset,offset+100));
    if(error)throw new Error(error.message);
    surveyRows.push(...((data??[]) as Survey[]));
  }
  for(let offset=0;offset<leadIds.length;offset+=100){
    const ids=leadIds.slice(offset,offset+100);
    const [payments,costs]=await Promise.all([
      db.from('payments').select('id,lead_id,amount,payment_date').eq('status','approved').in('lead_id',ids),
      db.from('client_cost_attributions').select('id,lead_id,source_id,amount').eq('source_type','site_visit').in('lead_id',ids),
    ]);
    if(payments.error)throw new Error(payments.error.message);
    if(costs.error)throw new Error(costs.error.message);
    paymentRows.push(...((payments.data??[]) as ApprovedPayment[]));
    costRows.push(...((costs.data??[]) as Cost[]));
  }
  const costDays:CostDay[]=[];
  const formIds=[...new Set(costRows.map((cost)=>cost.source_id))];
  for(let offset=0;offset<formIds.length;offset+=100){
    const {data,error}=await db.from('weekly_visit_forms').select('id,visit_date').in('id',formIds.slice(offset,offset+100));
    if(error)throw new Error(error.message);
    costDays.push(...((data??[]) as CostDay[]));
  }
  return {visits,staff,invites:inviteRows,surveys:surveyRows,payments:paymentRows,costs:costRows,costDays};
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
function previousPeriod(from:string,to:string):{from:string;to:string}{
  const start=new Date(`${from}T00:00:00Z`);
  const end=new Date(`${to}T00:00:00Z`);
  const days=Math.round((end.getTime()-start.getTime())/86400000)+1;
  const priorEnd=new Date(start.getTime()-86400000);
  const priorStart=new Date(priorEnd.getTime()-(days-1)*86400000);
  return {from:priorStart.toISOString().slice(0,10),to:priorEnd.toISOString().slice(0,10)};
}
function changeLabel(current:number,previous:number):string{
  const difference=current-previous;
  return `${difference>0?'+':''}${difference} vs previous period`;
}
function nextY(doc:jsPDF,y:number){
  const bottom=(doc as jsPDF&{lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??y;
  if(bottom>245){doc.addPage();return 20}
  return bottom+12;
}

function evidence(visits:Visit[],data:VisitData|undefined){
  const inviteByVisit=new Map<string,Invite[]>();
  for(const invite of data?.invites??[]) inviteByVisit.set(invite.site_visit_id,[...(inviteByVisit.get(invite.site_visit_id)??[]),invite]);
  const submissions=new Map((data?.surveys??[]).map((survey)=>[survey.invite_id,survey]));
  const paymentByLead=new Map<string,ApprovedPayment[]>();
  for(const payment of data?.payments??[]) paymentByLead.set(payment.lead_id,[...(paymentByLead.get(payment.lead_id)??[]),payment]);
  const dayByForm=new Map((data?.costDays??[]).map((day)=>[day.id,day.visit_date]));
  const costsByLead=new Map<string,Cost[]>();
  for(const cost of data?.costs??[]) costsByLead.set(cost.lead_id,[...(costsByLead.get(cost.lead_id)??[]),cost]);
  const surveyRows:Survey[]=[];
  const paidPayments=new Map<string,ApprovedPayment>();
  const attributedCosts=new Map<string,Cost>();
  let invited=0,responded=0,linkedAttended=0,linkedAttendedPaid=0,linkedAttendedWithoutCost=0;
  for(const visit of visits){
    const invites=inviteByVisit.get(visit.id)??[];
    if(invites.some((invite)=>!!invite.sent_at)) invited++;
    const responses=invites.map((invite)=>submissions.get(invite.id)).filter((row):row is Survey=>!!row);
    if(responses.length){responded++;surveyRows.push(...responses);}
    if(outcome(visit)!=='attended'||!visit.lead_id)continue;
    linkedAttended++;
    const later=(paymentByLead.get(visit.lead_id)??[]).filter((payment)=>payment.payment_date>=visit.visit_date);
    if(later.length)linkedAttendedPaid++;
    for(const payment of later) paidPayments.set(payment.id,payment);
    const exact=(costsByLead.get(visit.lead_id)??[]).filter((cost)=>dayByForm.get(cost.source_id)===visit.visit_date);
    if(!exact.length)linkedAttendedWithoutCost++;
    for(const cost of exact)attributedCosts.set(cost.id,cost);
  }
  const ratings=surveyRows.map((row)=>Number(row.overall_rating)).filter((value)=>Number.isFinite(value)&&value>0);
  const scores=surveyRows.filter((row)=>row.nps_score!==null).map((row)=>Number(row.nps_score)).filter((value)=>Number.isFinite(value)&&value>=0&&value<=10);
  const intentCounts=[...surveyRows.reduce((items,row)=>{const label=row.purchase_intent?.trim()||'Not answered';items.set(label,(items.get(label)??0)+1);return items;},new Map<string,number>()).entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const nps=scores.length?Math.round((scores.filter((v)=>v>=9).length-scores.filter((v)=>v<=6).length)*100/scores.length):null;
  return {invited,responded,surveyResponses:surveyRows.length,ratings:ratings.length,averageRating:ratings.length?ratings.reduce((sum,value)=>sum+value,0)/ratings.length:null,nps,npsResponses:scores.length,intentCounts,linkedAttended,linkedAttendedPaid,linkedAttendedWithoutCost,approvedCash:[...paidPayments.values()].reduce((sum,row)=>sum+Number(row.amount||0),0),attributedCost:[...attributedCosts.values()].reduce((sum,row)=>sum+Number(row.amount||0),0)};
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
  const [linkFilter,setLinkFilter]=useState<'all'|'linked'|'unlinked'>('all');
  const [surveyFilter,setSurveyFilter]=useState<'all'|'invited'|'submitted'|'missing'>('all');
  const [compare,setCompare]=useState(false);
  const [pdfSections,setPdfSections]=useState({summary:true,trend:true,evidence:true,cohorts:false,register:true});
  const [pdfBusy,setPdfBusy]=useState(false);
  const [pdfError,setPdfError]=useState('');
  const valid=!!from&&!!to&&from<=to;
  const report=useQuery({queryKey:['site-visit-report',profile?.key,manager,from,to,staffKey],queryFn:()=>loadVisits(profile!.key,manager,from,to,staffKey),enabled:!!profile&&valid,staleTime:60000});
  const priorPeriod=useMemo(()=>valid?previousPeriod(from,to):null,[from,to,valid]);
  const priorReport=useQuery({queryKey:['site-visit-report',profile?.key,manager,priorPeriod?.from,priorPeriod?.to,staffKey],queryFn:()=>loadVisits(profile!.key,manager,priorPeriod!.from,priorPeriod!.to,staffKey),enabled:!!profile&&!!priorPeriod&&compare,staleTime:60000});
  useEffect(()=>{
    if(!profile?.key)return;
    const db=requireSupabase();
    const refresh=()=>{void queryClient.invalidateQueries({queryKey:['site-visit-report']});};
    const channel=db.channel(`site-visit-report-${profile.key}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'site_visits'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'site_visit_experience_invites'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'site_visit_experience_submissions'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'payments'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'client_cost_attributions'},refresh)
      .subscribe();
    return ()=>{void db.removeChannel(channel)};
  },[profile?.key,queryClient]);
  const visits=report.data?.visits??[];
  const sites=useMemo(()=>[...new Set(visits.map((v)=>v.site?.trim()).filter((v):v is string=>!!v))].sort(),[visits]);
  const sources=useMemo(()=>[...new Set(visits.map((v)=>v.source?.trim()).filter((v):v is string=>!!v))].sort(),[visits]);
  const matches=(v:Visit,data:VisitData|undefined)=>{
    const invites=(data?.invites??[]).filter((invite)=>invite.site_visit_id===v.id);
    const submitted=invites.some((invite)=>(data?.surveys??[]).some((survey)=>survey.invite_id===invite.id));
    return (!site||v.site?.trim()===site)&&(!source||v.source?.trim()===source)&&(status==='all'||outcome(v)===status)
      &&(linkFilter==='all'||(linkFilter==='linked' ? !!v.lead_id : !v.lead_id))
      &&(surveyFilter==='all'||(surveyFilter==='submitted'?submitted:surveyFilter==='invited'?invites.some((invite)=>!!invite.sent_at):!submitted));
  };
  const filtered=visits.filter((v)=>matches(v,report.data));
  const priorFiltered=(priorReport.data?.visits??[]).filter((v)=>matches(v,priorReport.data));
  const cross=evidence(filtered,report.data);
  const priorCross=evidence(priorFiltered,priorReport.data);
  const priorCounts=useMemo(()=>({records:priorFiltered.length,attended:priorFiltered.filter((v)=>outcome(v)==='attended').length,unconfirmed:priorFiltered.filter((v)=>outcome(v)==='pending').length,linked:priorFiltered.filter((v)=>!!v.lead_id).length}),[priorFiltered]);
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
  const staffRows=useMemo(()=>{
    const keys=[...new Set(filtered.map((v)=>v.agent_key))];
    return keys.map((key)=>{
      const rows=filtered.filter((v)=>v.agent_key===key);
      const summary=evidence(rows,report.data);
      return {key,name:rows[0]?.agent_name??key,visits:rows.length,attended:rows.filter((v)=>outcome(v)==='attended').length,unknown:rows.filter((v)=>outcome(v)==='pending').length,linked:rows.filter((v)=>!!v.lead_id).length,...summary};
    }).sort((a,b)=>b.visits-a.visits||a.name.localeCompare(b.name));
  },[filtered,report.data]);
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
    if(!Object.values(pdfSections).some(Boolean)){setPdfError('Select at least one PDF section.');return;}
    if(compare&&!priorReport.data){setPdfError('Wait for the comparison period to load.');return;}
    setPdfBusy(true);setPdfError('');
    try{
      const doc=new jsPDF();
      const staffLabel=manager?(report.data.staff.find((s)=>s.agent_key===staffKey)?.name??'All staff'):profile.name;
      let y=pdfBrandedHeader(doc,'Site visits report',from+' to '+to,[staffLabel,'Generated '+new Date().toLocaleString('en-GB',{timeZone:'Africa/Accra'})],null);
      doc.setFontSize(9);
      doc.text('Date basis: scheduled visit date. Attendance is counted only when explicitly marked.',14,y);y+=6;
      doc.text('Unconfirmed is not a no-show. Staff follow-up text is not a client survey.',14,y);y+=6;
      doc.text('Approved payment after a visit is a sequence, not proof that the visit caused the sale.',14,y);y+=13;
      if(pdfSections.summary){
      y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Scope and outcomes');
      autoTable(doc,{startY:y,margin:{left:14,right:14},body:[
        ['Site',site||'All sites'],['Source',source||'All sources'],['Outcome',status==='all'?'All outcomes':outcomeLabel(status)],
        ['Lead link',linkFilter],['Client survey',surveyFilter],
        ['Visit records in scope',counts.records],['Attended',counts.attended],['Explicitly not attended',counts.noShow],
        ['Cancelled',counts.cancelled],['Attendance not recorded',counts.unconfirmed],['Past visits with unknown attendance',counts.pastUnconfirmed],
        ['Outcome recording coverage',percent(recordedOutcomes,activeBookings)],['Attended among recorded outcomes',percent(counts.attended,recordedOutcomes)],
        ['Staff follow-up text recorded',counts.withFeedback],['Linked to pipeline lead',counts.linked],['Unlinked to pipeline lead',counts.records-counts.linked],['Rescheduled',counts.rescheduled],
      ].map(([label,value])=>[String(label),String(value)]),theme:'striped',styles:{fontSize:9,cellPadding:2},columnStyles:{0:{fontStyle:'bold'}}});
      if(compare||pdfSections.trend||pdfSections.evidence||pdfSections.cohorts||pdfSections.register)y=nextY(doc,y);
      if(compare&&priorPeriod){
        if(y>218){doc.addPage();y=20}
        y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Previous equal-length period',`${priorPeriod.from} to ${priorPeriod.to}`);
        autoTable(doc,{startY:y,margin:{left:14,right:14},head:[['Measure','Current','Previous','Change']],body:[
          ['Visit records',counts.records,priorCounts.records,changeLabel(counts.records,priorCounts.records)],
          ['Attended',counts.attended,priorCounts.attended,changeLabel(counts.attended,priorCounts.attended)],
          ['Unconfirmed',counts.unconfirmed,priorCounts.unconfirmed,changeLabel(counts.unconfirmed,priorCounts.unconfirmed)],
          ['Linked leads',counts.linked,priorCounts.linked,changeLabel(counts.linked,priorCounts.linked)],
          ['Survey responses',cross.responded,priorCross.responded,changeLabel(cross.responded,priorCross.responded)],
          ['Attended linked visits with later approved payment',cross.linkedAttendedPaid,priorCross.linkedAttendedPaid,changeLabel(cross.linkedAttendedPaid,priorCross.linkedAttendedPaid)],
        ].map((row)=>row.map(String)),theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[11,30,61]}});
        if(pdfSections.trend||pdfSections.evidence||pdfSections.cohorts||pdfSections.register)y=nextY(doc,y);
      }
      }
      if(pdfSections.trend){
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
        y=base+25;
      } else {doc.setFontSize(9);doc.text('No visits in this period.',16,y);y+=12}
      doc.setTextColor(0,0,0);
      }
      if(pdfSections.evidence){
        if(y>190){doc.addPage();y=20}
        y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Client response, payments and cost','Exact visit/lead links only');
        autoTable(doc,{startY:y,margin:{left:14,right:14},body:[
          ['Visits with invitation sent',cross.invited],['Visits with client response',cross.responded],['Submitted feedback forms',cross.surveyResponses],
          ['Response rate among invited visits',percent(cross.responded,cross.invited)],
          ['Average overall rating',cross.averageRating===null?'—':cross.averageRating.toFixed(1)+' ('+cross.ratings+' responses)'],
          ['NPS',cross.nps===null?'—':cross.nps+' ('+cross.npsResponses+' responses)'],
          ['Attended visits with exact linked lead',cross.linkedAttended],
          ['Those followed by an approved payment',cross.linkedAttendedPaid],
          ['Later-payment rate among attended linked visits',percent(cross.linkedAttendedPaid,cross.linkedAttended)],
          ['Approved cash after attended linked visits (unique payments)','GHS '+cross.approvedCash.toLocaleString('en-GH')],
          ['Reviewed per-client visit cost','GHS '+cross.attributedCost.toLocaleString('en-GH')],
          ['Attended linked visits without cost attribution',cross.linkedAttendedWithoutCost],
        ].map(([label,value])=>[String(label),String(value)]),theme:'striped',styles:{fontSize:8,cellPadding:2},columnStyles:{0:{fontStyle:'bold'}}});
        y=nextY(doc,y);
        if(cross.intentCounts.length){
          if(y>225){doc.addPage();y=20}
          y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Purchase intent in client responses');
          autoTable(doc,{startY:y,margin:{left:14,right:14},head:[['Client answer','Responses']],body:cross.intentCounts.map(([label,count])=>[label,String(count)]),theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[11,30,61]}});
          y=nextY(doc,y);
        }
        if(y>250){doc.addPage();y=20}
        doc.setFontSize(8);doc.text('Payments are approved transactions dated on/after a confirmed attended visit.',14,y);y+=5;
        doc.text('Repeated lead payments and cost rows are counted once. Missing cost is not zero spend.',14,y);y+=5;
        doc.text('NPS uses scored client responses only; no score is inferred from staff notes.',14,y);y+=12;
      }
      if(pdfSections.cohorts&&manager){
        if(y>225){doc.addPage();y=20}
        y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Staff comparison','Filtered visit cohorts');
        autoTable(doc,{startY:y,margin:{left:14,right:14,bottom:18},head:[['Staff','Visits','Attended','Unknown','Linked','Feedback visits','Later paid']],body:staffRows.map((row)=>[row.name,row.visits,row.attended,row.unknown,row.linked,row.responded,row.linkedAttendedPaid]),theme:'grid',styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[11,30,61]}});
        y=nextY(doc,y);
      }
      if(pdfSections.register){
      if(y>245){doc.addPage();y=20}
      y=pdfSectionTitle(doc,y,doc.internal.pageSize.getWidth(),'Visit register',filtered.length+' records');
      autoTable(doc,{startY:y,margin:{left:14,right:14,bottom:18},head:[['Visit date','Staff','Client','Site','Outcome','Lead','Feedback']],body:filtered.map((v)=>[v.visit_date,v.agent_name,v.name,v.site??'—',outcomeLabel(outcome(v)),v.lead_id?'Linked':'—',v.feedback_after?'Recorded':'—']),theme:'grid',styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[11,30,61]}});
      }
      pdfReportFooter(doc,'Palmstead');
      doc.save('Palmstead-site-visits-'+from+'-to-'+to+'.pdf');
    }catch(cause){setPdfError(cause instanceof Error?cause.message:'Could not create the PDF.')}finally{setPdfBusy(false)}
  }
  return <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 p-4 pb-12 md:p-8">
    <Button asChild variant="ghost" className="self-start"><Link href="/dashboard/site-visits"><ArrowLeft className="size-4"/>Back to site visits</Link></Button>
    <div><p className="text-sm font-medium text-primary">Site visit insights</p><h1 className="text-3xl font-semibold tracking-tight">Site visits report</h1><p className="mt-1 text-muted-foreground">Visit records, confirmed outcomes and pipeline linkage. Counts use the scheduled visit date.</p></div>
    <Card><CardHeader><CardTitle>Report filters</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
      <div className="flex w-full flex-wrap gap-2" aria-label="Date range shortcuts">
        <Button size="sm" variant="outline" onClick={()=>{setFrom(today.slice(0,7)+'-01');setTo(today)}}>This month</Button>
        <Button size="sm" variant="outline" onClick={()=>{setFrom(today.slice(0,4)+'-01-01');setTo(today)}}>Year to date</Button>
        <Button size="sm" variant="outline" onClick={()=>{setFrom('2020-01-01');setTo(today)}}>All visits</Button>
      </div>
      <label className="grid gap-1 text-sm">From<Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">To<Input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
      {manager&&<label className="grid gap-1 text-sm">Staff<select className="h-9 min-w-40 rounded-md border bg-background px-3" value={staffKey} onChange={(e)=>setStaffKey(e.target.value)}><option value="">All staff</option>{report.data?.staff.map((s)=><option key={s.agent_key} value={s.agent_key}>{s.name}{s.active?'':' (former)'}</option>)}</select></label>}
      <label className="grid gap-1 text-sm">Site<select className="h-9 min-w-36 max-w-56 rounded-md border bg-background px-3" value={site} onChange={(e)=>setSite(e.target.value)}><option value="">All sites</option>{sites.map((v)=><option key={v}>{v}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Source<select className="h-9 min-w-36 max-w-56 rounded-md border bg-background px-3" value={source} onChange={(e)=>setSource(e.target.value)}><option value="">All sources</option>{sources.map((v)=><option key={v}>{v}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Outcome<select className="h-9 min-w-40 rounded-md border bg-background px-3" value={status} onChange={(e)=>setStatus(e.target.value as Outcome)}><option value="all">All outcomes</option><option value="attended">Attended</option><option value="not-attended">Did not attend</option><option value="pending">Unconfirmed</option><option value="cancelled">Cancelled</option></select></label>
      <label className="grid gap-1 text-sm">Pipeline link<select className="h-9 min-w-40 rounded-md border bg-background px-3" value={linkFilter} onChange={(e)=>setLinkFilter(e.target.value as typeof linkFilter)}><option value="all">All visits</option><option value="linked">Linked lead</option><option value="unlinked">Unlinked visit</option></select></label>
      <label className="grid gap-1 text-sm">Client survey<select className="h-9 min-w-40 rounded-md border bg-background px-3" value={surveyFilter} onChange={(e)=>setSurveyFilter(e.target.value as typeof surveyFilter)}><option value="all">All surveys</option><option value="invited">Invitation sent</option><option value="submitted">Response submitted</option><option value="missing">No response</option></select></label>
      <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={compare} onChange={(e)=>setCompare(e.target.checked)}/>Compare previous equal-length period</label>
      <fieldset className="flex w-full flex-wrap gap-3 text-sm"><legend className="mb-1 font-medium">PDF sections</legend>{([['summary','Summary and comparison'],['trend','Weekly trend'],['evidence','Survey, payment and cost'],['cohorts','Staff comparison'],['register','Visit register']] as const).filter(([key])=>manager||key!=='cohorts').map(([key,label])=><label key={key} className="flex items-center gap-2"><input type="checkbox" checked={pdfSections[key]} onChange={(e)=>setPdfSections((current)=>({...current,[key]:e.target.checked}))}/>{label}</label>)}</fieldset>
      <Button onClick={download} disabled={!report.data||pdfBusy||(compare&&!priorReport.data)}><Download className="size-4"/>{pdfBusy?'Preparing…':'Download selected PDF sections'}</Button>
    </CardContent></Card>
    {!valid&&<p role="alert" className="text-destructive">Choose a valid date range.</p>}
    {report.isLoading&&<p>Loading site visits…</p>}
    {report.error&&<p role="alert" className="text-destructive">Could not load visits: {String(report.error)}</p>}
    {compare&&priorReport.isLoading&&<p>Loading comparison period…</p>}
    {compare&&priorReport.error&&<p role="alert" className="text-destructive">Could not load comparison: {String(priorReport.error)}</p>}
    {pdfError&&<p role="alert" className="text-destructive">{pdfError}</p>}
    {report.data&&<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Visit records',counts.records],['Attended',counts.attended],['Attendance unknown',counts.unconfirmed],
        ['Past visits still unconfirmed',counts.pastUnconfirmed],['Did not attend',counts.noShow],['Cancelled',counts.cancelled],
        ['Outcome recording coverage',percent(recordedOutcomes,activeBookings)],['Attended among recorded outcomes',percent(counts.attended,recordedOutcomes)],
        ['Staff follow-up text',counts.withFeedback],['Linked leads',counts.linked],['Unlinked visits',counts.records-counts.linked],['Rescheduled',counts.rescheduled],
      ].map(([label,value])=><Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Client response and commercial follow-through</CardTitle></CardHeader><CardContent>
        <p className="mb-4 text-sm text-muted-foreground">Surveys join by visit invitation. Payments and reviewed costs join through an exact pipeline lead and a confirmed attended visit.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([
          ['Visits with invitation sent',cross.invited],['Visits with client response',cross.responded],['Submitted feedback forms',cross.surveyResponses],['Response rate by visit',percent(cross.responded,cross.invited)],
          ['Average overall rating',cross.averageRating===null?'—':cross.averageRating.toFixed(1)+' / 5'],
          ['NPS',cross.nps===null?'—':cross.nps+' ('+cross.npsResponses+' scored)'],
          ['Attended and lead-linked',cross.linkedAttended],['With later approved payment',cross.linkedAttendedPaid],
          ['Later-payment rate',percent(cross.linkedAttendedPaid,cross.linkedAttended)],
          ['Approved cash after visit','GHS '+cross.approvedCash.toLocaleString('en-GH')],
          ['Reviewed client visit cost','GHS '+cross.attributedCost.toLocaleString('en-GH')],
          ['Attended linked visits missing cost',cross.linkedAttendedWithoutCost],
        ] as const).map(([label,value])=><div key={label} className="min-w-0 rounded-lg border bg-background p-3"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-semibold">{value}</p></div>)}</div>
        {!!cross.intentCounts.length&&<div className="mt-5"><h3 className="text-sm font-semibold">Purchase intent from client answers</h3><div className="mt-2 grid gap-2">{cross.intentCounts.map(([label,count])=><div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"><span className="min-w-0 break-words">{label}</span><strong>{count}</strong></div>)}</div></div>}
        <p className="mt-4 text-xs text-muted-foreground">A later approved payment is not proof that the visit caused the sale. Cash and cost rows are counted once. Missing cost attribution means unknown cost, not free service.</p>
      </CardContent></Card>
      {compare&&priorReport.data&&priorPeriod&&<Card><CardHeader><CardTitle>Compared with {priorPeriod.from} to {priorPeriod.to}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([['Visit records',counts.records,priorCounts.records],['Attended',counts.attended,priorCounts.attended],['Unconfirmed',counts.unconfirmed,priorCounts.unconfirmed],['Linked leads',counts.linked,priorCounts.linked]] as const).map(([label,current,previous])=><div key={label} className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-semibold">{current} <span className="text-sm font-normal text-muted-foreground">vs {previous}</span></p><p className="text-xs text-muted-foreground">{changeLabel(current,previous)}</p></div>)}</CardContent></Card>}
      {manager&&<Card><CardHeader><CardTitle>Staff comparison</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b">{['Staff','Visits','Attended','Unknown','Linked','Visits with feedback','Later paid'].map((label)=><th key={label} className="py-2 pr-3">{label}</th>)}</tr></thead><tbody>{staffRows.map((row)=><tr key={row.key} className="border-b last:border-0"><td className="py-2 pr-3 font-medium">{row.name}</td><td>{row.visits}</td><td>{row.attended}</td><td>{row.unknown}</td><td>{row.linked}</td><td>{row.responded}</td><td>{row.linkedAttendedPaid}</td></tr>)}</tbody></table>{!staffRows.length&&<p className="py-4 text-sm text-muted-foreground">No staff visits match these filters.</p>}</div></CardContent></Card>}
      <Card><CardHeader><CardTitle>Visits by scheduled week</CardTitle></CardHeader><CardContent>{trend.length?<div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="week" tick={{fontSize:11}}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="visits" fill="#14305d" name="Visit records" radius={[4,4,0,0]}/><Bar dataKey="attended" fill="#b99b37" name="Attended" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>:<p className="text-sm text-muted-foreground">No visits in this period.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Visit register</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b">{['Date','Staff','Client','Site','Outcome','Lead','Feedback'].map((h)=><th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead><tbody>{filtered.map((v)=><tr key={v.id} className="border-b last:border-0"><td className="py-2 pr-3">{v.visit_date}</td><td className="py-2 pr-3">{v.agent_name}</td><td className="py-2 pr-3">{v.name}</td><td className="py-2 pr-3">{v.site||'—'}</td><td className="py-2 pr-3">{outcomeLabel(outcome(v))}</td><td className="py-2 pr-3">{v.lead_id?'Linked':'—'}</td><td className="py-2 pr-3">{v.feedback_after?'Recorded':'—'}</td></tr>)}</tbody></table>{!filtered.length&&<p className="py-4 text-sm text-muted-foreground">No visits match these filters.</p>}</div></CardContent></Card>
      <p className="text-xs text-muted-foreground">Outcome recording coverage = attended or explicitly not attended ÷ non-cancelled records. Attendance unknown is not a no-show. Staff follow-up text is not a client survey. A linked lead does not establish a sale.</p>
    </>}
  </main>;
}

