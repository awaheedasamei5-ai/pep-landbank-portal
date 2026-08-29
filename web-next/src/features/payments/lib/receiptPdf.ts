import { jsPDF } from 'jspdf';
import { ghs } from '../../../shared/lib/format';
import type { Config, Lead, Payment } from '../../../types/domain';

// Port of index.html's buildReceiptPDF()/pdfReceiptHeaderBand()/
// pdfReceiptRow() (index.html:17607-17780) -- same navy/gold branded
// layout: full-width navy header band with a gold rule, bill-to/issued-by
// two-column grid, a one-row payment-details table, a totals box (paid to
// date / balance / PAID IN FULL), payment-info + notes columns, and a
// signature line. Signature stamping (index.html's pdfStampSignature via
// getStaffSignature()) is left out -- this app has no staff signature
// capture UI yet, and the real receipt already renders correctly without
// one (the real code guards it with `if(issuerSig)`, so omitting a
// signature was already a valid, expected state, not a shortcut).
const INK: [number, number, number] = [11, 30, 61];
const GOLD: [number, number, number] = [201, 162, 39];
const GOLD2: [number, number, number] = [232, 199, 102];
const DARK: [number, number, number] = [16, 24, 32];
const GRAY: [number, number, number] = [92, 114, 128];
const LINE: [number, number, number] = [222, 230, 234];
const PAPER: [number, number, number] = [250, 251, 252];

function fitText(doc: jsPDF, text: string, maxW: number): string {
  const s = String(text ?? '');
  if (!s) return '';
  if (doc.getTextWidth(s) <= maxW) return s;
  let t = s;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function receiptRow(doc: jsPDF, x: number, y: number, colW: number, label: string, value: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...GRAY);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  doc.text(fitText(doc, value, colW), x, y + 4.8);
}

