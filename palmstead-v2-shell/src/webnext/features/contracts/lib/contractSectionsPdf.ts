import { jsPDF } from 'jspdf';
import { CONTRACT_INK, contractBorder, contractBody, contractNewPage, contractFilename } from './contractPdf';
import type { ContractSection } from '../../../types/domain';

// CONTRACT_OF_SALE_BLUEPRINT.md §6.3/§8 -- the real PDF renderer for the
// NEW structured content model (ContractSection[]), shared by the Preview
// screen (sample data) and real generation (§8, resolved lead data) so
// what Management previews is byte-identical in layout to what a real
// generation produces. Reuses contractPdf.ts's own border/pagination/
// clause-numbering primitives rather than re-deriving them -- `paragraph`/
// `clause`/`footer` sections go through the same contractBody() that
// already turns "N. HEADING" / "N.N sub" / roman-or-lettered text into
// correctly typeset headings/sub-headings/list items, so a Management
// user writing real numbered clause text gets the same typesetting the
// old hardcoded contract already had.
//
// Honestly not built yet (flagged here, not silently skipped): `image`
// sections render as a bracketed placeholder rather than an embedded
// asset -- no image-upload/asset-resolution UI exists for template
// sections yet.
export function buildContractFromSections(title: string, sections: ContractSection[]): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  contractBorder(doc, pageW, pageH);

  let n = 1;
  let y = 26;
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...CONTRACT_INK);
  const titleLines: string[] = doc.splitTextToSize(title, pageW - 28);
  doc.text(titleLines, pageW / 2, y, { align: 'center' });
  y += titleLines.length * 8 + 10;

  for (const section of sections) {
    if (y > pageH - 30) {
      n++;
      y = contractNewPage(doc, n);
    }
    if (section.kind === 'heading') {
      doc.setFont('times', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(...CONTRACT_INK);
      const lines: string[] = doc.splitTextToSize(section.text ?? '', pageW - 28);
      doc.text(lines, 14, y);
      y += lines.length * 6.6 + 4;
    } else if (section.kind === 'signature_block') {
      ({ y, n } = renderSignatureBlock(doc, y, n));
    } else if (section.kind === 'image') {
      doc.setFont('times', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(...CONTRACT_INK);
      doc.text(`[Image: ${section.imageRef || 'not set'}]`, 14, y);
      y += 8;
    } else {
      // paragraph / clause / footer all share the same real clause-
      // numbering-aware body renderer.
      ({ y, n } = contractBody(doc, y, n, section.text ?? ''));
    }
  }

  return doc;
}

function renderSignatureBlock(doc: jsPDF, y: number, n: number): { y: number; n: number } {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - 90) {
    n++;
    y = contractNewPage(doc, n);
  }
  const colW = pageW / 2 - 14;
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...CONTRACT_INK);
  const vLines: string[] = doc.splitTextToSize('SIGNED AND DELIVERED ON BEHALF OF THE VENDOR:', colW);
  const pLines: string[] = doc.splitTextToSize('SIGNED AND DELIVERED ON BEHALF OF THE PURCHASER:', colW);
  doc.text(vLines, 14, y);
  doc.text(pLines, pageW / 2 + 4, y);
  y += Math.max(vLines.length, pLines.length) * 5.5 + 14;
  doc.setFont('times', 'normal');
  doc.setFontSize(10.5);
  const sigRows: [string, string][] = [
    ['Sign', '…………………………………....'],
    ['Name', '…………………………………....'],
    ['Designation', '…………………………………....'],
  ];
  sigRows.forEach(([lab, dots]) => {
    doc.text(`${lab} ${dots}`, 14, y);
    doc.text(`${lab} ${dots}`, pageW / 2 + 4, y);
    y += 16;
  });
  return { y: y + 6, n };
}

export { contractFilename };
