"use client";

import { jsPDF } from 'jspdf';
import { sitePdfHeader, svaGridRow, SITE_INK } from '../../site-visits/lib/sitePdfPrimitives';
import { pdfStampSignature } from '../../../shared/lib/pdfSignature';
import { pdfGeneratedStamp } from '../../../shared/lib/pdfReport';
import { accompaniedText, COST_ROWS, costTotal, fmtLongDate, weekRangeLabel } from './siteVisitAuthLogic';
import type { SiteVisit, WeeklyVisitForm } from '../../../types/domain';

// Exact port of index.html's buildWeeklyVisitAuthPDF() (index.html:15563-
// 15629) -- the user supplied v1's own real generated PDF as ground
// truth. This is a real spreadsheet-style bordered grid table (svaGridRow,
// one rect() per cell), not the card-based layout an earlier pass here
// used -- same column widths, same reserved blank rows for handwritten
// entries, same "-" for a zero cost cell, same preparer/approver
// signature block below the table.
const COL_W = [30, 20, 18, 24, 30, 24, 22, 18]; // Client Name, Contact, Accompanied, Purpose, Pick-up, Transport, Feedback, Staff
const VISIT_COLS: { label: string; key: keyof SiteVisit | 'accompanied' }[] = [
  { label: 'Client Name', key: 'name' },
  { label: 'Contact', key: 'contact' },
  { label: 'Accompanied', key: 'accompanied' },
  { label: 'Purpose of visit', key: 'purpose' },
  { label: 'Pick-up Location', key: 'pickup' },
  { label: 'Transport Medium', key: 'transport' },
  { label: 'Feedback/Remarks', key: 'feedbackAfter' },
  { label: 'Staff', key: 'agentName' },
];

function svaMoney(n: number): string {
  return n ? n.toFixed(2) : '-';
}

export function buildSiteVisitAuthPdf(form: WeeklyVisitForm, visits: SiteVisit[], preparerSignature: string | null, logoDataUri: string | null, generatedByName?: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = sitePdfHeader(doc, 'SITE VISIT AUTHORIZATION', logoDataUri);
  y += 6;

  const x0 = 12;
  const tableW = COL_W.reduce((a, b) => a + b, 0);
  const tableTop = y;

  y += svaGridRow(doc, x0, y, COL_W, [{ text: 'AUTHORIZATION FORM-TSOPOLI SITE VISIT', span: 8, bold: true, align: 'center', size: 10.5 }], 8.5);
  y += svaGridRow(doc, x0, y, COL_W, [{ text: 'Site manager in charge' }, { text: form.siteManagerName || '', span: 7 }]);
  y += svaGridRow(doc, x0, y, COL_W, [
    { text: 'Date of visit' },
    { text: fmtLongDate(form.visitDate) || weekRangeLabel(form.weekStart).replace(/–/g, '-'), span: 3 },
    { text: '' },
    { text: 'Approved By:' },
    { text: form.status === 'Finalized' ? form.approvedByName || '' : '', span: 2 },
  ]);
  y += svaGridRow(
    doc,
    x0,
    y,
    COL_W,
    VISIT_COLS.map((c) => ({ text: c.label, bold: true }))
  );
  visits.forEach((v) => {
    if (y > 272) {
      doc.addPage();
      y = 16;
    }
    y += svaGridRow(
      doc,
      x0,
      y,
      COL_W,
      VISIT_COLS.map((c) => ({ text: c.key === 'accompanied' ? accompaniedText(v.people, v.accompanied) : (v[c.key as keyof SiteVisit] as string) || '' }))
    );
  });
  const blankRows = Math.max(3, 8 - visits.length);
  for (let i = 0; i < blankRows; i++) {
    if (y > 272) {
      doc.addPage();
      y = 16;
    }
    y += svaGridRow(
      doc,
      x0,
      y,
      COL_W,
      VISIT_COLS.map(() => ({ text: '' }))
    );
  }

  if (y > 250) {
    doc.addPage();
    y = 16;
  }
  y += svaGridRow(doc, x0, y, COL_W, [{ text: '' }, { text: 'ESTIMATED COST', bold: true }, { text: '', span: 3 }, { text: 'ACTUAL EXPENSES', bold: true }, { text: '', span: 2 }]);
  COST_ROWS.forEach((r) => {
    if (y > 272) {
      doc.addPage();
      y = 16;
    }
    y += svaGridRow(doc, x0, y, COL_W, [
      { text: r.estLabel },
      { text: svaMoney(Number(form[r.estKey] ?? 0)), align: 'right' },
      { text: '', span: 3 },
      { text: r.actLabel },
      { text: form.status === 'Finalized' || Number(form[r.actKey] ?? 0) ? svaMoney(Number(form[r.actKey] ?? 0)) : '', align: 'right' },
      { text: '' },
    ]);
  });
  y += svaGridRow(doc, x0, y, COL_W, [
    { text: 'TOTAL COST GHS', bold: true },
    { text: svaMoney(costTotal(form, 'Est')), bold: true, align: 'right' },
    { text: '', span: 3 },
    { text: 'TOTAL COST GHS', bold: true },
    { text: form.status === 'Finalized' || costTotal(form, 'Act') ? svaMoney(costTotal(form, 'Act')) : '', bold: true, align: 'right' },
    { text: '' },
  ]);
  doc.setDrawColor(...SITE_INK);
  doc.setLineWidth(0.7);
  doc.rect(x0, tableTop, tableW, y - tableTop);

  y += 14;
  if (y > 264) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SITE_INK);
  doc.text('Signed:.....................................', x0, y);
  doc.text('Date:.....................................', x0, y + 9);
  if (preparerSignature) pdfStampSignature(doc, x0 + doc.getTextWidth('Signed: '), y, 30, 10, preparerSignature);
  doc.text(fmtLongDate(new Date().toISOString().slice(0, 10)), x0 + doc.getTextWidth('Date: '), y + 9);

  const rx = x0 + tableW - 72;
  doc.text('Approved By:.....................................', rx, y);
  doc.text('Signed:.....................................', rx, y + 9);
  doc.text('Date:.....................................', rx, y + 18);
  if (form.status === 'Finalized') {
    if (form.approvedByName) doc.text(form.approvedByName, rx + doc.getTextWidth('Approved By: '), y);
    if (form.approvedSignature) pdfStampSignature(doc, rx + doc.getTextWidth('Signed: '), y + 9, 30, 10, form.approvedSignature);
    if (form.finalizedAt) doc.text(fmtLongDate(form.finalizedAt.slice(0, 10)), rx + doc.getTextWidth('Date: '), y + 18);
  }

  // Real system-wide rule (2026-09-11): "any pdf documemnt in the system
  // should always have a time stamp of when it was generated and by
  // who" -- this is the 7th real PDF builder in the app, added after
  // that pass; kept consistent with all the others.
  pdfGeneratedStamp(doc, generatedByName);
  return doc;
}

export function siteVisitAuthFilename(visitDate: string): string {
  return `SiteVisitAuth_${visitDate}.pdf`;
}