function headerBand(doc: jsPDF, pageW: number, ref: string, dateStr: string, companyName: string): number {
  const bandH = 40;
  doc.setFillColor(...INK);
  doc.rect(0, 0, pageW, bandH, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, bandH, pageW, 1.1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(255, 255, 255);
  doc.text('PAYMENT RECEIPT', 14, 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GOLD2);
  doc.text(companyName, 14, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(205, 213, 222);
  doc.text(`Receipt No. ${ref}`, 14, 34);
  doc.text(dateStr, pageW - 14, 34, { align: 'right' });
  return bandH + 1.1;
}

export interface BuildReceiptParams {
  clientName: string;
  payment: Payment;
  lead: Lead | null;
  receiptNumber: string;
  config: Config;
  paidAsOf?: number;
}

export function buildReceiptPdf({ clientName, payment, lead, receiptNumber, config, paidAsOf }: BuildReceiptParams): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const ref = receiptNumber;
  const dateStr = payment.date ? new Date(`${payment.date}T00:00:00`).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
  const siteName = config.quoteSiteName || 'Royal Palm Enclave, Tsopoli';
  const companyName = config.quoteCompanyName || 'Trulander JSF Limited';
  const L = 14;
  const R = 196;
  const colW = (R - L - 10) / 2;
  const colLx = L;
  const colRx = L + colW + 10;

  doc.setFillColor(...PAPER);
  doc.rect(0, 0, pageW, pageH, 'F');
  let y = headerBand(doc, pageW, ref, dateStr, companyName);
  doc.setTextColor(...DARK);
  y += 10;
  if (config.companyTin) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Tax ID: ${config.companyTin}`, L, y);
    y += 7;
  } else {
    y += 2;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('BILL TO', colLx, y);
  doc.text('ISSUED BY', colRx, y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(colLx, y + 1.5, colLx + 16, y + 1.5);
  doc.line(colRx, y + 1.5, colRx + 16, y + 1.5);
  y += 8;
  const rowH = 10.5;
  const billRows: [string, string][] = [
    ['Name', clientName],
    ['Plot', lead ? `${lead.plotType || 'Plot'} × ${lead.noPlots || 1}` : '—'],
    ['Phone', lead?.contact || '—'],
    ['Email', '—'],
  ];
  const issuedRows: [string, string][] = [
    ['Name', companyName],
    ['Address', config.quoteFooterAddress || siteName],
    ['Phone', config.companyPhone || '—'],
    ['Email', config.companyEmail || '—'],
  ];
  for (let i = 0; i < 4; i++) {
    receiptRow(doc, colLx, y + i * rowH, colW, billRows[i][0], billRows[i][1]);
    receiptRow(doc, colRx, y + i * rowH, colW, issuedRows[i][0], issuedRows[i][1]);
  }
  y += 4 * rowH + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('PAYMENT DETAILS', L, y);
  doc.setDrawColor(...GOLD);
  doc.line(L, y + 1.5, L + 16, y + 1.5);
  y += 6;
  const tblX = [L, 98, 120, 158];
  const tblW = [84, 22, 38, 38];
  doc.setFillColor(...INK);
  doc.rect(L, y, R - L, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DESCRIPTION', tblX[0] + 3, y + 5.3);
  doc.text('QTY', tblX[1] + 3, y + 5.3);
  doc.text('UNIT PRICE', tblX[2] + 3, y + 5.3);
  doc.text('TOTAL', tblX[3] + 3, y + 5.3);
  y += 8;
  const grand = lead?.grandTotal ?? 0;
  const noPlots = lead ? lead.noPlots || 1 : 1;
  const desc = lead ? `${lead.plotType || 'Plot'} — ${siteName}` : 'Payment received';
  const unitPrice = lead ? ghs(grand / noPlots) : '—';
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(L, y, R - L, 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text(fitText(doc, desc, tblW[0] - 6), tblX[0] + 3, y + 6.2);
  doc.text(String(noPlots), tblX[1] + 3, y + 6.2);
  doc.text(unitPrice, tblX[2] + tblW[2] - 3, y + 6.2, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(ghs(payment.amount), tblX[3] + tblW[3] - 3, y + 6.2, { align: 'right' });
  y += 9.5 + 4;

  if (lead) {
    const paid = paidAsOf ?? lead.amtPaid;
    const bal = Math.max(grand - paid, 0);
    const boxX = tblX[2];
    const totRows: [string, string, boolean][] = [
      ['Total contract price', ghs(grand), false],
      ['Paid to date', ghs(paid), false],
      [bal <= 0 ? 'Status' : 'Balance remaining', bal <= 0 ? 'PAID IN FULL' : ghs(bal), true],
    ];
    totRows.forEach((row, i) => {
      const ry = y + i * 7.8;
      if (i > 0) {
        doc.setDrawColor(...LINE);
        doc.line(boxX, ry - 5.2, R, ry - 5.2);
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY);
      doc.text(row[0], boxX + 3, ry);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(row[2] ? 11 : 9.5);
      if (row[2]) doc.setTextColor(...GOLD);
      else doc.setTextColor(...DARK);
      doc.text(row[1], R - 3, ry, { align: 'right' });
    });
    y += 3 * 7.8 + 8;
  } else {
    y += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('PAYMENT INFORMATION', colLx, y);
  doc.text('NOTES', colRx, y);
  doc.setDrawColor(...GOLD);
  doc.line(colLx, y + 1.5, colLx + 16, y + 1.5);
  doc.line(colRx, y + 1.5, colRx + 16, y + 1.5);
  y += 8;
  const balNow = lead ? Math.max(grand - (paidAsOf ?? lead.amtPaid), 0) : 0;
  const payRows: [string, string][] = [
    ['Payment Method', payment.paymentMethod || '—'],
    ['Reference No.', ref],
    ['Payment Date', dateStr],
    ['Status', lead ? (balNow <= 0 ? 'PAID IN FULL' : 'PARTIAL PAYMENT') : 'RECEIVED'],
  ];
  payRows.forEach((row, i) => receiptRow(doc, colLx, y + i * rowH, colW, row[0], row[1]));

  const notes = [config.receiptThanksText || 'This receipt confirms the amount above was received by us and applied to your account.', 'Please keep this document for your records.'];
  notes.push(`For inquiries, contact us at ${config.companyEmail || config.companyPhone || 'the office'}`);
  let ny = y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  notes.forEach((n) => {
    doc.setFillColor(...GOLD);
    doc.circle(colRx + 1, ny - 1.4, 0.8, 'F');
    const lines = doc.splitTextToSize(n, colW - 6);
    doc.text(lines, colRx + 5, ny);
    ny += lines.length * 4.2 + 2.4;
  });
  y = Math.max(y + 4 * rowH, ny) + 6;

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(L, y, L + 65, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text('Authorized Signature', L, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text(`${companyName} — ${siteName}`, L, pageH - 8);

  return doc;
}
