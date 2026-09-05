import { jsPDF } from 'jspdf';
import { pdfBrandedHeader, pdfReportFooter, pdfSectionTitle, pdfSimpleTable, PDF_MUTED } from '../../../shared/lib/pdfReport';
import type { SiteVisit } from '../../../types/domain';

// Port of index.html's buildSiteVisitFormPDF() (index.html:16029-16079),
// re-laid-out with this app's own shared branded-report toolkit
// (pdfBrandedHeader/pdfSectionTitle/pdfSimpleTable) instead of v1's
// bespoke pdfCheckRow/pdfLabeledPair primitives, so this reads as the
// same document family as every other report PDF in web-next rather
// than a one-off layout.
function notesBlock(doc: jsPDF, y: number, pageW: number, label: string, value: string | null): number {
  if (!value || !value.trim()) return y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_MUTED);
  doc.text(label.toUpperCase(), 12, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  const lines = doc.splitTextToSize(value, pageW - 24);
  if (y + lines.length * 4.6 > 275) {
    doc.addPage();
    y = 16;
  }
  doc.text(lines, 12, y);
  return y + lines.length * 4.6 + 6;
}

export function buildSiteVisitFormPdf(rec: SiteVisit, preparedByName: string, logoDataUri: string | null, companyName?: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const rightLines = [`Logged by ${rec.agentName}`, new Date(rec.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })];
  let y = pdfBrandedHeader(doc, 'SITE VISIT REQUEST FORM', 'Tsopoli Site Visit Request Form', rightLines, logoDataUri);
  y += 6;

  y = pdfSectionTitle(doc, y, pageW, '1.0 Client personal information');
  y = pdfSimpleTable(
    doc,
    y,
    pageW,
    ['FIELD', 'DETAIL'],
    [
      ['Full name', rec.name || '—'],
      ['Contact', rec.contact || '—'],
      ['Pick-up location', rec.pickup || '—'],
      ['Place of work', rec.placeOfWork || '—'],
      ['Position', rec.position || '—'],
      ['Nationality', rec.nationality || '—'],
    ],
    [0.32, 0.68],
  );

  y = pdfSectionTitle(doc, y, pageW, '2.0 Interested in buying');
  y = pdfSimpleTable(doc, y, pageW, ['FIELD', 'DETAIL'], [['Plot(s)', rec.plot || '—']], [0.32, 0.68]);

  y = pdfSectionTitle(doc, y, pageW, '3.0 Visit preferences');
  y = pdfSimpleTable(
    doc,
    y,
    pageW,
    ['FIELD', 'DETAIL'],
    [
      ['Mode of transportation', rec.transport || '—'],
      ['Purpose of visit', rec.purpose || '—'],
      ['Site', rec.site || '—'],
      ['Site visit day', `${rec.visitDate}${rec.visitTime ? ' · ' + rec.visitTime : ''}`],
      ['No. of accompaniment', rec.people != null ? String(rec.people) : '0'],
      ['Who is accompanying', rec.accompanied || '—'],
      ['Site visit requested by', rec.agentName || '—'],
    ],
    [0.32, 0.68],
  );

  y = pdfSectionTitle(doc, y, pageW, 'Discussion & next steps');
  y = notesBlock(doc, y, pageW, 'Discussion so far', rec.discussionSoFar);
  y = notesBlock(doc, y, pageW, 'Key understanding about client', rec.keyUnderstanding);
  y = notesBlock(doc, y, pageW, 'Feedback after site visit', rec.feedbackAfter);
  y = notesBlock(doc, y, pageW, 'Key next steps', rec.keyNextSteps);
  if (!rec.discussionSoFar && !rec.keyUnderstanding && !rec.feedbackAfter && !rec.keyNextSteps) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_MUTED);
    doc.text('Nothing recorded yet — can be filled in before or after the visit.', 12, y);
    y += 8;
  }

  y = pdfSectionTitle(doc, y, pageW, 'Status');
  pdfSimpleTable(doc, y, pageW, ['FIELD', 'DETAIL'], [['Status', rec.status], ['Prepared by', preparedByName || rec.agentName || '—']], [0.32, 0.68]);

  pdfReportFooter(doc, companyName ?? 'Trulander JSF Limited');
  return doc;
}

export function siteVisitFormFilename(clientName: string): string {
  return `SiteVisit_${(clientName || 'client').replace(/\s+/g, '_')}.pdf`;
}
