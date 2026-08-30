import { jsPDF } from 'jspdf';
import { ghs, today } from '../../../shared/lib/format';
import { pdfStampSignature } from '../../../shared/lib/pdfSignature';
import { greenBar, greenTable, kv, quoteBg, QGREEN_DARK, QGREEN_LIGHT, QRED, type QuotationClientInfo } from './quotationPdf';
import type { Config } from '../../../types/domain';
import type { TechnicalQuotationTotals } from './quotationLogic';

// Faithful port of index.html's buildTechnicalQuotationPDF() (index.html:
// 16952-17047+) -- "same header/branding/payment-plan-schedule/notes/
// signature skeleton as buildQuotationPDF (per spec: must match our
// current PDF template layout and branding styling)" per the real code's
// own comment, with a geometry line-item breakdown table (pdfLineItemTable,
// index.html:15888-15909) in place of the flat plot-price KV rows.
function sqft(x: number): string {
  return x.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' sq ft';
}

function ghsPerSqft(x: number): string {
  return 'GHS ' + x.toLocaleString('en-US', { maximumFractionDigits: 4 }) + '/sq.ft';
}

interface LineItem {
  label: string;
  value: string;
  bold?: boolean;
}

// Same green-header/striped-row visual language as greenTable so it reads
// as one continuous branded document rather than a bolted-on section.
function lineItemTable(doc: jsPDF, y: number, pageW: number, pageH: number, rows: LineItem[]): number {
  const usableW = pageW - 24;
  const labelX = 12 + 3;
  const valueRightX = pageW - 12;
  const rowH = 6.2;
  doc.setFillColor(...QGREEN_DARK);
  doc.rect(12, y, usableW, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('ITEM', labelX, y + 4.1);
  doc.text('AREA (SQ FT)', valueRightX, y + 4.1, { align: 'right' });
  y += rowH;
  rows.forEach((r, i) => {
    if (y > 270) {
      doc.addPage();
      quoteBg(doc, pageW, pageH);
      y = 16;
    }
    if (r.bold) {
      doc.setFillColor(...QGREEN_LIGHT);
      doc.rect(12, y, usableW, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 247);
        doc.rect(12, y, usableW, rowH, 'F');
      }
    }
    doc.setTextColor(20, 20, 20);
    const lines: string[] = doc.splitTextToSize(r.label, usableW - 40);
    doc.text(lines, labelX, y + 4.1);
    doc.text(r.value, valueRightX, y + 4.1, { align: 'right' });
    y += Math.max(rowH, lines.length * 4.2 + 2);
  });
  return y + 5;
}

export function buildTechnicalQuotationPdf(
  q: TechnicalQuotationTotals,
  client: QuotationClientInfo,
  config: Config,
  logoDataUri: string | null,
  preparedByName: string,
  preparerSignature: string | null,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const dateStr = new Date().toLocaleDateString();
  const siteName = config.quoteSiteName || 'P.O Box CO3644, Tema, Accra-Ghana';
  const companyName = config.quoteCompanyName || 'Trulander JSF Limited';
  const docType = 'Technical Quotation — Custom Land Area Pricing';
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
    ['Combined Total Area', sqft(q.totalArea), null],
    ['Dynamic Rate', ghsPerSqft(q.rate), null],
    ['Interest', ghs(q.interestTotal || 0), null],
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
  y = Math.max(ly, ry) + 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  doc.text('Land Area Breakdown', 14, y);
  y += 5;
  const items: LineItem[] = [];
  if (q.fullCount) items.push({ label: `Standard Full Plot (${config.techFullPlotLengthFt}×${config.techFullPlotWidthFt} ft) × ${q.fullCount}`, value: sqft(q.fullArea) });
  if (q.halfCount) items.push({ label: `Standard Half Plot (${config.techHalfPlotLengthFt}×${config.techHalfPlotWidthFt} ft) × ${q.halfCount}`, value: sqft(q.halfArea) });
  (q.customLots || []).forEach((lot, i) => {
    const dims = lot.shape === 'trapezoidal' ? `Trapezoidal, sides ${Number(lot.a) || 0}/${Number(lot.b) || 0} ft, height ${Number(lot.h) || 0} ft` : `Rectangular, ${Number(lot.len) || 0}×${Number(lot.wid) || 0} ft`;
    items.push({ label: `Custom Plot ${i + 1} (${dims})`, value: sqft(q.customAreas[i]) });
  });
  items.push({ label: 'Combined Total Area', value: sqft(q.totalArea), bold: true });
  y = lineItemTable(doc, y, pageW, pageH, items);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.text('Dynamic Rate: ' + ghsPerSqft(q.rate), 14, y);
  doc.text('Final Total Amount: ' + ghs(q.net), pageW - 12, y, { align: 'right' });
  y += 8;

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

export function technicalQuotationFilename(clientName: string): string {
  return `TechnicalQuotation_${clientName.replace(/\s+/g, '_')}_${today()}.pdf`;
}
