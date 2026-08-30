import ExcelJS from 'exceljs';
import { ghs, today } from '../../../shared/lib/format';
import { displayStageCode } from '../../pipeline/lib/pipelineLogic';
import { xlAddDataSheet } from '../../../shared/lib/excelReport';
import type { Complaint, Enquiry, Lead, SiteVisit } from '../../../types/domain';

// Faithful port of index.html's downloadCompanyExcel() (index.html:20524-
// 20623) -- six sheets (Summary, Agent Performance, Leads, Enquiries,
// Client Feedback, Site Visits), same navy-header/lime-rule styling as
// every sheet built via xlAddDataSheet. Reuses the exact same real column
// set/order as the reference workbook for every sheet except one
// deliberate, noted difference: index.html's "Site Visits" KPI per agent
// counts a lead-level `siteVisit==='Yes'` flag that isn't part of web-
// next's Lead type (that flag was already out of scope by the time Leads
// was ported) -- this counts real site_visits records per agent instead,
// which is the more accurate signal anyway.
const STAGE_LOST = 'Lost';

function isFullyPaid(l: Lead): boolean {
  return l.grandTotal > 0 && l.amtPaid >= l.grandTotal;
}

export interface CompanyReportInputs {
  leads: (Lead & { agentName: string })[];
  agents: { key: string; name: string }[];
  targets: Record<string, number>;
  enquiries: Enquiry[];
  complaints: Complaint[];
  siteVisits: SiteVisit[];
  generatedByName: string;
}

