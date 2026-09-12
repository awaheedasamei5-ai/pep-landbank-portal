import { jsPDF } from 'jspdf';
import { sitePdfHeader } from '../../site-visits/lib/sitePdfPrimitives';
import { pdfStampSignature } from '../../../shared/lib/pdfSignature';
import { fmtLongDate, today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';

// Exact port of V1's real buildLeaveLetterText() -- Plan Part 1: "a
// specific header/body/date-list/signature structure that does not
// vary" -- the leave letter is fully auto-generated, not free text typed
// by the requester. Emergency leave appends one extra line after this
// same generated body ("\n\n(Emergency leave — <reason>)"), the sole
// deviation V1's real letter allows.
export function buildLeaveLetterText(agentName: string, dates: string[], year: number, companyName: string | null | undefined): string {
  const sorted = dates.slice().sort();
  const dateLines = sorted.map((d) => '- ' + fmtLongDate(d)).join('\n');
  const n = dates.length;
  return [
    'Date: ' + fmtLongDate(today()),
    '',
    'The Management',
    companyName || 'Trulander JSF Limited',
    '',
    'Dear Sir/Madam,',
    '',
    'REQUEST FOR LEAVE',
    '',
    `I am writing to formally request a leave of absence for ${n} day${n === 1 ? '' : 's'} in ${year}. I have made the necessary arrangements to ensure my responsibilities are covered during my absence and will remain reachable if urgently needed.`,
    '',
    'The specific date(s) requested are:',
    dateLines,
    '',
    'I would be grateful if you could consider and approve this request. Thank you for your understanding.',
    '',
    'Yours faithfully,',
    '',
    agentName,
  ].join('\n');
}

// Exact port of V1's real buildLeaveLetterPDF() -- same line-by-line
// parse of the generated letter text (title centered/underlined, "- "
// bullet lines indented, staff signs bottom-left under "Yours
// faithfully,", Management's signature stamped directly opposite it once
// approved -- side by side like a real signed contract, not a separate
// block further down the page).
export function buildLeaveLetterPdf(request: LeaveRequest, staffSignature: string | null, logoDataUri: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = sitePdfHeader(doc, 'LEAVE REQUEST', logoDataUri);
  y += 6;
  const marginL = 14;
  const marginR = pageW - 14;
  const lines = (request.letterText || '').split('\n');
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  let afterSig = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    if (!line) {
      y += 5;
      continue;
    }
    if (/^date:/i.test(line)) {
      doc.setFontSize(10.5);
      doc.text(line, marginR, y, { align: 'right' });
      doc.setFontSize(11);
      y += 7;
      continue;
    }
    if (line.toUpperCase() === 'REQUEST FOR LEAVE') {
      doc.setFont('times', 'bold');
      doc.setFontSize(13);
      const w = doc.getTextWidth(line);
      const cx = (marginL + marginR) / 2;
      doc.text(line, cx, y, { align: 'center' });
      doc.setLineWidth(0.4);
      doc.line(cx - w / 2, y + 1.4, cx + w / 2, y + 1.4);
      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      y += 9;
      continue;
    }
    if (line.startsWith('- ')) {
      const wrapped = doc.splitTextToSize(line, marginR - marginL - 6);
      doc.text(wrapped, marginL + 6, y);
      y += wrapped.length * 5.6;
      continue;
    }
    if (/^yours faithfully,?$/i.test(line)) {
      doc.text(line, marginL, y);
      const sigTopY = y + 16;
      if (staffSignature) pdfStampSignature(doc, marginL, sigTopY - 3, 32, 13, staffSignature);
      if (request.status === 'approved') {
        doc.setFont('times', 'bold');
        doc.setFontSize(10);
        doc.text('Approved by:', marginR - 70, y);
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        if (request.decidedSignature) pdfStampSignature(doc, marginR - 70, sigTopY - 3, 32, 13, request.decidedSignature);
      }
      y = sigTopY;
      afterSig = true;
      continue;
    }
    if (afterSig) {
      doc.setFont('times', 'bold');
      doc.text(line, marginL, y);
      if (request.status === 'approved') {
        doc.setFont('times', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(90, 98, 110);
        doc.text(`${request.decidedByName || 'Management'} — ${fmtLongDate((request.decidedAt || '').slice(0, 10))}`, marginR - 70, y);
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(11);
      }
      doc.setFont('times', 'normal');
      y += 5.6;
      afterSig = false;
      continue;
    }
    const wrapped = doc.splitTextToSize(line, marginR - marginL);
    doc.text(wrapped, marginL, y);
    y += wrapped.length * 5.6;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.text('Generated ' + new Date().toLocaleDateString('en-GB'), marginR, 290, { align: 'right' });
  return doc;
}

export function leaveLetterFilename(request: LeaveRequest): string {
  return `LeaveRequest_${request.agentName.replace(/\s+/g, '_')}_${request.dates[0] || request.createdAt.slice(0, 10)}.pdf`;
}
