import { jsPDF } from 'jspdf';
import { ghs, today } from '../../../shared/lib/format';
import { pdfStampSignature } from '../../../shared/lib/pdfSignature';
import type { Config } from '../../../types/domain';
import type { QuotationTotals } from './quotationLogic';

// Port of index.html's buildQuotationPDF()/pdfQuoteBg()/pdfKV()/
// pdfGreenBar()/pdfGreenTable() (index.html:15811-16951) -- same green/
// dark-green branded layout: pale-green page background, Trulander logo +
// company name/address header, a two-column KV grid (customer details on
// the left, plot/pricing on the right), a dark-green stat bar (Total/
// Deposit/Balance/Monthly Due), a striped payment schedule table, numbered
// notes, and an offer-acceptance section. Signature stamping is left out,
// same reasoning as the payment receipt -- no staff signature capture UI
// exists yet, and the real code already guards it with `if(preparerSig)`.
const QGREEN_DARK: [number, number, number] = [13, 77, 45];
const QGREEN_LABEL: [number, number, number] = [21, 110, 64];
const QGREEN_LIGHT: [number, number, number] = [224, 238, 220];
const QGREEN_BG: [number, number, number] = [238, 244, 235];
const QRED: [number, number, number] = [196, 42, 30];
const QCOL_FRACS = [0, 0.2, 0.48, 0.74, 1];

function quoteBg(doc: jsPDF, pageW: number, pageH: number) {
  doc.setFillColor(...QGREEN_BG);
  doc.rect(0, 0, pageW, pageH, 'F');
}

function kv(doc: jsPDF, x: number, y: number, label: string, value: string, valueColor: [number, number, number] | null, maxWidth: number | null): number {
  const labelText = `${String(label).replace(/:\s*$/, '')}:`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...QGREEN_LABEL);
  doc.text(labelText, x, y);
  const gap = doc.getTextWidth(labelText) + 1.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (valueColor) doc.setTextColor(...valueColor);
  else doc.setTextColor(20, 20, 20);
  const valueW = maxWidth ? Math.max(maxWidth - gap, 22) : null;
  const lines: string[] = valueW ? doc.splitTextToSize(String(value), valueW) : [String(value)];
  doc.text(lines, x + gap, y);
  doc.setTextColor(20, 20, 20);
  return lines.length;
}

