import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PDFDocument } from 'pdf-lib';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { sanitizePdfText } from '../../../shared/lib/pdfText';
import { buildReceiptPdf } from '../../payments/lib/receiptPdf';
import { buildSiteVisitFormPdf } from '../../site-visits/lib/siteVisitFormPdf';
import type {
  ActivityLogEntry, AllocationRequest, Client, Complaint, Config,
  ContractGeneration, ContractRequest, Lead, Payment, SiteVisit,
} from '../../../types/domain';

export type DossierConversation = {
  id: string;
  lead_id: string;
  author_key: string;
  channel: string;
  body: string;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string;
};

export type ClientDossierInput = {
  client: Client;
  leads: Lead[];
  payments: Payment[];
  visits: SiteVisit[];
  unlinkedVisitCount: number;
  unlinkedCaseCount: number;
  allocations: AllocationRequest[];
  contractRequests: ContractRequest[];
  contractGenerations: ContractGeneration[];
  complaints: Complaint[];
  activity: ActivityLogEntry[];
  conversations: DossierConversation[];
  authorNames: Map<string, string>;
  contractPdfs: Array<{ label: string; bytes: ArrayBuffer }>;
  missingContractPdfs: string[];
  config: Config;
  generatedBy: string;
};

const navy: [number, number, number] = [11, 30, 61];
const gold: [number, number, number] = [201, 162, 39];
const gray: [number, number, number] = [87, 105, 121];
const pageBottom = 278;

