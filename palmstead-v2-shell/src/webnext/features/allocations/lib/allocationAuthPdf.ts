"use client";

import { jsPDF } from 'jspdf';
import { ghs, fmtLongDate } from '../../../shared/lib/format';
import type { AllocationRequest } from '../../../types/domain';

// Master Spec 7.5: "generate a signed-off suggestion/authorization
// document" -- Management physically signs this, staff photograph the
// signed copy and attach it to the allocation record (see
// AllocationRequestsScreen's AwaitingPanel) before confirming. Deliberately
// a single simple page, not a re-use of the Contract of Sale's own multi-
// page legal document (contractPdf.ts) -- that's a different, separate
// document with a different purpose (the actual sale terms); this one
// exists purely so Management has something physical to sign off on
// before staff can confirm.
const INK: [number, number, number] = [31, 56, 99];
const MUTED: [number, number, number] = [92, 114, 128];

function field(doc: jsPDF, x: number, y: number, w: number, label: string, value: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(20, 20, 20);
  doc.text(value || '—', x, y + 6);
  doc.setDrawColor(210, 216, 224);
  doc.setLineWidth(0.3);
  doc.line(x, y + 8.5, x + w, y + 8.5);
}

export function buildAllocationAuthorizationPdf(request: AllocationRequest, companyName: string | null | undefined): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const company = companyName || 'PEP Landbank';

  doc.setFillColor(...INK);
  doc.rect(0, 0, pageW, 30, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('PLOT ALLOCATION AUTHORIZATION', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 214, 235);
  doc.text(company, 14, 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Generated ' + fmtLongDate(new Date().toISOString()), pageW - 14, 21, { align: 'right' });

  let y = 46;
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text('This form authorizes the allocation below. Management signs physically; staff must attach a photo of the signed copy to the allocation record before it can be confirmed.', 14, y, { maxWidth: pageW - 28 });
  y += 16;

  const half = (pageW - 28) / 2;
  field(doc, 14, y, half - 5, 'Client', request.clientName);
  field(doc, 14 + half + 5, y, half - 5, 'Agent in charge', request.agentName || request.agentKey);
  y += 18;

  field(doc, 14, y, half - 5, 'Plot number(s)', request.plotNumber || request.suggestedPlots || '—');
  field(doc, 14 + half + 5, y, half - 5, 'Percent paid', request.percentPaid != null ? `${request.percentPaid}%` : '—');
  y += 18;

  field(doc, 14, y, half - 5, 'Grand total', request.grandTotal != null ? ghs(request.grandTotal) : '—');
  field(doc, 14 + half + 5, y, half - 5, 'Amount paid', request.amtPaid != null ? ghs(request.amtPaid) : '—');
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(
    `I confirm the client named above has met ${company}'s allocation eligibility requirements and authorize the allocation of the plot(s) named above to them.`,
    14,
    y,
    { maxWidth: pageW - 28 }
  );
  y += 30;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(14, y, 14 + 80, y);
  doc.line(pageW - 14 - 80, y, pageW - 14, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Management signature', 14, y);
  doc.text('Date', pageW - 14 - 80, y);

  return doc;
}

export function allocationAuthFilename(clientName: string): string {
  return `Allocation_Authorization_${(clientName || 'client').replace(/\s+/g, '_')}.pdf`;
}