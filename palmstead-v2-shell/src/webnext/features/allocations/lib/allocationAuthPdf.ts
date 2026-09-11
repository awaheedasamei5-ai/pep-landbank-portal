"use client";

import { jsPDF } from 'jspdf';
import { sitePdfHeader, sitePdfSectionBar, sitePdfLabeledPair, SITE_NAVY, SITE_MUTED, SITE_INK } from '../../site-visits/lib/sitePdfPrimitives';
import { pdfStampSignature } from '../../../shared/lib/pdfSignature';
import { pdfGeneratedStamp } from '../../../shared/lib/pdfReport';
import { sanitizePdfText } from '../../../shared/lib/pdfText';
import { ghs } from '../../../shared/lib/format';
import type { AllocationRequest } from '../../../types/domain';

// Real user ask: "how the v1 production version has the pdf the system
// generates after the suggestions kindly search, copy and use that pdf."
// Exact port of index.html's real buildAuthorizationPDF() (index.html:
// 8018-8068) -- same navy/lime pdfHeader+pdfSectionBar family the Site
// Visit Request/Authorization forms already use (sitePdfPrimitives.ts is
// itself a literal port of the very same shared toolkit v1's
// buildAuthorizationPDF calls), same writeup copy, same 3-column
// "CANDIDATE PLOTS -- TICK ONE TO APPROVE" grid, same sign-off block.
// v1's version shows one candidate PLOT per tick-box column, since v1
// only ever suggested a single plot per request; this app can suggest
// whole COMBOS (a client buying multiple units gets 2-3 plots per
// candidate, see suggestionCombos.ts), so each tick-box column below
// shows one full candidate combo (its plots joined with "+") instead of
// a lone plot number -- the one real structural adaptation, everything
// else copied as-is.
export function buildAllocationAuthorizationPdf(
  request: AllocationRequest,
  combos: string[][],
  logoDataUri: string | null,
  generatedByName?: string | null,
  signatureDataUrl?: string | null
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = sitePdfHeader(doc, 'AUTHORIZATION FOR ALLOCATION', logoDataUri);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...SITE_NAVY);
  doc.text('AUTHORIZATION FOR ALLOCATION', 12, y);
  y += 7;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9.5);
  doc.setTextColor(...SITE_MUTED);
  const writeup = doc.splitTextToSize(
    sanitizePdfText(
      'This form is an authorization to allocate a plot of land at Royal Palm Enclave, Tsopoli to the client named below. Management should review the candidate plots and payment status, then sign to approve exactly one of the options.'
    ),
    pageW - 24
  );
  doc.text(writeup, 12, y);
  y += writeup.length * 4.5 + 6;

  y = sitePdfSectionBar(doc, y, pageW, 'CLIENT & PAYMENT DETAILS');
  let h1 = sitePdfLabeledPair(doc, 12, y, 88, 'Client Name', request.clientName);
  let h2 = sitePdfLabeledPair(doc, 108, y, 88, 'Agent', request.agentName || request.agentKey);
  y += Math.max(h1, h2) * 5 + 7;
  h1 = sitePdfLabeledPair(doc, 12, y, 88, 'Amount Paid', ghs(request.amtPaid ?? 0));
  h2 = sitePdfLabeledPair(doc, 108, y, 88, '% of Total Paid', `${request.percentPaid ?? 0}%`);
  y += Math.max(h1, h2) * 5 + 7;
  h1 = sitePdfLabeledPair(doc, 12, y, 88, 'Grand Total', ghs(request.grandTotal ?? 0));
  h2 = sitePdfLabeledPair(doc, 108, y, 88, 'Request Date', request.createdAt);
  y += Math.max(h1, h2) * 5 + 9;

  y = sitePdfSectionBar(doc, y, pageW, 'CANDIDATE PLOTS — MANAGEMENT: TICK ONE TO APPROVE');
  const colW = (pageW - 24) / 3;
  combos.forEach((combo, i) => {
    const x = 12 + i * colW;
    const label = combo.filter(Boolean).join(' + ') || '—';
    doc.setDrawColor(...SITE_NAVY);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, colW - 6, 26, 2, 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(combo.length > 1 ? 10 : 13);
    doc.setTextColor(...SITE_NAVY);
    doc.text(sanitizePdfText('Plot ' + label), x + 6, y + 11, { maxWidth: colW - 12 });
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.4);
    doc.rect(x + 6, y + 16, 5, 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SITE_MUTED);
    doc.text('Approved', x + 13, y + 20);
  });
  y += 36;

  y = sitePdfSectionBar(doc, y, pageW, 'SIGN-OFF');
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(12, y + 14, 92, y + 14);
  doc.line(118, y + 14, pageW - 12, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SITE_INK);
  doc.text('Management Signature & Date', 12, y + 19);
  doc.text('Site Manager: ' + (generatedByName || ''), 118, y + 19);
  const now = new Date();
  doc.text(now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), 118, y + 24);
  if (signatureDataUrl) pdfStampSignature(doc, 120, y + 13, 40, 12, signatureDataUrl);

  pdfGeneratedStamp(doc, generatedByName);
  return doc;
}

export function allocationAuthFilename(clientName: string): string {
  return `Authorization_${(clientName || 'client').replace(/\s+/g, '_')}.pdf`;
}