export async function buildCompanyReportExcel(inputs: CompanyReportInputs): Promise<ExcelJS.Buffer> {
  const { leads, agents, targets, enquiries, complaints, siteVisits } = inputs;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Palmstead — PEP Landbank';
  wb.created = new Date();

  const thisMonth = today().slice(0, 7);
  const leadsByAgent = new Map<string, (Lead & { agentName: string })[]>();
  for (const l of leads) {
    const arr = leadsByAgent.get(l.agent) ?? [];
    arr.push(l);
    leadsByAgent.set(l.agent, arr);
  }
  const svByAgent = new Map<string, number>();
  for (const v of siteVisits) svByAgent.set(v.agentKey, (svByAgent.get(v.agentKey) ?? 0) + 1);

  let totLeads = 0;
  let totVal = 0;
  let totColl = 0;
  let totOut = 0;
  let totSv = siteVisits.length;
  const escalated = complaints.filter((c) => c.status === 'Escalated').length;
  const openCmp = complaints.filter((c) => c.status !== 'Resolved').length;

  const perfRows = agents.map((a) => {
    const agentLeads = leadsByAgent.get(a.key) ?? [];
    const pipeline = agentLeads.reduce((s, l) => s + l.grandTotal, 0);
    const collected = agentLeads.reduce((s, l) => s + l.amtPaid, 0);
    const outstanding = agentLeads.reduce((s, l) => s + Math.max(l.grandTotal - l.amtPaid, 0), 0);
    totLeads += agentLeads.length;
    totVal += pipeline;
    totColl += collected;
    totOut += outstanding;

    const won = agentLeads.filter(isFullyPaid);
    const wonMonth = won.filter((l) => l.date.slice(0, 7) === thisMonth).length;
    const lost = agentLeads.filter((l) => l.stage === STAGE_LOST).length;
    const winRate = won.length + lost ? Math.round((won.length / (won.length + lost)) * 100) : 0;
    const target = targets[a.key] || 0;
    const wonVal = won.reduce((s, l) => s + l.grandTotal, 0);
    const pct = target ? Math.min(999, Math.round((wonVal / target) * 100)) : 0;
    return {
      agent: a.name,
      leads: agentLeads.length,
      pipeline,
      collected,
      outstanding,
      visits: svByAgent.get(a.key) ?? 0,
      closedAll: won.length,
      closedMonth: wonMonth,
      winRate: winRate + '%',
      target,
      targetPct: pct + '%',
    };
  });
  perfRows.sort((x, y) => y.pipeline - x.pipeline);

  /* ---- Summary sheet ---- */
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ key: 'a', width: 30 }, { key: 'b', width: 22 }];
  sum.mergeCells('A1:B1');
  sum.getCell('A1').value = 'PEP LANDBANK — Company Report';
  sum.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  sum.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1E3D' } };
  sum.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  sum.getRow(1).height = 34;
  sum.mergeCells('A2:B2');
  sum.getCell('A2').value = 'Generated ' + today() + ' by ' + inputs.generatedByName + ' · Royal Palm Enclave';
  sum.getCell('A2').font = { italic: true, color: { argb: 'FF647085' }, size: 10.5 };
  sum.addRow([]);
  const summaryRows: [string, number | string][] = [
    ['Total leads (company-wide)', totLeads],
    ['Pipeline value', ghs(totVal)],
    ['Total collected', ghs(totColl)],
    ['Outstanding balance', ghs(totOut)],
    ['Site visits logged', totSv],
    ['Enquiries logged', enquiries.length],
    ['Open complaints', openCmp],
    ['Escalated complaints', escalated],
  ];
  summaryRows.forEach((r) => {
    const row = sum.addRow(r);
    row.getCell(1).font = { bold: true, color: { argb: 'FF0B1E3D' } };
    row.getCell(2).alignment = { horizontal: 'right' };
  });

  /* ---- Agent Performance sheet ---- */
  xlAddDataSheet(
    wb,
    'Agent Performance',
    [
      { header: 'Agent', key: 'agent', width: 22 },
      { header: 'Active Leads', key: 'leads', width: 13 },
      { header: 'Pipeline Value', key: 'pipeline', width: 16 },
      { header: 'Collected', key: 'collected', width: 14 },
      { header: 'Outstanding', key: 'outstanding', width: 14 },
      { header: 'Site Visits', key: 'visits', width: 12 },
      { header: 'Closed (all-time)', key: 'closedAll', width: 15 },
      { header: 'Closed (this month)', key: 'closedMonth', width: 17 },
      { header: 'Win Rate', key: 'winRate', width: 11 },
      { header: 'Monthly Target', key: 'target', width: 15 },
      { header: 'Target Achieved', key: 'targetPct', width: 14 },
    ],
    perfRows,
    ['pipeline', 'collected', 'outstanding', 'target'],
  );

  /* ---- Leads sheet ---- */
  xlAddDataSheet(
    wb,
    'Leads',
    [
      { header: 'Agent', key: 'agentName', width: 16 },
      { header: 'Client', key: 'name', width: 22 },
      { header: 'Contact', key: 'contact', width: 16 },
      { header: 'Date Added', key: 'date', width: 12 },
      { header: 'Stage', key: 'stage', width: 13 },
      { header: 'Plot Type', key: 'plotType', width: 11 },
      { header: 'No. Plots', key: 'noPlots', width: 9 },
      { header: 'Grand Total', key: 'grandTotal', width: 14 },
      { header: 'Amount Paid', key: 'amtPaid', width: 13 },
      { header: 'Balance', key: 'balance', width: 13 },
      { header: 'Notes', key: 'notes', width: 30 },
    ],
    leads.map((l) => ({ ...l, stage: displayStageCode(l.stage), balance: Math.max(l.grandTotal - l.amtPaid, 0) })),
    ['grandTotal', 'amtPaid', 'balance'],
  );

  /* ---- Enquiries sheet ---- */
  xlAddDataSheet(
    wb,
    'Enquiries',
    [
      { header: 'Agent', key: 'agentName', width: 16 },
      { header: 'Client', key: 'name', width: 22 },
      { header: 'Contact', key: 'contact', width: 16 },
      { header: 'Location', key: 'location', width: 16 },
      { header: 'Types', key: 'types', width: 18 },
      { header: 'Plot', key: 'plot', width: 14 },
      { header: 'Source', key: 'source', width: 12 },
      { header: 'Details', key: 'details', width: 30 },
      { header: 'Follow-up', key: 'follow', width: 20 },
      { header: 'Follow-up Date', key: 'followDate', width: 14 },
      { header: 'Logged', key: 'createdAt', width: 16 },
    ],
    enquiries,
  );

  /* ---- Client Feedback sheet ---- */
  xlAddDataSheet(
    wb,
    'Client Feedback',
    [
      { header: 'Agent', key: 'agentName', width: 16 },
      { header: 'Client', key: 'name', width: 22 },
      { header: 'Contact', key: 'contact', width: 16 },
      { header: 'Plot', key: 'plot', width: 12 },
      { header: 'Sentiment', key: 'sentiment', width: 12 },
      { header: 'Category', key: 'category', width: 14 },
      { header: 'Details', key: 'details', width: 28 },
      { header: 'Assigned', key: 'owner', width: 14 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Resolution', key: 'resolution', width: 24 },
      { header: 'Logged', key: 'createdAt', width: 16 },
    ],
    complaints,
  );

  /* ---- Site visits sheet ---- */
  xlAddDataSheet(
    wb,
    'Site Visits',
    [
      { header: 'Agent', key: 'agentName', width: 16 },
      { header: 'Client', key: 'name', width: 22 },
      { header: 'Contact', key: 'contact', width: 16 },
      { header: 'Plot', key: 'plot', width: 12 },
      { header: 'Site', key: 'site', width: 12 },
      { header: 'Date', key: 'visitDate', width: 12 },
      { header: 'Time', key: 'visitTime', width: 9 },
      { header: 'Guests', key: 'people', width: 9 },
      { header: 'Transport', key: 'transport', width: 12 },
      { header: 'Pickup', key: 'pickup', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Notes', key: 'notes', width: 26 },
      { header: 'Logged', key: 'createdAt', width: 16 },
    ],
    siteVisits,
  );

  return wb.xlsx.writeBuffer();
}

export function companyReportFilename(): string {
  return `PEP_Landbank_Company_Report_${today()}.xlsx`;
}
