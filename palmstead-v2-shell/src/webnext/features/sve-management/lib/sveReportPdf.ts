import { jsPDF } from 'jspdf';
import { sitePdfFields, sitePdfHeader, sitePdfSectionBar, svaGridRow, SITE_MUTED, SITE_NAVY } from '../../site-visits/lib/sitePdfPrimitives';
import { pdfGeneratedStamp, pdfReportFooter } from '../../../shared/lib/pdfReport';
import { sanitizePdfText } from '../../../shared/lib/pdfText';
import { reviewDigest } from './sveReviewDigest';
import type { SveDayReport, SiteVisit, SveSubmissionRecord } from '../../../types/domain';

// Full rebuild, real user asks (2026-09-05): (1) "the report isn't
// supposed to be for a single client after client but a full report
// after every site visit" -- this now takes one SveDayReport (every
// client visited that day), not one SiteVisit/SveSubmissionRecord pair;
// (2) "when u look at the report the system currently generates its
// lazily done ... look at how the text even looks stretched stupidly not
// alignment" -- the old version built on the generic navy/gold
// pdfReport.ts toolkit (a different visual family from the real v1-style
// site-visit documents); this instead reuses sitePdfPrimitives.ts, the
// same exact-ported v1 primitives already proven correct for the Site
// Visit Request/Authorization forms, so all three site-visit documents
// now read as one consistent, deliberately-designed family instead of a
// bespoke one-off layout.
function fmtLongDate(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export type SveReportAttendance = 'attended' | 'no-show' | 'unconfirmed' | 'cancelled';

function amount(value: number): string {
  return `GHS ${value.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildSveDayReportPdf(report: SveDayReport, logoDataUri: string | null, generatedByName?: string | null, attendanceByVisitId: Record<string, SveReportAttendance> = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = sitePdfHeader(doc, 'SITE VISIT EXPERIENCE REPORT', logoDataUri);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...SITE_NAVY);
  doc.text(sanitizePdfText(`${report.site} - ${fmtLongDate(report.visitDate)}`), 12, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SITE_MUTED);
  doc.text(sanitizePdfText(`${report.entries.length} scheduled client${report.entries.length === 1 ? '' : 's'} · prepared by ${report.preparedByName || '-'}`), 12, y + 6);
  y += 13;

  const attendance = report.entries.map((entry) => attendanceByVisitId[entry.siteVisitId] ?? 'unconfirmed');
  const attendedCount = attendance.filter((value) => value === 'attended').length;
  const noShowCount = attendance.filter((value) => value === 'no-show').length;
  const unconfirmedCount = attendance.filter((value) => value === 'unconfirmed').length;
  const cancelledCount = attendance.filter((value) => value === 'cancelled').length;
  const submissions = report.entries.filter((entry) => !!entry.submissionId).length;
  y = sitePdfSectionBar(doc, y, pageW, 'VISIT OUTCOMES & EVIDENCE');
  y = sitePdfFields(doc, y, [
    ['Attendance', `${attendedCount} attended · ${noShowCount} did not attend · ${unconfirmedCount} unconfirmed${cancelledCount ? ` · ${cancelledCount} cancelled` : ''}`],
    ['Client feedback surveys', `${submissions} submitted of ${report.entries.length} scheduled clients`],
  ]);
  y += 3;

  const budget = report.weeklyVisitForm;
  if (y > 205) { doc.addPage(); y = 16; }
  y = sitePdfSectionBar(doc, y, pageW, 'AUTHORIZATION & LOGISTICS COST');
  if (budget) {
    const items = [
      ['Vehicle rental', budget.vehicleRentalEst, budget.vehicleRentalAct],
      ["Driver's tip", budget.driversTipEst, budget.driversTipAct],
      ['Fuel', budget.fuelEst, budget.fuelAct],
      ['Refreshment', budget.refreshmentEst, budget.refreshmentAct],
      ['T&T', budget.tntEst, budget.tntAct],
    ] as const;
    const estimated = items.reduce((sum, item) => sum + item[1], 0);
    const actual = items.reduce((sum, item) => sum + item[2], 0);
    const columns = [64, 40, 40, 42];
    y += svaGridRow(doc, 12, y, columns, [{ text: 'Cost category', bold: true }, { text: 'Estimate', bold: true, align: 'right' }, { text: 'Actual', bold: true, align: 'right' }, { text: 'Variance', bold: true, align: 'right' }], 7);
    for (const [label, estimate, spent] of items) {
      y += svaGridRow(doc, 12, y, columns, [{ text: label }, { text: amount(estimate), align: 'right' }, { text: amount(spent), align: 'right' }, { text: amount(spent - estimate), align: 'right' }], 7);
    }
    y += svaGridRow(doc, 12, y, columns, [{ text: 'Total', bold: true }, { text: amount(estimated), bold: true, align: 'right' }, { text: amount(actual), bold: true, align: 'right' }, { text: amount(actual - estimated), bold: true, align: 'right' }], 7);
    y += 5;
    y = sitePdfFields(doc, y, [
      ['Authorization record', `${budget.id} · ${budget.status}${budget.approvedByName ? ` · approved by ${budget.approvedByName}` : ''}`],
      ['Actual cost per confirmed attendee', attendedCount > 0 && actual > 0 ? amount(actual / attendedCount) : 'Not calculated: confirm attendance and recorded actual costs first.'],
    ]);
  } else {
    y = sitePdfFields(doc, y, [['Cost status', 'No linked Site Visit Authorization form. Cost and cost-per-client are unavailable.']]);
  }
  y += 3;

  const daySummary = report.siteSummaryAi || report.siteSummary;
  if (daySummary) {
    if (y > 245) { doc.addPage(); y = 16; }
    y = sitePdfSectionBar(doc, y, pageW, "SITE MANAGER'S SUMMARY OF THE DAY");
    y = sitePdfFields(doc, y, [
      ['Site manager original notes', report.siteSummary],
      ...(report.siteSummaryAi ? [['AI-polished manager summary', report.siteSummaryAi] as [string, string]] : []),
    ]);
    y += 3;
  }

  if (y > 245) { doc.addPage(); y = 16; }
  y = sitePdfSectionBar(doc, y, pageW, `CLIENT-BY-CLIENT FEEDBACK (${report.entries.length})`);
  if (report.entries.length === 0) {
    y = sitePdfFields(doc, y, [['Clients', 'No site visits were logged for this day.']]);
  }
  report.entries.forEach((entry, i) => {
    if (y > 245) {
      doc.addPage();
      y = 16;
    }
    if (i > 0) {
      doc.setDrawColor(226, 231, 237);
      doc.setLineWidth(0.3);
      doc.line(12, y - 3, pageW - 12, y - 3);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...SITE_NAVY);
    doc.text(sanitizePdfText(entry.clientName || 'Client'), 12, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SITE_MUTED);
    doc.text(sanitizePdfText(entry.clientContact || ''), pageW - 12, y, { align: 'right' });
    y += 6;

    const fields: [string, string | null][] = [
      ['Attendance', ({ attended: 'Attended', 'no-show': 'Did not attend', unconfirmed: 'Unconfirmed', cancelled: 'Cancelled' })[attendanceByVisitId[entry.siteVisitId] ?? 'unconfirmed']],
      ['Client survey', entry.submissionId ? 'Submitted; raw answers are in the individual feedback record.' : 'No client feedback survey submitted.'],
      ['AI summary of client feedback', entry.aiFeedbackSummary],
      ["Site manager's original debrief", reviewDigest(entry.managerReview) || null],
      ['AI-polished manager debrief', entry.managerNotesAi],
    ];
    y = sitePdfFields(
      doc,
      y,
      fields.filter(([, v]) => v)
    );
    y += 2;
  });

  pdfReportFooter(doc, 'Trulander JSF Limited');
  pdfGeneratedStamp(doc, generatedByName);
  return doc;
}

export function sveDayReportFilename(visitDate: string): string {
  return `SVE_Report_${visitDate}.pdf`;
}

// Real user ask (2026-10-31): "the customer experience, we are unable to
// download their feedbacks, it only shows on the screen." The Feedback
// tab's own expanded card already shows one client's real raw submission
// but had no export -- staff were told to build a whole day report just
// to get one client's answers on paper. This is deliberately a single
// raw-submission export (no AI summary, no manager debrief -- those only
// exist once a day report is built), reusing the exact same visual
// primitives as buildSveDayReportPdf so this reads as the same document
// family, not a bespoke one-off.
export function buildSveSubmissionPdf(siteVisit: SiteVisit, submission: SveSubmissionRecord, logoDataUri: string | null, generatedByName?: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = sitePdfHeader(doc, 'CLIENT FEEDBACK', logoDataUri);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...SITE_NAVY);
  doc.text(sanitizePdfText(siteVisit.name || submission.fullName), 12, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SITE_MUTED);
  const metaBits = [siteVisit.site, siteVisit.plot, siteVisit.visitDate, submission.phone].filter(Boolean);
  doc.text(sanitizePdfText(metaBits.join(' · ')), 12, y + 6);
  y += 13;

  y = sitePdfSectionBar(doc, y, pageW, 'RATINGS');
  const ratingFields: [string, string | number | null][] = [
    ['Overall rating', submission.overallRating != null ? `${submission.overallRating} / 5` : null],
    ['Relationship/handling rating', submission.relationshipRating != null ? `${submission.relationshipRating} / 5` : null],
    ['Net promoter score (NPS)', submission.npsScore],
  ];
  y = sitePdfFields(
    doc,
    y,
    ratingFields.filter(([, v]) => v != null)
  );
  y += 2;

  y = sitePdfSectionBar(doc, y, pageW, 'CLIENT FEEDBACK');
  const feedbackFields: [string, string | null][] = [
    ['Journey to the site', submission.journeyRating],
    ['How the site matched expectations', submission.siteDescriptionRating],
    ['Why below expectation (if any)', submission.belowExpectationReason],
    ['On how their visit was handled', submission.handlingFeedback],
    ['Purchase intent', submission.purchaseIntent],
    ['Improvement suggestions', submission.improvementSuggestions],
    ['Additional comments', submission.additionalComments],
  ];
  const presentFeedback = feedbackFields.filter(([, v]) => v);
  y = sitePdfFields(doc, y, presentFeedback.length > 0 ? presentFeedback : [['Feedback', 'No additional feedback provided.']]);

  pdfReportFooter(doc, 'Trulander JSF Limited');
  pdfGeneratedStamp(doc, generatedByName);
  return doc;
}

export function sveSubmissionFilename(clientName: string, visitDate: string): string {
  const safeName = clientName.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Client';
  return `SVE_Feedback_${safeName}_${visitDate}.pdf`;
}

