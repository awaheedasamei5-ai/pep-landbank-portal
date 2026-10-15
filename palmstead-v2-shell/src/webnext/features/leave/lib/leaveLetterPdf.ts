import { jsPDF } from 'jspdf';
import { SITE_INK, SITE_LIME, SITE_MUTED, SITE_NAVY } from '../../site-visits/lib/sitePdfPrimitives';
import { pdfStampSignature } from '../../../shared/lib/pdfSignature';
import { sanitizePdfText } from '../../../shared/lib/pdfText';
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

const STATUS_LABEL: Record<LeaveRequest['status'], string> = {
  planned: 'Planned - not submitted',
  pending: 'Awaiting Management review',
  approved: 'Approved',
  declined: 'Declined',
  rescheduled: 'Replacement dates requested',
};

export interface LeaveLetterPdfOptions {
  companyName?: string | null;
  generatedAt?: Date;
}

// Uses the existing site-document brand palette, with letter-specific flow
// layout. The applicant's saved text is retained; a Management amendment is
// printed separately so it cannot silently replace the original request.
export function buildLeaveLetterPdf(
  request: LeaveRequest,
  staffSignature: string | null,
  logoDataUri: string | null,
  options: LeaveLetterPdfOptions = {},
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 20;
  const right = pageW - left;
  const width = right - left;
  const bottom = 272;
  const generatedAt = options.generatedAt ?? new Date();
  const company = sanitizePdfText(options.companyName?.trim() || 'Trulander JSF Limited');
  const reference = sanitizePdfText(request.requestNo || 'Reference not assigned');
  let y = 0;

  doc.setProperties({
    title: `Leave request - ${request.requestNo || request.agentName}`,
    subject: `Leave request for ${request.year}`,
    author: company,
    creator: 'Palmstead',
  });
  doc.setCreationDate(generatedAt);

  function bodyFont() {
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...SITE_INK);
  }

  function header(firstPage: boolean) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SITE_NAVY);
    if (firstPage) {
      let brandX = left;
      if (logoDataUri) {
        try {
          const image = doc.getImageProperties(logoDataUri);
          const scale = Math.min(20 / image.width, 20 / image.height);
          const logoW = image.width * scale;
          const logoH = image.height * scale;
          doc.addImage(logoDataUri, image.fileType, left, 16 + (20 - logoH) / 2, logoW, logoH);
          brandX += 25;
        } catch {
          // The letter remains readable when an optional logo cannot load.
        }
      }
      doc.setFontSize(13);
      const companyLines = doc.splitTextToSize(company, right - brandX) as string[];
      doc.text(companyLines, brandX, 23);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const subtitleY = 23 + companyLines.length * 5;
      doc.text('PALMSTEAD  /  STAFF LEAVE', brandX, subtitleY);
      y = Math.max(39, subtitleY + 7);
    } else {
      doc.setFontSize(9);
      doc.text('LEAVE REQUEST', left, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(reference, right, 18, { align: 'right' });
      y = 32;
    }
    doc.setDrawColor(...SITE_NAVY);
    doc.setLineWidth(0.45);
    const ruleY = firstPage ? y - 3 : 24;
    doc.line(left, ruleY, right, ruleY);
    doc.setDrawColor(...SITE_LIME);
    doc.setLineWidth(1);
    doc.line(left, ruleY, left + 24, ruleY);
    bodyFont();
  }

  function ensureSpace(height: number) {
    if (y + height <= bottom) return;
    doc.addPage();
    header(false);
  }

  function paragraph(text: string, options: { bold?: boolean; size?: number; gap?: number } = {}) {
    const size = options.size ?? 11;
    const lineHeight = size * 0.49;
    doc.setFont('times', options.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...SITE_INK);
    const lines = doc.splitTextToSize(sanitizePdfText(text), width) as string[];
    // Keep a short paragraph together; long paragraphs flow a line at a time.
    ensureSpace(Math.min(lines.length, 3) * lineHeight);
    for (let index = 0; index < lines.length; index += 1) {
      ensureSpace(lineHeight);
      doc.setFont('times', options.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.text(lines[index], left, y);
      y += lineHeight;
    }
    y += options.gap ?? 2.5;
    bodyFont();
  }

  function dateList(lines: string[]) {
    // Two equal columns keep a full annual plan readable without shrinking type.
    const columnWidth = (width - 8) / 2;
    for (let index = 0; index < lines.length; index += 2) {
      bodyFont();
      const row = lines.slice(index, index + 2).map((line) =>
        doc.splitTextToSize(sanitizePdfText(line), columnWidth - 2) as string[],
      );
      const height = Math.max(...row.map((cell) => cell.length)) * 5.4;
      ensureSpace(height);
      bodyFont();
      row.forEach((cell, column) => doc.text(cell, left + 2 + column * (columnWidth + 8), y));
      y += height;
    }
    y += 3;
  }

  function section(title: string) {
    ensureSpace(18);
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...SITE_NAVY);
    doc.text(title.toUpperCase(), left, y);
    y += 7;
    bodyFont();
  }

  header(true);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SITE_NAVY);
  doc.text(reference, left, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SITE_MUTED);
  doc.text(`Leave year ${request.year}`, right, y + 2, { align: 'right' });
  y += 8;
  const status = `${request.isEmergency ? 'Emergency request  /  ' : ''}${STATUS_LABEL[request.status]}`;
  const statusLines = doc.splitTextToSize(status, width) as string[];
  doc.text(statusLines, left, y);
  y += statusLines.length * 4 + 7;
  bodyFont();

  const savedText = request.letterText?.trim() || 'No applicant letter was recorded with this request.';
  const closingMatch = /^\s*yours faithfully,?\s*$/im.exec(savedText);
  const letterBody = closingMatch ? savedText.slice(0, closingMatch.index).trimEnd() : savedText;
  const lines = letterBody.split(/\r?\n/).map((line) => line.trim());
  const submittedDateLines = lines.filter((line) => line.startsWith('- '));
  const approvedDateLines = [...request.dates].sort().map((date) => `- ${fmtLongDate(date)}`);
  const changedDates = (request.status === 'approved' || request.status === 'pending')
    && (submittedDateLines.length !== approvedDateLines.length
      || submittedDateLines.some((line, index) => line !== approvedDateLines[index]));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      if (index > 0 && lines[index - 1]) y += 2;
      continue;
    }
    if (line.startsWith('- ')) {
      const dates: string[] = [];
      while (index < lines.length && lines[index].startsWith('- ')) dates.push(lines[index++]);
      index -= 1;
      dateList(dates);
    } else {
      paragraph(line, { bold: /^REQUEST FOR LEAVE$/i.test(line), gap: /^date:/i.test(line) ? 4 : 1 });
    }
  }

  if (closingMatch) {
    // Preserve additions (for example the emergency reason) after the closing,
    // but move them above the signature row to avoid a detached final note.
    const suffix = savedText.slice(closingMatch.index + closingMatch[0].length).trim().split(/\r?\n/);
    if (suffix[0]?.trim() === request.agentName.trim()) suffix.shift();
    const extra = suffix.join('\n').trim();
    if (extra) paragraph(extra);
  }

  const signatureWidth = (width - 16) / 2;
  const managementX = right - signatureWidth;
  const decisionDate = request.decidedAt ? fmtLongDate(request.decidedAt.slice(0, 10)) : 'Decision date not recorded';

  function signatureBlock(label: string, name: string, image: string | null, x: number, top: number, note?: string) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...SITE_NAVY);
    doc.text(label, x, top);
    const baseline = top + 19;
    if (!pdfStampSignature(doc, x, baseline - 2, 42, 13, image)) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SITE_MUTED);
      doc.text('Signature not recorded', x, baseline - 4);
    }
    doc.setDrawColor(180, 185, 192);
    doc.setLineWidth(0.2);
    doc.line(x, baseline, x + signatureWidth, baseline);
    doc.setFont('times', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...SITE_INK);
    const nameLines = doc.splitTextToSize(sanitizePdfText(name), signatureWidth) as string[];
    doc.text(nameLines, x, baseline + 5);
    let height = 26 + (nameLines.length - 1) * 5;
    if (note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...SITE_MUTED);
      const noteLines = doc.splitTextToSize(sanitizePdfText(note), signatureWidth) as string[];
      doc.text(noteLines, x, top + height + 4);
      height += noteLines.length * 4 + 2;
    }
    return height;
  }

  const hasDecisionAddendum = changedDates || Boolean(request.rescheduleNote?.trim());
  // The applicant signs their submitted letter before any Management
  // amendment; their saved signature must not imply consent to new dates.
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  const nameLineCount = Math.max(
    (doc.splitTextToSize(sanitizePdfText(request.agentName), signatureWidth) as string[]).length,
    (doc.splitTextToSize(sanitizePdfText(request.decidedByName || 'Management'), signatureWidth) as string[]).length,
  );
  ensureSpace(44 + nameLineCount * 5);
  y += 6;
  const signatureY = y;
  const staffHeight = signatureBlock(closingMatch ? 'Yours faithfully,' : 'APPLICANT', request.agentName, staffSignature, left, signatureY);
  let managerHeight = 0;
  if (request.status === 'approved' && !hasDecisionAddendum) {
    managerHeight = signatureBlock('APPROVED BY MANAGEMENT', request.decidedByName || 'Management', request.decidedSignature, managementX, signatureY, decisionDate);
  } else if (!hasDecisionAddendum) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SITE_MUTED);
    doc.text(doc.splitTextToSize(STATUS_LABEL[request.status], signatureWidth), managementX, signatureY);
  }
  y += Math.max(staffHeight, managerHeight) + 5;

  if (hasDecisionAddendum) {
    section(request.status === 'approved' ? 'Management-approved schedule' : request.status === 'pending' ? 'Current schedule awaiting review' : 'Management decision');
    paragraph(`${STATUS_LABEL[request.status]}${request.decidedAt ? ` - ${decisionDate}` : ''}`, { bold: true, size: 10 });
    if (changedDates) {
      paragraph(request.status === 'approved'
        ? 'The current approved dates are recorded below. The applicant letter above is retained as submitted.'
        : 'The current requested dates are listed below and await Management approval. The applicant letter above is retained as submitted.', { size: 10 });
      dateList(approvedDateLines);
    }
    if (request.rescheduleNote?.trim()) paragraph(request.rescheduleNote, { size: 10 });
    if (request.status === 'approved') {
      ensureSpace(42 + nameLineCount * 5);
      y += 5;
      y += signatureBlock('APPROVED BY MANAGEMENT', request.decidedByName || 'Management', request.decidedSignature, left, y, decisionDate);
    } else if (request.decidedByName) {
      paragraph(`Recorded by ${request.decidedByName}`, { size: 10 });
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(210, 215, 221);
    doc.setLineWidth(0.2);
    doc.line(left, 281, right, 281);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...SITE_MUTED);
    doc.text('Confidential staff record  |  Palmstead', left, 286);
    doc.text(`Page ${page} of ${pageCount}`, right, 286, { align: 'right' });
    const printedDate = generatedAt.toLocaleDateString('en-GB', { timeZone: 'Africa/Accra' });
    doc.text(`Generated ${printedDate}  |  Status at time of export`, left, 291);
  }
  return doc;
}

export function leaveLetterFilename(request: LeaveRequest): string {
  const safePart = (value: string) => value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  const reference = safePart(request.requestNo || request.id);
  const name = safePart(request.agentName) || 'Staff';
  return `LeaveRequest_${reference}_${name}.pdf`;
}
