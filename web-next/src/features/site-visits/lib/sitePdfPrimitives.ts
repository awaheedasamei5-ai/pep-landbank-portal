import type { jsPDF } from 'jspdf';
import { sanitizePdfText } from '../../../shared/lib/pdfText';

// Exact port of index.html's real Site Visit PDF primitives (pdfHeader,
// pdfSectionBar, pdfLabeledPair, pdfCheckRow, pdfFields, svaGridRow --
// index.html:15540-16027), verbatim colors/spacing/fonts, not the more
// generic pdfReport.ts toolkit -- the user supplied v1's own real
// generated PDFs as ground truth ("this is how the site visit and site
// visit authorization form should look like") and these three real
// documents (Site Visit Request, Authorization, and the day-based SVE
// report that reuses the same visual family) need to actually match
// that, not just be "in the spirit of" the app's general report style.
export const SITE_NAVY: [number, number, number] = [11, 30, 61];
export const SITE_LIME: [number, number, number] = [132, 204, 22];
export const SITE_MUTED: [number, number, number] = [100, 112, 133];
export const SITE_INK: [number, number, number] = [20, 20, 20];

// Full-width navy band, logo top-left, "PEP LANDBANK" + subtitle, title
// right-aligned -- index.html:15648-15660.
export function sitePdfHeader(doc: jsPDF, title: string, logoDataUri: string | null): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...SITE_NAVY);
  doc.rect(0, 0, pageW, 26, 'F');
  if (logoDataUri) {
    try {
      doc.addImage(logoDataUri, 'PNG', 12, 4, 18, 18);
    } catch {
      // A malformed logo shouldn't block the rest of the document.
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PEP LANDBANK', 36, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Royal Palm Enclave, Tsopoli · Trulander JSF Limited', 36, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(sanitizePdfText(title), pageW - 12, 16, { align: 'right' });
  doc.setTextColor(...SITE_INK);
  return 34;
}

// Full-width navy bar with a lime accent underline -- index.html:15996-16003.
export function sitePdfSectionBar(doc: jsPDF, y: number, pageW: number, label: string): number {
  doc.setFillColor(...SITE_NAVY);
  doc.rect(12, y, pageW - 24, 7.5, 'F');
  doc.setDrawColor(...SITE_LIME);
  doc.setLineWidth(0.8);
  doc.line(12, y + 7.5, pageW - 12, y + 7.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(sanitizePdfText(label), 14, y + 5.2);
  doc.setTextColor(...SITE_INK);
  return y + 7.5 + 5;
}

// Small caps muted label + bold-ish value, wrapped to width w -- returns
// line count so a caller can align two side-by-side pairs to the taller
// one -- index.html:16004-16011.
export function sitePdfLabeledPair(doc: jsPDF, x: number, y: number, w: number, label: string, value: string | number | null | undefined): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...SITE_MUTED);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...SITE_INK);
  const lines = doc.splitTextToSize(sanitizePdfText(String(value || '—')), w);
  lines.forEach((line: string, i: number) => doc.text(line, x, y + 4.5 + i * 4.5));
  return lines.length;
}

// A row of real checkboxes -- every option shown, the selected one
// filled lime + bold navy text. v1's own real algorithm (index.html:
// 16012-16028) just packed items left-to-right with a fixed gap and
// wrapped on overflow -- invisible in v1 itself (its longest option set
// was 4 short words that always fit one line), but exposed a real
// ragged-alignment problem once this app's own 7-day schedule (Monday
// ... Sunday, longer labels) needed the same row and had to wrap. This
// computes a genuine equal-width grid instead -- every column starts at
// the same x on every row, sized off the single widest option in the
// set, so the boxes actually line up regardless of how many rows the
// options wrap onto.
export function sitePdfCheckRow(doc: jsPDF, y: number, pageW: number, options: string[], selected: string | null | undefined): number {
  doc.setFontSize(9.5);
  const usableW = pageW - 26;
  const maxOptW = Math.max(...options.map((o) => doc.getTextWidth(o))) + 14;
  const perRow = Math.max(1, Math.min(options.length, Math.floor(usableW / maxOptW)));
  const colW = usableW / perRow;
  const lh = 6.4;
  options.forEach((opt, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = 13 + col * colW;
    const oy = y + row * lh;
    const isSel = String(selected || '').trim().toLowerCase() === opt.toLowerCase();
    doc.setDrawColor(...SITE_NAVY);
    doc.setLineWidth(0.5);
    doc.rect(x, oy - 3.2, 3.6, 3.6);
    if (isSel) {
      doc.setFillColor(...SITE_LIME);
      doc.rect(x + 0.5, oy - 2.7, 2.6, 2.6, 'F');
    }
    doc.setFont('helvetica', isSel ? 'bold' : 'normal');
    doc.setTextColor(isSel ? SITE_NAVY[0] : 90, isSel ? SITE_NAVY[1] : 100, isSel ? SITE_NAVY[2] : 112);
    doc.text(sanitizePdfText(opt), x + 5.5, oy);
  });
  doc.setTextColor(...SITE_INK);
  const rows = Math.ceil(options.length / perRow);
  return y + rows * lh + 2;
}

// Stacked full-width label/value blocks (used for free-text fields where
// side-by-side pairing doesn't make sense) -- index.html:15910-15922.
export function sitePdfFields(doc: jsPDF, y: number, fields: [string, string | number | null | undefined][]): number {
  const pageW = doc.internal.pageSize.getWidth();
  fields.forEach(([label, value]) => {
    if (y > 272) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SITE_MUTED);
    doc.setFontSize(8.5);
    doc.text(sanitizePdfText(String(label).toUpperCase()), 12, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SITE_INK);
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(sanitizePdfText(String(value == null || value === '' ? '—' : value)), pageW - 24);
    lines.forEach((line: string, i: number) => doc.text(line, 12, y + 5 + i * 5));
    y += 5 + lines.length * 5 + 4;
  });
  return y;
}

export interface SvaGridCell {
  text?: string | number | null;
  span?: number;
  bold?: boolean;
  align?: 'left' | 'right' | 'center';
  size?: number;
}

// One bordered row of a real spreadsheet-style grid table -- every cell
// gets its own rect() (so borders always meet cleanly regardless of
// span), text is truncated with an ellipsis rather than overflowing --
// index.html:15540-15562.
export function svaGridRow(doc: jsPDF, x0: number, y: number, colWidths: number[], cells: SvaGridCell[], h = 6.2): number {
  doc.setDrawColor(...SITE_INK);
  doc.setLineWidth(0.2);
  let x = x0;
  let col = 0;
  cells.forEach((cell) => {
    const span = cell.span || 1;
    let w = 0;
    for (let i = 0; i < span; i++) w += colWidths[col + i] || 0;
    doc.rect(x, y, w, h);
    if (cell.text != null && cell.text !== '') {
      doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
      doc.setFontSize(cell.size || 7);
      doc.setTextColor(...SITE_INK);
      const align = cell.align || 'left';
      const pad = 1.6;
      const maxW = w - pad * 2;
      const tx = align === 'right' ? x + w - pad : align === 'center' ? x + w / 2 : x + pad;
      let txt = sanitizePdfText(String(cell.text));
      if (doc.getTextWidth(txt) > maxW) {
        while (txt.length > 1 && doc.getTextWidth(txt + '...') > maxW) txt = txt.slice(0, -1);
        txt += '...';
      }
      doc.text(txt, tx, y + h / 2 + 1.1, { align });
    }
    x += w;
    col += span;
  });
  return h;
}