function greenBar(doc: jsPDF, y: number, pageW: number, items: { label: string; value: string; color?: [number, number, number] }[]): number {
  const barH = 13;
  doc.setFillColor(...QGREEN_DARK);
  doc.rect(12, y, pageW - 24, barH, 'F');
  const usableW = pageW - 24;
  const fracs = items.length === 4 ? QCOL_FRACS : items.map((_, i) => i / items.length).concat([1]);
  items.forEach((it, i) => {
    const x = 12 + usableW * fracs[i] + (i === 0 ? 3 : 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.setTextColor(220, 232, 224);
    doc.text(it.label.toUpperCase(), x, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    if (it.color) doc.setTextColor(...it.color);
    else doc.setTextColor(255, 255, 255);
    doc.text(it.value, x, y + 10.5);
  });
  doc.setTextColor(20, 20, 20);
  return y + barH + 6;
}

function greenTable(doc: jsPDF, y: number, pageW: number, rows: { month: number; opening: number; payment: number; closing: number }[]): number {
  const usableW = pageW - 24;
  const colX = [12 + usableW * QCOL_FRACS[0], 12 + usableW * QCOL_FRACS[1], 12 + usableW * QCOL_FRACS[2], 12 + usableW * QCOL_FRACS[3]];
  const rowH = 5.6;
  const drawHeader = (yy: number) => {
    doc.setFillColor(...QGREEN_DARK);
    doc.rect(12, yy, usableW, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);
    doc.text('MONTH', colX[0] + 3, yy + 3.9);
    doc.text('OPENING BALANCE', colX[1], yy + 3.9);
    doc.text('MONTHLY PAYMENT', colX[2], yy + 3.9);
    doc.text('CLOSING BALANCE', colX[3], yy + 3.9);
  };
  drawHeader(y);
  y += rowH;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  rows.forEach((r, i) => {
    if (y > 280) {
      doc.addPage();
      quoteBg(doc, pageW, 297);
      y = 16;
      drawHeader(y);
      y += rowH;
    }
    if (i % 2 === 1) {
      doc.setFillColor(...QGREEN_LIGHT);
      doc.rect(12, y, usableW, rowH, 'F');
    }
    doc.setTextColor(20, 20, 20);
    doc.text(String(r.month), colX[0] + 3, y + 3.9);
    doc.text(ghs(r.opening), colX[1], y + 3.9);
    doc.text(ghs(r.payment), colX[2], y + 3.9);
    doc.text(ghs(r.closing), colX[3], y + 3.9);
    y += rowH;
  });
  return y + 5;
}

export interface QuotationClientInfo {
  name: string;
  contact?: string;
  address?: string;
  email?: string;
}

export function buildQuotationPdf(q: QuotationTotals, noPlots: number, client: QuotationClientInfo, config: Config, logoDataUri: string | null, preparedByName: string, preparerSignature: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const dateStr = new Date().toLocaleDateString();
  const siteName = config.quoteSiteName || 'P.O Box CO3644, Tema, Accra-Ghana';
  const companyName = config.quoteCompanyName || 'Trulander JSF Limited';
  const docType = config.quoteDocTypeText || 'Quotation with Payment Plan Schedule';
  quoteBg(doc, pageW, pageH);

  if (logoDataUri) {
    try {
      doc.addImage(logoDataUri, 'PNG', 12, 10, 26, 26);
    } catch {
      // A malformed or unloaded logo shouldn't block the rest of the document.
    }
  }
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text(companyName, 44, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 112, 133);
  doc.text(siteName, 44, 29);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  const typeLines: string[] = doc.splitTextToSize(docType, 60);
  typeLines.forEach((line, i) => doc.text(line, pageW - 12, 15 + i * 5, { align: 'right' }));

  let y = 48;
  const leftX = 14;
  const rightX = 110;
  const leftColWidth = rightX - leftX - 4;
  const rightColWidth = pageW - 12 - rightX;
  const depositPct = q.planMonths && q.net > 0 ? Math.round(((q.deposit || 0) / q.net) * 100) : null;
  const leftRows: [string, string][] = [
    ['Customer Name', client.name],
    ['Address', client.address || '—'],
    ['Contact / Phone', client.contact || '—'],
    ['Email', client.email || '—'],
    ['Payment Plan', q.planMonths ? `${q.planMonths} Months` : 'Outright'],
    ['Deposit Amount', q.planMonths ? ghs(q.deposit) : '—'],
    ['Deposit %', depositPct != null ? `${depositPct}%` : '—'],
  ];
  const rightRows: [string, string, [number, number, number] | null][] = [
    ['Date:', dateStr, null],
    ['Credit Period months', q.planMonths ? String(q.planMonths) : '—', QRED],
    ['No of Plots', String(noPlots), QRED],
    ['Original Plot Price', ghs(q.listTotal / noPlots), null],
    ['Discount', ghs((q.discountTotal || 0) / noPlots), null],
    ['Interest', ghs((q.interestTotal || 0) / noPlots), null],
    ['Cost with Interest', ghs((q.net + q.interestTotal) / noPlots), null],
    ['Total', ghs(q.grand), null],
  ];
  let ly = y;
  leftRows.forEach((r) => {
    const n = kv(doc, leftX, ly, r[0], r[1], null, leftColWidth);
    ly += n > 1 ? n * 4.6 + 4.5 : 8.6;
  });
  let ry = y;
  rightRows.forEach((r) => {
    const n = kv(doc, rightX, ry, r[0], r[1], r[2], rightColWidth);
    ry += n > 1 ? n * 4.6 + 4.5 : 8.6;
  });
  y = Math.max(ly, ry) + 5;

  if (q.planMonths) {
    y = greenBar(doc, y, pageW, [
      { label: 'Total Value', value: ghs(q.grand) },
      { label: 'Deposit', value: ghs(q.deposit), color: QRED },
      { label: 'Balance', value: ghs(q.balance) },
      { label: 'Monthly Due', value: ghs(q.monthlyDue) },
    ]);
    y = greenTable(doc, y, pageW, q.schedule);
  } else {
    y = greenBar(doc, y, pageW, [{ label: 'Total Due (Outright)', value: ghs(q.grand) }]);
  }
  y += 4;

  if (y > 265) {
    doc.addPage();
    quoteBg(doc, pageW, pageH);
    y = 20;
  }
  const notesStartY = y;
  const notes = (config.quoteNotesText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text('Note:', 14, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80, 90, 84);
  notes.forEach((n, i) => {
    const lines: string[] = doc.splitTextToSize(`${i + 1}. ${n}`, 88);
    doc.text(lines, 14, y);
    y += lines.length * 3.2;
  });
  const totalsX = 115;
  let ty = notesStartY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  const totalsRows: [string, string][] = [
    ['Total Monthly Payments', ghs(q.balance)],
    ['Advance Payment', ghs(q.deposit)],
    ['Total Invoice Amount', ghs(q.grand)],
  ];
  totalsRows.forEach((r, i) => {
    doc.text(r[0], totalsX, ty + i * 7);
    doc.text(r[1], pageW - 12, ty + i * 7, { align: 'right' });
  });
  y = Math.max(y, ty + totalsRows.length * 7) + 7;

  if (y > 260) {
    doc.addPage();
    quoteBg(doc, pageW, pageH);
    y = 20;
  }
  // Prepared-by signoff -- whoever's signed in and generating this quote,
  // stamped with their own saved signature (same per-staff signature used
  // on the payment receipt and leave letter), so every quotation carries a
  // genuine personal signoff rather than just a name printed in text.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text('Prepared by:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(preparedByName, 45, y);
  if (preparerSignature) pdfStampSignature(doc, 95, y - 9, 28, 12, preparerSignature);
  y += 13;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  doc.text('Offer Acceptance', 14, y);
  y += 6.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Name......................................................', 14, y);
  doc.text('Signature............................................', 95, y);
  doc.text('Date .............................', 165, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const landLines: string[] = doc.splitTextToSize(`Note: ${config.quoteLandNoteText || ''}`, pageW - 24);
  doc.text(landLines, 14, y);
  y += landLines.length * 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...QGREEN_DARK);
  doc.text('Thank you for your business!', pageW / 2, pageH - 16, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 124);
  doc.text(config.quoteFooterAddress || '', pageW / 2, pageH - 11, { align: 'center' });

  return doc;
}

export function quotationFilename(clientName: string): string {
  return `Quotation_${clientName.replace(/\s+/g, '_')}_${today()}.pdf`;
}
