"use client";

import { jsPDF } from 'jspdf';
import { sitePdfCheckRow, sitePdfFields, sitePdfHeader, sitePdfLabeledPair, sitePdfSectionBar, SITE_MUTED, SITE_NAVY } from './sitePdfPrimitives';
import { sanitizePdfText } from '../../../shared/lib/pdfText';
import { dayTimeLabel } from '../../site-visit-auth/lib/siteVisitAuthLogic';
import type { SiteVisit } from '../../../types/domain';

// Exact port of index.html's buildSiteVisitFormPDF() (index.html:16029-
// 16079) -- the user supplied v1's own real generated PDF as ground
// truth ("this is how the site visit ... form should look like") after
// an earlier pass here used this app's generic pdfReport.ts toolkit,
// which reads as a different, less faithful document family. Every
// number/color/section below is copied from the real function, not
// approximated -- see sitePdfPrimitives.ts's own comment.
const PLOT_PRESETS = ['0.5 Plot (70x50)', '1 Plot (70x100)', '2 Plots (70x100)', '3 Plots (70x100)'];
// Master Spec 9.1's real 7-day schedule (this app's own fix, shipped
// earlier) -- shown here instead of v1's stale 4-day list
// (Tue/Wed/Fri/Sun) since that's what rec.visitTime can actually be now.
// Derived from dayTimeLabel (siteVisitAuthLogic.ts) rather than a second
// hardcoded list -- the real bug this fixed was exactly two lists silently
// drifting out of sync (AddSiteVisitScreen wrote a bare time, this list
// expected a combined "Day Time" string), so there is now only one.
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map(dayTimeLabel);

export function buildSiteVisitFormPdf(rec: SiteVisit, logoDataUri: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = sitePdfHeader(doc, 'SITE VISIT REQUEST FORM', logoDataUri);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...SITE_NAVY);
  doc.text('TSOPOLI SITE VISIT REQUEST FORM', 12, y);
  y += 8;

  y = sitePdfSectionBar(doc, y, pageW, '1.0  CLIENT PERSONAL INFORMATION');
  let h1 = sitePdfLabeledPair(doc, 12, y, 88, '1.1 Full Name', rec.name);
  let h2 = sitePdfLabeledPair(doc, 108, y, 88, '1.2 Contact', rec.contact);
  y += Math.max(h1, h2) * 5 + 7;
  h1 = sitePdfLabeledPair(doc, 12, y, 88, '1.3 Pick-up Location', rec.pickup);
  h2 = sitePdfLabeledPair(doc, 108, y, 88, '1.4 Place of Work', rec.placeOfWork);
  y += Math.max(h1, h2) * 5 + 7;
  h1 = sitePdfLabeledPair(doc, 12, y, 88, '1.5 Position', rec.position);
  h2 = sitePdfLabeledPair(doc, 108, y, 88, '1.6 Nationality', rec.nationality);
  y += Math.max(h1, h2) * 5 + 9;

  y = sitePdfSectionBar(doc, y, pageW, '2.0  INTERESTED IN BUYING');
  y = sitePdfCheckRow(doc, y, pageW, PLOT_PRESETS, rec.plot) + (rec.plot && PLOT_PRESETS.includes(rec.plot) ? 3 : 0);
  if (rec.plot && !PLOT_PRESETS.includes(rec.plot)) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...SITE_MUTED);
    doc.text(sanitizePdfText('Other: ' + rec.plot), 12, y);
    y += 6;
  }

  y = sitePdfSectionBar(doc, y, pageW, '3.0  VISIT PREFERENCES');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SITE_MUTED);
  doc.text('3.1 MODE OF TRANSPORTATION', 12, y);
  y += 4.5;
  y = sitePdfCheckRow(doc, y, pageW, ['Personal Vehicle', 'Company Vehicle'], rec.transport) + 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SITE_MUTED);
  doc.text('3.2 PURPOSE OF VISIT', 12, y);
  y += 4.5;
  y = sitePdfCheckRow(doc, y, pageW, ['Viewing', 'Allocation', 'Picking', 'Others'], rec.purpose) + 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SITE_MUTED);
  doc.text('3.3 SITE VISIT DAY', 12, y);
  y += 4.5;
  y = sitePdfCheckRow(doc, y, pageW, DAY_OPTIONS, rec.visitTime) + 5;

  h1 = sitePdfLabeledPair(doc, 12, y, 88, 'Number of client accompaniment', rec.people);
  h2 = sitePdfLabeledPair(doc, 108, y, 88, 'Site visit requested by', rec.agentName);
  y += Math.max(h1, h2) * 5 + 7;
  if (rec.accompanied) {
    h1 = sitePdfLabeledPair(doc, 12, y, 184, 'Who is accompanying', rec.accompanied);
    y += h1 * 5 + 9;
  }

  if (y > 230) {
    doc.addPage();
    y = 16;
  }
  y = sitePdfSectionBar(doc, y, pageW, 'DISCUSSION & NEXT STEPS');
  const notesFields: [string, string | null][] = [
    ['Discussion so far', rec.discussionSoFar],
    ['Key understanding about client', rec.keyUnderstanding],
    ['Feedback after site visit', rec.feedbackAfter],
    ['Key next steps', rec.keyNextSteps],
  ];
  y = sitePdfFields(doc, y, notesFields);
  y += 3;
  doc.setDrawColor(226, 231, 237);
  doc.line(12, y, pageW - 12, y);
  y += 6;
  sitePdfFields(doc, y, [
    ['Status', rec.status],
    ['Logged at', new Date(rec.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
  ]);

  return doc;
}

export function siteVisitFormFilename(clientName: string): string {
  return `SiteVisit_${(clientName || 'client').replace(/\s+/g, '_')}.pdf`;
}