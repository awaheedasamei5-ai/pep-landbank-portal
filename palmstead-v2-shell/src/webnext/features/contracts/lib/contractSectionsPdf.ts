import { jsPDF } from 'jspdf';
import { CONTRACT_INK, contractBorder, contractBody, contractNewPage, contractFilename } from './contractPdf';
import type { ContractSection, ContractStyleSettings } from '../../../types/domain';

// jsPDF's standard (base-14) font families -- the only ones it can embed
// without a real font-loading pipeline (see docs/plans/16-contract-of-
// sale-build-plan.md §1.2's font constraint). Any stored value outside
// this set falls back to 'times' rather than silently breaking the PDF.
const VALID_FONT_FAMILIES = new Set(['times', 'helvetica', 'courier']);
function normalizeFontFamily(name: string | undefined): 'times' | 'helvetica' | 'courier' {
  const lower = (name ?? '').toLowerCase();
  return (VALID_FONT_FAMILIES.has(lower) ? lower : 'times') as 'times' | 'helvetica' | 'courier';
}

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
//
// `style` (docs/plans/16-contract-of-sale-build-plan.md §4, the Style &
// Text page) controls the title/heading/image-placeholder/signature-
// block font family and the heading/title size -- the direct setFont()
// calls in THIS file. Honestly scoped: paragraph/clause/footer body text
// still goes through contractBody(), the shared legacy clause-numbering
// renderer also used by the untouched hardcoded-text path, so body
// typography stays on the proven 'times' typesetting for now rather than
// risking that shared primitive for a cosmetic setting.
export function buildContractFromSections(title: string, sections: ContractSection[], style?: ContractStyleSettings | null, coverDataUri?: string | null): jsPDF {
  const headingFamily = normalizeFontFamily(style?.headingFont);
  const headingSize = style?.headingFontSizePt ?? 12.5;
  const titleSize = (style?.headingFontSizePt ?? 14) + 2;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ---- Page 1: cover, same real full-bleed-photo convention as the
  // legacy buildContractOfSalePdf -- a template-based contract should
  // never look less finished than the hardcoded-text one it's replacing.
  let n = 1;
  let y: number;
  if (coverDataUri) {
    try {
      doc.addImage(coverDataUri, 'JPEG', 0, 0, pageW, pageH);
    } catch {
      // A malformed cover shouldn't block the rest of the document.
    }
    n = 2;
    y = contractNewPage(doc, n);
  } else {
    contractBorder(doc, pageW, pageH);
    y = 26;
  }
  doc.setFont(headingFamily, 'bold');
  doc.setFontSize(titleSize);
  doc.setTextColor(...CONTRACT_INK);
  const titleLines: string[] = doc.splitTextToSize(title, pageW - 28);
  doc.text(titleLines, pageW / 2, y, { align: 'center' });
  y += titleLines.length * 8 + 10;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    // docs/plans/17-contract-of-sale-v3-gaps-plan.md Phase 2 -- a real,
    // explicit "start a fresh page here" Management can set per section
    // (Template Studio editor toggle), mirroring what the legacy
    // renderer's hand-tuned force-breaks did implicitly via exact-string
    // matching, which silently stopped working the moment wording
    // changed. Checked before the normal height-based break below, and
    // skipped for the very first section (nothing to break away from).
    if (section.pageBreakBefore && i > 0) {
      n++;
      y = contractNewPage(doc, n);
    } else if (y > pageH - 30) {
      n++;
      y = contractNewPage(doc, n);
    }
    if (section.kind === 'heading') {
      // Orphan-heading protection -- a heading alone at the bottom of a
      // page with its first clause pushed to the next page reads as
      // broken even though nothing actually split mid-sentence. Looks
      // ahead to the very next section (if it's body text) and requires
      // both heights to fit together before drawing the heading; a
      // rough estimate (CONTRACT_SPACING_ROOMY.lineH, contractPdf.ts's
      // own plain-paragraph line height) rather than contractBody's full
      // numbered-clause heuristics, since this only needs to be good
      // enough to catch the common "heading alone at the bottom" case,
      // not reproduce contractBody's exact per-paragraph layout.
      const headingLines: string[] = doc.splitTextToSize(section.text ?? '', pageW - 28);
      let neededHeight = headingLines.length * 6.6 + 4;
      const next = sections[i + 1];
      if (next && (next.kind === 'paragraph' || next.kind === 'clause' || next.kind === 'footer') && next.text) {
        const nextLines: string[] = doc.splitTextToSize(next.text, pageW - 28);
        neededHeight += nextLines.length * 5.2;
      }
      if (y + neededHeight > pageH - 20) {
        n++;
        y = contractNewPage(doc, n);
      }
      doc.setFont(headingFamily, 'bold');
      doc.setFontSize(headingSize);
      doc.setTextColor(...CONTRACT_INK);
      doc.text(headingLines, 14, y);
      y += headingLines.length * 6.6 + 4;
    } else if (section.kind === 'signature_block') {
      ({ y, n } = renderSignatureBlock(doc, y, n, headingFamily));
    } else if (section.kind === 'image') {
      doc.setFont(headingFamily, 'italic');
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

function renderSignatureBlock(doc: jsPDF, y: number, n: number, headingFamily: 'times' | 'helvetica' | 'courier'): { y: number; n: number } {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - 90) {
    n++;
    y = contractNewPage(doc, n);
  }
  const colW = pageW / 2 - 14;
  doc.setFont(headingFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...CONTRACT_INK);
  const vLines: string[] = doc.splitTextToSize('SIGNED AND DELIVERED ON BEHALF OF THE VENDOR:', colW);
  const pLines: string[] = doc.splitTextToSize('SIGNED AND DELIVERED ON BEHALF OF THE PURCHASER:', colW);
  doc.text(vLines, 14, y);
  doc.text(pLines, pageW / 2 + 4, y);
  y += Math.max(vLines.length, pLines.length) * 5.5 + 14;
  doc.setFont(headingFamily, 'normal');
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
