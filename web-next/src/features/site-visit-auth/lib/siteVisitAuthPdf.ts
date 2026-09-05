import { jsPDF } from 'jspdf';
import { ghs } from '../../../shared/lib/format';
import { pdfBrandedHeader, pdfReportFooter, pdfSectionTitle, pdfSimpleTable, PDF_MUTED } from '../../../shared/lib/pdfReport';
import { pdfStampSignature } from '../../../shared/lib/pdfSignature';
import { COST_ROWS, accompaniedText, costTotal, fmtLongDate } from './siteVisitAuthLogic';
import type { SiteVisit, WeeklyVisitForm } from '../../../types/domain';

// Port of index.html's buildWeeklyVisitAuthPDF() (index.html:15563-15629),
// re-laid-out with this app's own shared branded-report toolkit instead
// of v1's bespoke svaGridRow grid primitive -- same real columns
// (SVA_VISIT_COLS, index.html:15052-15053) and cost rows, same
// preparer/approver signature blocks, so a manager who prints this still
// gets a document that matches what the day's actual costs/visits are.
export function buildSiteVisitAuthPdf(form: WeeklyVisitForm, visits: SiteVisit[], preparerSignature: string | null, logoDataUri: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const rightLines = [`Site manager: ${form.siteManagerName || '—'}`, new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })];
  let y = pdfBrandedHeader(doc, 'SITE VISIT AUTHORIZATION', `Tsopoli site visit  ·  ${fmtLongDate(form.visitDate)}`, rightLines, logoDataUri);
  y += 6;

  y = pdfSectionTitle(doc, y, pageW, `Visits (${visits.length})`);
  y = pdfSimpleTable(
    doc,
    y,
    pageW,
    ['CLIENT', 'CONTACT', 'ACCOMPANIED', 'PURPOSE', 'PICK-UP', 'TRANSPORT', 'FEEDBACK', 'STAFF'],
    visits.length
      ? visits.map((v) => [v.name || '—', v.contact || '—', accompaniedText(v.people, v.accompanied), v.purpose || '—', v.pickup || '—', v.transport || '—', v.feedbackAfter || '—', v.agentName || '—'])
      : [['No site visits logged for this day yet.', '', '', '', '', '', '', '']],
    [0.16, 0.13, 0.11, 0.12, 0.14, 0.12, 0.12, 0.1]
  );

  y = pdfSectionTitle(doc, y, pageW, 'Cost breakdown', form.status === 'Finalized' ? 'Finalized' : 'Open');
  y = pdfSimpleTable(
    doc,
    y,
    pageW,
    ['ESTIMATED COST', 'AMOUNT', 'ACTUAL EXPENSES', 'AMOUNT'],
    COST_ROWS.map((r) => [r.estLabel, ghs(form[r.estKey]), r.actLabel, form.status === 'Finalized' || form[r.actKey] ? ghs(form[r.actKey]) : '—']),
    [0.28, 0.22, 0.28, 0.22]
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(`TOTAL ESTIMATED: ${ghs(costTotal(form, 'Est'))}`, 12, y);
  doc.text(`TOTAL ACTUAL: ${form.status === 'Finalized' || costTotal(form, 'Act') ? ghs(costTotal(form, 'Act')) : '—'}`, pageW - 12, y, { align: 'right' });
  y += 14;

  if (y > 250) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text('Signed: .....................................', 12, y);
  doc.text('Date: .....................................', 12, y + 9);
  if (preparerSignature) pdfStampSignature(doc, 12 + doc.getTextWidth('Signed: '), y, 30, 10, preparerSignature);
  doc.text(fmtLongDate(new Date().toISOString().slice(0, 10)), 12 + doc.getTextWidth('Date: '), y + 9);

  const rx = pageW - 84;
  doc.text('Approved by: .....................................', rx, y);
  doc.text('Signed: .....................................', rx, y + 9);
  doc.text('Date: .....................................', rx, y + 18);
  if (form.status === 'Finalized') {
    if (form.approvedByName) doc.text(form.approvedByName, rx + doc.getTextWidth('Approved by: '), y);
    if (form.approvedSignature) pdfStampSignature(doc, rx + doc.getTextWidth('Signed: '), y + 9, 30, 10, form.approvedSignature);
    if (form.finalizedAt) doc.text(fmtLongDate(form.finalizedAt.slice(0, 10)), rx + doc.getTextWidth('Date: '), y + 18);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_MUTED);
    doc.text('Awaiting Management approval', rx, y + 26);
  }

  pdfReportFooter(doc, 'Trulander JSF Limited');
  return doc;
}

export function siteVisitAuthFilename(visitDate: string): string {
  return `SiteVisitAuth_${visitDate}.pdf`;
}