const clean = (value: unknown) => sanitizePdfText(String(value ?? '').trim() || 'Not recorded');
const money = (value: number) => `GHS ${value.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (value: string | null | undefined) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', { timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short' });
};

function section(doc: jsPDF, title: string, context: string): number {
  doc.addPage();
  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(clean(title), 14, 16);
  doc.setTextColor(...gray);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(clean(context), 14, 32);
  return 40;
}

function table(doc: jsPDF, y: number, headings: string[], rows: string[][]): number {
  autoTable(doc, {
    startY: y,
    head: [headings.map(clean)],
    body: rows.length ? rows.map((row) => row.map(clean)) : [[`No records on file`, ...headings.slice(1).map(() => '')]],
    margin: { left: 14, right: 14, top: 18, bottom: 20 },
    styles: { fontSize: 7.8, cellPadding: 2.5, overflow: 'linebreak', valign: 'top', textColor: navy },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    showHead: 'everyPage',
  });
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
}

function prose(doc: jsPDF, y: number, label: string, value: unknown): number {
  const lines = doc.splitTextToSize(clean(value), 180) as string[];
  if (y + 16 > pageBottom) y = section(doc, 'Client record - continued', label);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text(clean(label).toUpperCase(), 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  y += 5;
  for (const line of lines) {
    if (y + 5 > pageBottom) {
      y = section(doc, 'Client record - continued', label);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...navy);
    }
    doc.text(line, 14, y);
    y += 4.3;
  }
  return y + 5;
}

async function appendPdf(target: PDFDocument, source: ArrayBuffer): Promise<void> {
  const { PDFDocument } = await import('pdf-lib');
  const incoming = await PDFDocument.load(source);
  const pages = await target.copyPages(incoming, incoming.getPageIndices());
  pages.forEach((page) => target.addPage(page));
}

export async function buildClientDossierPdf(input: ClientDossierInput): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const { client, leads, payments, visits, allocations, contractRequests, contractGenerations, complaints, activity, conversations } = input;
  const approved = payments.filter((payment) => (payment.status ?? 'approved') === 'approved');
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const omitted: string[] = [...input.missingContractPdfs];
  const appendices: Array<{ title: string; bytes: ArrayBuffer }> = [];
  const logo = await loadImageAsDataUri('/trulander-logo.png').catch(() => null);

  // Only existing, approved, numbered receipts are issued as attachments.
  // This export never mints a receipt number or changes a payment record.
  for (const payment of approved) {
    const lead = leadById.get(payment.leadId);
    if (!lead || !payment.receiptNumber) {
      omitted.push(`Payment ${payment.id}: approved receipt number or linked lead unavailable`);
      continue;
    }
    const exactSnapshot = payment.approvalSnapshotIsLegacy === false && payment.paidAfterApproval != null && payment.balanceAfterApproval != null && payment.contractTotalAtApproval != null;
    const receipt = buildReceiptPdf({
      clientName: payment.clientName ?? lead.name,
      payment, lead, receiptNumber: payment.receiptNumber, config: input.config,
      paidAsOf: exactSnapshot ? payment.paidAfterApproval : null,
      balanceAsOf: exactSnapshot ? payment.balanceAfterApproval : null,
      contractTotalAsOf: exactSnapshot ? payment.contractTotalAtApproval : null,
      issuerName: payment.decidedByName ?? null,
      issuerSignature: null,
      paymentHistory: payments.filter((item) => item.leadId === lead.id),
    });
    appendices.push({ title: `Receipt ${payment.receiptNumber}`, bytes: receipt.output('arraybuffer') });
  }
  for (const visit of visits) {
    const form = buildSiteVisitFormPdf(visit, logo, input.generatedBy);
    appendices.push({ title: `Site visit request ${visit.id}`, bytes: form.output('arraybuffer') });
  }
  for (const contract of input.contractPdfs) {
    try {
      await PDFDocument.load(contract.bytes);
      appendices.push({ title: contract.label, bytes: contract.bytes });
    } catch {
      omitted.push(`${contract.label}: stored PDF could not be read`);
    }
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `Client record - ${client.name}`, subject: 'Confidential client history and source documents', author: input.config.quoteCompanyName || 'Palmstead' });
  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 78, 'F');
  if (logo) { try { doc.addImage(logo, 'PNG', 14, 12, 24, 24); } catch { /* Text branding remains. */ } }
  doc.setTextColor(...gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CONFIDENTIAL CLIENT RECORD', 14, 51);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(23);
  doc.text(doc.splitTextToSize(clean(client.name), 180) as string[], 14, 63);
  let y = 91;
  y = prose(doc, y, 'Contact on file', client.contact);
  y = prose(doc, y, 'Prepared by', input.generatedBy);
  y = prose(doc, y, 'Generated (Ghana time)', when(new Date().toISOString()));
  y = prose(doc, y, 'Linked lead references', leads.map((lead) => `${lead.clientNo ?? lead.id} (${lead.id})`).join('; '));
  doc.setFillColor(244, 246, 249);
  doc.roundedRect(14, y + 3, 182, 28, 2, 2, 'F');
  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${leads.length} leads    ${visits.length} linked visits    ${approved.length} approved payments`, 20, y + 14);
  doc.text(`${money(approved.reduce((sum, payment) => sum + payment.amount, 0))} approved payments`, 20, y + 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);
  doc.text('Source records as accessible to the signed-in user at export time. Not a legal certification.', 14, 272);

  y = section(doc, 'Identity, interests and KYC', 'Lead snapshots; missing values are labelled, not inferred.');
  for (const lead of leads) {
    y = prose(doc, y, `Lead ${lead.clientNo ?? lead.id}`, `${lead.plotType} x ${lead.noPlots} | ${lead.stage} | ${lead.paymentPlan} | ${money(lead.grandTotal)}`);
    y = prose(doc, y, 'Owner, source and entered date', `${lead.agent} | ${lead.leadSource || 'Not recorded'} | ${lead.date}`);
    y = prose(doc, y, 'Address and contact', `${lead.address || 'Not recorded'} | ${lead.contact}`);
    y = prose(doc, y, 'Next action', `${lead.nextAction || 'Not recorded'} | due ${lead.nextActionDate || 'Not recorded'}`);
    y = prose(doc, y, 'Legacy lead summary', lead.notes || 'Not recorded');
    const kyc = lead.kyc;
    y = prose(doc, y, 'KYC', kyc ? [
      `Nationality: ${kyc.nationality || 'Not recorded'}`, `Occupation: ${kyc.occupation || 'Not recorded'}`,
      `Date of birth: ${kyc.dob || 'Not recorded'}`, `ID: ${kyc.idType || 'Not recorded'} / ${kyc.idNumber || 'Not recorded'}`,
      `Email: ${kyc.email || 'Not recorded'}`, `Location: ${kyc.location || 'Not recorded'}`,
      `Emergency contact: ${kyc.contactName || 'Not recorded'} / ${kyc.contactPhone || 'Not recorded'}`,
      `Land use: ${kyc.landUsage || 'Not recorded'} ${kyc.landUsageDetail || ''}`,
    ].join('\n') : 'No KYC details saved');
  }

  y = section(doc, 'Conversations and activity', 'Original server timestamps, authors and agreed next steps.');
  y = table(doc, y, ['When (Ghana)', 'Owner / type', 'Conversation and next step'], conversations.map((entry) => [
    when(entry.created_at), `${input.authorNames.get(entry.author_key) ?? entry.author_key} / ${entry.channel}`,
    `${entry.body}${entry.next_action ? `\nNext: ${entry.next_action}${entry.next_action_date ? ` (due ${entry.next_action_date})` : ''}` : ''}`,
  ]));
  y = section(doc, 'Recorded calls and actions', 'Activity log entries linked to these leads.');
  table(doc, y, ['When (Ghana)', 'Action', 'Recorded detail'], activity.filter((item) => item.leadId && leadById.has(item.leadId)).map((item) => [
    when(item.createdAt), `${item.agentName} / ${item.action}`, [item.outcome, item.detail, item.note].filter(Boolean).join(' | '),
  ]));

  y = section(doc, 'Site visits and submitted forms', 'Only visits linked by exact lead ID are included. Original request forms follow in the appendix.');
  y = table(doc, y, ['Visit / date', 'Status and attendance', 'Visit details'], visits.map((visit) => [
    `${visit.id}\n${visit.site} | ${visit.visitDate} ${visit.visitTime ?? ''}`,
    `${visit.status} | ${visit.attended === null ? 'Attendance unconfirmed' : visit.attended ? 'Attended' : 'No-show'}`,
    `Plot: ${visit.plot || 'Not recorded'}; people: ${visit.people ?? 'Not recorded'}; pickup: ${visit.pickup || 'Not recorded'}; agent: ${visit.agentName}; purpose: ${visit.purpose || 'Not recorded'}; feedback: ${visit.feedbackAfter || 'Not recorded'}; next: ${visit.keyNextSteps || 'Not recorded'}`,
  ]));

  y = section(doc, 'Payment ledger', 'Approved funds are totalled separately from pending or declined entries.');
  y = table(doc, y, ['Date / receipt', 'Status and method', 'Amount / reference'], [...payments].sort((a, b) => a.date.localeCompare(b.date)).map((payment) => [
    `${payment.date}\n${payment.receiptNumber || 'Receipt not issued'}`,
    `${payment.status ?? 'approved'} | ${payment.paymentMethod || 'Not recorded'}`,
    `${money(payment.amount)}\n${payment.referenceNumber || payment.id}`,
  ]));
  y = prose(doc, Math.min(y + 10, 260), 'Total approved from ledger', money(approved.reduce((sum, payment) => sum + payment.amount, 0)));
  const recorded = leads.reduce((sum, lead) => sum + lead.amtPaid, 0);
  if (Math.abs(recorded - approved.reduce((sum, payment) => sum + payment.amount, 0)) > 1) {
    y = prose(doc, y, 'Reconciliation warning', `Lead paid balances total ${money(recorded)}, which differs from approved payment entries. Review source records.`);
  }

  y = section(doc, 'Allocation, contracts and cases', 'Statuses and document references from linked records.');
  y = table(doc, y, ['Recorded', 'Type / status', 'Details'], [
    ...allocations.map((item) => [when(item.createdAt), `Allocation / ${item.status}`, `${item.plotNumber || 'Plot not selected'} | ${item.id}`]),
    ...contractRequests.map((item) => [when(item.createdAt), `Contract request / ${item.status}`, `${item.requestedByName} | ${item.id}`]),
    ...contractGenerations.map((item) => [when(item.generatedAt), 'Contract generated', `Version ${item.versionNumberSnapshot ?? 'not recorded'} | ${item.generatedByName} | ${item.pdfStoragePath ? 'Stored PDF' : 'PDF unavailable'} | ${item.id}`]),
    ...complaints.map((item) => [when(item.createdAt), `Case / ${item.status}`, `${item.category || 'Complaint'} | ${item.id}`]),
  ]);

  if (input.unlinkedVisitCount) omitted.push(`${input.unlinkedVisitCount} possible visit(s) match the name/contact but have no exact lead link; excluded for identity safety`);
  if (input.unlinkedCaseCount) omitted.push(`${input.unlinkedCaseCount} possible case(s) have no exact lead link; excluded for identity safety`);
  if (!leads.some((lead) => lead.kyc && Object.values(lead.kyc).some(Boolean))) omitted.push('KYC details not recorded');
  y = section(doc, 'Evidence and appendix register', 'Every attachment below comes from an existing linked source record.');
  y = table(doc, y, ['Included attachment', 'Source'], appendices.map((item) => [item.title, 'Linked client record']));
  if (omitted.length) {
    y = section(doc, 'Missing or unlinked evidence', 'These items are not represented as completed documents.');
    table(doc, y, ['Issue'], omitted.map((item) => [item]));
  }
  const mainPages = doc.getNumberOfPages();
  for (let page = 1; page <= mainPages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...gray);
    doc.text(`CONFIDENTIAL - ${clean(client.name)}`, 14, 288);
    doc.text(`Record ${page} / ${mainPages}`, 196, 288, { align: 'right' });
  }

  const merged = await PDFDocument.load(doc.output('arraybuffer'));
  for (const item of appendices) {
    const divider = new jsPDF({ unit: 'mm', format: 'a4' });
    divider.setFillColor(...navy);
    divider.rect(0, 0, 210, 297, 'F');
    divider.setTextColor(...gold);
    divider.setFont('helvetica', 'bold');
    divider.setFontSize(11);
    divider.text('SOURCE DOCUMENT', 16, 42);
    divider.setTextColor(255, 255, 255);
    divider.setFontSize(18);
    divider.text(divider.splitTextToSize(clean(item.title), 175) as string[], 16, 58);
    divider.setFont('helvetica', 'normal');
    divider.setFontSize(9);
    divider.text('Included from this client record at export time', 16, 82);
    await appendPdf(merged, divider.output('arraybuffer'));
    await appendPdf(merged, item.bytes);
  }
  return merged.save();
}

