import { jsPDF } from 'jspdf';
import { pdfBrandedHeader, pdfReportFooter, pdfSectionTitle, pdfSimpleTable, PDF_MUTED } from '../../../shared/lib/pdfReport';
import type { SiteVisit, SveSubmissionRecord } from '../../../types/domain';

// Real user ask: an AI-assisted Site Visit Experience report Management
// can open from an SMS link. Built on the same shared branded-report
// toolkit every other internal report PDF in this app uses, so it reads
// as one document family rather than a one-off layout. The client's own
// name/contact are shown here (this is an INTERNAL report a staff member
// reviewed and is choosing to send, not the redacted payload the AI
// itself was given) -- see useGenerateSveReportDraft's own comment for
// why the AI call itself never sees them.
export function buildSveReportPdf(siteVisit: SiteVisit, submission: SveSubmissionRecord, reportText: string, preparedByName: string, logoDataUri: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const rightLines = [`Prepared by ${preparedByName}`, new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })];
  let y = pdfBrandedHeader(doc, 'SITE VISIT EXPERIENCE REPORT', `${siteVisit.name}  ·  ${siteVisit.visitDate}`, rightLines, logoDataUri);
  y += 6;

  y = pdfSectionTitle(doc, y, pageW, 'Visit summary');
  y = pdfSimpleTable(
    doc,
    y,
    pageW,
    ['FIELD', 'DETAIL'],
    [
      ['Client', submission.fullName || siteVisit.name || '—'],
      ['Site visited', submission.siteVisited || siteVisit.site || '—'],
      ['Visit date', submission.visitDate || siteVisit.visitDate || '—'],
      ['Site manager', submission.siteManagerName || '—'],
      ['Overall rating', submission.overallRating != null ? `${submission.overallRating}/5` : '—'],
      ['Relationship/handling', submission.relationshipRating != null ? `${submission.relationshipRating}/5` : '—'],
      ['NPS score', submission.npsScore != null ? `${submission.npsScore}/10` : '—'],
      ['Purchase intent', submission.purchaseIntent || '—'],
    ],
    [0.32, 0.68]
  );

  y = pdfSectionTitle(doc, y, pageW, 'AI-assisted report', 'reviewed by staff before sending');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  const paragraphs = reportText.split(/\n+/).filter(Boolean);
  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(para, pageW - 24);
    if (y + lines.length * 4.6 > 275) {
      doc.addPage();
      y = 16;
    }
    doc.text(lines, 12, y);
    y += lines.length * 4.6 + 5;
  }

  if (submission.handlingFeedback || submission.improvementSuggestions || submission.additionalComments) {
    if (y > 250) {
      doc.addPage();
      y = 16;
    }
    y = pdfSectionTitle(doc, y, pageW, "Client's own words");
    const quotes: [string, string | null][] = [
      ['On the handling', submission.handlingFeedback],
      ['Improvement ideas', submission.improvementSuggestions],
      ['Additional comments', submission.additionalComments],
    ];
    for (const [label, value] of quotes) {
      if (!value) continue;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF_MUTED);
      doc.text(label.toUpperCase(), 12, y);
      y += 4.5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(20, 20, 20);
      const lines = doc.splitTextToSize(`"${value}"`, pageW - 24);
      if (y + lines.length * 4.6 > 275) {
        doc.addPage();
        y = 16;
      }
      doc.text(lines, 12, y);
      y += lines.length * 4.6 + 6;
    }
  }

  pdfReportFooter(doc, 'Trulander JSF Limited');
  return doc;
}

export function sveReportFilename(clientName: string): string {
  return `SVE_Report_${(clientName || 'client').replace(/\s+/g, '_')}.pdf`;
}
