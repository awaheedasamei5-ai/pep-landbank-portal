import type { jsPDF } from 'jspdf';

// Shared branded-report toolkit -- port of index.html's PDF_*/pdf* report
// primitives (index.html:15663-15785, 22914-22968), the same navy/gold/
// leaf/ok/warn/danger palette the app's own CSS variables use and the same
// jsPDF rect()/line()/circle() chart-drawing approach the 9am daily
// management-report edge function already relies on -- so an on-demand
// report looks like it belongs to the same family of documents as the one
// Management already gets emailed every morning. Every internal (not
// client-facing) report PDF -- Commission, and later Company/Master
// Pipeline -- is built from these same functions, not a bespoke layout
// each time.
export const PDF_INK: [number, number, number] = [11, 30, 61];
export const PDF_LEAF: [number, number, number] = [34, 211, 238];
export const PDF_GOLD: [number, number, number] = [201, 162, 39];
export const PDF_OK: [number, number, number] = [22, 163, 74];
export const PDF_WARN: [number, number, number] = [184, 121, 30];
export const PDF_DANGER: [number, number, number] = [180, 71, 47];
export const PDF_MUTED: [number, number, number] = [92, 114, 128];
export const PDF_PALETTE: [number, number, number][] = [PDF_LEAF, PDF_GOLD, [59, 130, 246], PDF_WARN, PDF_OK, PDF_DANGER, [148, 163, 184], [124, 58, 237]];

export function pdfFitText(doc: jsPDF, text: unknown, maxW: number): string {
  const str = String(text == null ? '' : text);
  if (!str) return '';
  if (doc.getTextWidth(str) <= maxW) return str;
  let t = str;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
}

// Full-width navy header band with the PEP Landbank logo on its own white
// badge, bold title + subtitle, right-aligned generated-by/date lines.
export function pdfBrandedHeader(doc: jsPDF, title: string, subtitle: string, rightLines: string[], logoDataUri: string | null): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_INK);
  doc.rect(0, 0, pageW, 32, 'F');
  if (logoDataUri) {
    try {
      doc.addImage(logoDataUri, 'PNG', 14, 7, 20, 20);
    } catch {
      // A malformed logo shouldn't block the rest of the report.
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(title, 42, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(200, 214, 235);
  doc.text(subtitle, 42, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(200, 214, 235);
  (rightLines || []).forEach((line, i) => doc.text(line, pageW - 14, 13 + i * 6, { align: 'right' }));
  doc.setTextColor(20, 20, 20);
  return 42;
}

export function pdfSectionTitle(doc: jsPDF, y: number, pageW: number, text: string): number {
  doc.setFillColor(...PDF_GOLD);
  doc.rect(12, y - 3.6, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_INK);
  doc.text(text, 17, y);
  doc.setDrawColor(200, 208, 220);
  doc.setLineWidth(0.4);
  doc.line(12, y + 2.5, pageW - 12, y + 2.5);
  doc.setTextColor(20, 20, 20);
  return y + 10;
}

export interface PdfStatItem {
  label: string;
  value: string | number;
  accent?: [number, number, number];
}

function pdfAccentStatCard(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, accent?: [number, number, number]) {
  const h = 20;
  doc.setFillColor(244, 246, 248);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');
  if (accent) {
    doc.setFillColor(...accent);
    doc.rect(x, y, 2.2, h, 'F');
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(...PDF_MUTED);
  doc.text(label.toUpperCase(), x + 5, y + 7, { maxWidth: w - 8 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(20, 20, 20);
  doc.text(pdfFitText(doc, value, w - 9), x + 5, y + 15.5);
}

// Auto-wraps onto a second row of cards if more than 4 items are passed --
// keeps each card a legible width instead of squeezing 5-6 into one row.
export function pdfAccentStatRow(doc: jsPDF, y: number, pageW: number, items: PdfStatItem[]): number {
  const usable = pageW - 24;
  const gap = 4;
  const perRow = items.length > 4 ? Math.ceil(items.length / 2) : items.length;
  const rows: PdfStatItem[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  rows.forEach((row) => {
    const w = (usable - gap * (row.length - 1)) / row.length;
    row.forEach((it, i) => pdfAccentStatCard(doc, 12 + i * (w + gap), y, w, it.label, String(it.value), it.accent));
    y += 26;
  });
  return y;
}

export interface PdfBar {
  label: string;
  value: number;
  color?: [number, number, number];
}

// Simple vertical bar chart -- bars sized relative to the largest value in
// the set, value printed above each bar, label beneath. No axis/gridlines --
// deliberately minimal so it reads at a glance rather than like a full BI tool.
export function pdfBarChart(doc: jsPDF, x: number, y: number, w: number, h: number, bars: PdfBar[]): number {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const gap = 3;
  const barW = (w - gap * (bars.length - 1)) / bars.length;
  bars.forEach((b, i) => {
    const barH = Math.max(1, (b.value / max) * (h - 12));
    const bx = x + i * (barW + gap);
    const by = y + (h - 12) - barH;
    const c = b.color || PDF_LEAF;
    doc.setFillColor(...c);
    doc.rect(bx, by, barW, barH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(20, 20, 20);
    doc.text(String(b.value), bx + barW / 2, by - 1.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...PDF_MUTED);
    doc.text(pdfFitText(doc, b.label, barW + gap), bx + barW / 2, y + h - 6, { align: 'center' });
  });
  doc.setTextColor(20, 20, 20);
  return y + h + 6;
}

// Numeric-looking columns (amounts, percentages, plain counts) right-align --
// judged once per column from that column's own first data row -- so
// figures stack on their ones place like a real ledger instead of every
// cell sitting flush-left regardless of whether it holds a name or a number.
function pdfIsNumericCell(v: unknown): boolean {
  return /^-?(GHS\s?)?[\d,]+(\.\d+)?%?$/.test(String(v == null ? '' : v).trim());
}

export function pdfSimpleTable(doc: jsPDF, y: number, pageW: number, headers: string[], rows: string[][], colPct: number[]): number {
  const usableW = pageW - 24;
  const colW = colPct.map((p) => usableW * p);
  const colX = [12];
  for (let i = 1; i < colW.length; i++) colX.push(colX[i - 1] + colW[i - 1]);
  const rowH = 7.4;
  const numCol = headers.map((_, i) => (rows.length ? pdfIsNumericCell(rows[0][i]) : false));
  doc.setFillColor(...PDF_INK);
  doc.rect(12, y, usableW, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.setTextColor(255, 255, 255);
  headers.forEach((h, i) => {
    if (numCol[i]) doc.text(h, colX[i] + colW[i] - 3, y + 5, { align: 'right' });
    else doc.text(h, colX[i] + 3, y + 5);
  });
  y += rowH;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  rows.forEach((r, i) => {
    if (y > 270) {
      doc.addPage();
      y = 16;
    }
    if (i % 2 === 1) {
      doc.setFillColor(245, 247, 250);
      doc.rect(12, y, usableW, rowH, 'F');
    }
    doc.setTextColor(20, 20, 20);
    r.forEach((cell, ci) => {
      if (numCol[ci]) doc.text(String(cell), colX[ci] + colW[ci] - 3, y + 5, { align: 'right' });
      else doc.text(pdfFitText(doc, cell, colW[ci] - 5), colX[ci] + 3, y + 5);
    });
    doc.setDrawColor(232, 236, 241);
    doc.setLineWidth(0.2);
    doc.line(12, y + rowH, 12 + usableW, y + rowH);
    y += rowH;
  });
  return y + 7;
}

// Stamps every page of a finished report with a thin rule + confidentiality
// line + "Page X of Y" -- call this once, right before doc.save(), after
// all content (including any addPage() calls) is already in place.
export function pdfReportFooter(doc: jsPDF, companyName: string | null | undefined) {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 224, 230);
    doc.setLineWidth(0.3);
    doc.line(12, pageH - 14, pageW - 12, pageH - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 130, 145);
    doc.text((companyName || 'PEP Landbank') + ' · Confidential', 12, pageH - 9);
    doc.text('Page ' + i + ' of ' + pageCount, pageW - 12, pageH - 9, { align: 'right' });
  }
  doc.setTextColor(20, 20, 20);
}
