import { jsPDF } from 'jspdf';
import { fmtLongDate } from '../../../shared/lib/format';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { computeLeadQuotationTotals, pricingFor } from '../../quotation/lib/quotationLogic';
import type { Config, Lead } from '../../../types/domain';

// Faithful port of index.html's Contract of Sale document (index.html:
// 17794-18136) -- a long, multi-page legal contract, not just a summary:
// cover photo, title page, KYC pages III-VI (a fillable customer-details
// form), the Contract of Sale text itself (opening/WHEREAS/definitions/
// the transaction/warranties/payments&defaults/governing law/notices, all
// CONFIG-editable legal text so Management can amend wording without a
// code change), and a signature page. Deliberately does NOT stamp a
// signature image -- same reasoning as the payment receipt PDF: no staff
// digital-signature capture UI exists yet, and the real code already
// guards every signature stamp with `if(sig)`, so omitting it here matches
// an already-valid real state rather than cutting a corner.

export const CONTRACT_INK: [number, number, number] = [31, 56, 99];
const CONTRACT_GOUDY_FONT = 'SortsMillGoudy';
const contractGoudyDocuments = new WeakSet<jsPDF>();
let contractFontPromise: Promise<string> | null = null;

// Sorts Mill Goudy is the OFL-licensed revival of the reference PDF's
// embedded Goudy Old Style. Keep the font file and OFL notice together in
// public/fonts. Loading the exact same bytes for the save preflight and
// issued PDF prevents a font-width mismatch from changing page breaks.
export function loadContractFontBase64(): Promise<string> {
  if (!contractFontPromise) {
    contractFontPromise = fetch('/fonts/SortsMillGoudy-Regular.ttf')
      .then(async (response) => {
        if (!response.ok) throw new Error('The contract font could not be loaded. Please try again.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        return btoa(binary);
      })
      .catch((error: unknown) => {
        contractFontPromise = null;
        throw error;
      });
  }
  return contractFontPromise;
}

function setContractFont(doc: jsPDF, style: 'normal' | 'bold'): void {
  doc.setFont(style === 'normal' && contractGoudyDocuments.has(doc) ? CONTRACT_GOUDY_FONT : 'times', style);
}
const CONTRACT_MONTH_WORDS: Record<number, string> = { 3: 'Three', 6: 'Six', 9: 'Nine', 12: 'Twelve' };
const CONTRACT_CHECKBOX_SIZE = 4.8;

function contractMoney(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error('Contract amount must be a valid number.');
  return 'GHS ' + amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function contractAddress(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function centeredAddress(doc: jsPDF, address: string, y: number, maxLines: number, maxWidth: number): void {
  const clean = contractAddress(address);
  for (let fontSize = 11; fontSize >= 8.5; fontSize -= 0.5) {
    doc.setFontSize(fontSize);
    const lines: string[] = doc.splitTextToSize(clean, maxWidth);
    if (lines.length <= maxLines) {
      doc.text(lines, doc.internal.pageSize.getWidth() / 2, y, { align: 'center', lineHeightFactor: 1.15 });
      return;
    }
  }
  throw new Error('The address is too long for the contract title page. Shorten it before generating the PDF.');
}

function assertReferencePage(actual: number, expected: number, section: string): void {
  if (actual !== expected) throw new Error(`${section} no longer fits its reference page. Shorten the wording or address before generating the ten-page contract.`);
}

function fitContractName(doc: jsPDF, name: string, maxWidth: number): number {
  for (let size = 11; size >= 8.5; size -= 0.5) {
    doc.setFontSize(size);
    if (doc.getTextWidth(name) <= maxWidth) return size;
  }
  throw new Error('The client name is too long for the reference contract layout. Shorten it before generating the PDF.');
}

function drawContractPartyName(doc: jsPDF, name: string, x: number, y: number, maxWidth: number): void {
  doc.setFontSize(11);
  let lines: string[] = doc.splitTextToSize(name, maxWidth);
  if (lines.length > 2) {
    doc.setFontSize(9.5);
    lines = doc.splitTextToSize(name, maxWidth);
  }
  if (lines.length > 2) {
    throw new Error('The client name needs more than two signature lines. Shorten it before generating the PDF.');
  }
  doc.text(lines, x, y, { lineHeightFactor: 1.2 });
}

// CONTRACT_OF_SALE_BLUEPRINT.md §6.3/§8 -- exported so contractSectionsPdf.ts
// (the new structured-content renderer for Preview + real generation)
// reuses these exact primitives rather than re-deriving the page border/
// pagination/clause-numbering conventions from scratch.
export function contractBorder(doc: jsPDF, pageW: number, pageH: number) {
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.5);
  doc.rect(6, 6, pageW - 12, pageH - 12);
  doc.setLineWidth(0.3);
  doc.rect(7.5, 7.5, pageW - 15, pageH - 15);
}

export function contractNewPage(doc: jsPDF, n: number): number {
  doc.addPage();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  contractBorder(doc, pageW, pageH);
  setContractFont(doc, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 110, 150);
  doc.text('pg. ' + n, 14, pageH - 14);
  doc.setTextColor(...CONTRACT_INK);
  return 26;
}

function contractField(doc: jsPDF, x: number, y: number, w: number, label: string, value: string) {
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...CONTRACT_INK);
  const lab = label ? label + ': ' : '';
  const labW = lab ? doc.getTextWidth(lab) : 0;
  if (lab) doc.text(lab, x, y);
  let wrappedAddress = false;
  if (value) {
    const fieldValue = String(value).replace(/\s+/g, ' ').trim();
    const available = w - labW - 3;
    if (available <= 0) throw new Error(`The ${label || 'contract'} field has no room for its value.`);
    let size = 10.5;
    while (size > 8 && doc.getTextWidth(fieldValue) > available) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    if (doc.getTextWidth(fieldValue) > available && label === 'ADDRESS') {
      doc.setFontSize(8);
      const lines: string[] = doc.splitTextToSize(fieldValue, available);
      if (lines.length > 2) throw new Error('The client address needs more than two form lines. Shorten it before generating the PDF.');
      doc.text(lines, x + labW + 1, y, { lineHeightFactor: 1.15 });
      wrappedAddress = true;
    } else {
      if (doc.getTextWidth(fieldValue) > available) {
        throw new Error(`The ${label || 'contract'} entry is too long for the reference form. Shorten it before generating the PDF.`);
      }
      doc.text(fieldValue, x + labW + 1, y);
    }
    doc.setFontSize(10.5);
  }
  doc.setDrawColor(...CONTRACT_INK);
  doc.setLineDashPattern([0.6, 0.6], 0);
  doc.line(x + labW, y + (wrappedAddress ? 4.4 : 0.8), x + w, y + (wrappedAddress ? 4.4 : 0.8));
  doc.setLineDashPattern([], 0);
}

function contractCheckbox(doc: jsPDF, x: number, y: number, label: string, checked: boolean): number {
  const s = CONTRACT_CHECKBOX_SIZE;
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  if (label) doc.text(label, x, y);
  const boxX = x + (label ? doc.getTextWidth(label) + 2 : 0);
  doc.setDrawColor(...CONTRACT_INK);
  doc.setLineWidth(0.4);
  doc.rect(boxX, y - 4.2, s, s);
  if (checked) {
    setContractFont(doc, 'bold');
    doc.setFontSize(9);
    doc.text('X', boxX + 1.2, y - 0.3);
  }
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  return boxX + s + 7;
}

function contractCheckRow(doc: jsPDF, x: number, y: number, pageW: number, options: string[], selected: string): number {
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  let cx = x;
  options.forEach((opt) => {
    const w = CONTRACT_CHECKBOX_SIZE + 2 + doc.getTextWidth(opt) + 7;
    if (cx + w > pageW - 14) {
      cx = x;
      y += 8;
    }
    cx = contractCheckbox(doc, cx, y, opt, !!selected && selected.toLowerCase() === opt.toLowerCase());
  });
  return y + 8;
}

// Renders CONFIG-editable legal text using the reference form's own
// clause numbering: bare "N. HEADING" paragraphs become section headings,
// "N.N ..." become bold sub-headings, and "N.N.N" / roman-numeral /
// lettered paragraphs become hanging-indent list items -- so Management's
// edits keep typesetting correctly without a code change.
//
// The reference document itself is NOT uniformly dense (pages 5-8 sit at
// a roomier fill, pages 9's Section 3-6 is visibly denser to fit before
// the signature page) -- both spacing tiers were tuned against the real
// reference page-by-page, not guessed.
const CONTRACT_SPACING_ROOMY = { lineH: 5.2, itemGap: 2.4, headLineH: 6.6, headLead: 3, headGap: 3, subheadGap: 6.5, paraGap: 3.2 };
const CONTRACT_SPACING_TIGHT = { lineH: 4.4, itemGap: 0.8, headLineH: 5.4, headLead: 1.2, headGap: 1.8, subheadGap: 4.5, paraGap: 1.8 };

export function contractBody(doc: jsPDF, y: number, n: number, text: string, dense?: boolean): { y: number; n: number } {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginR = pageW - 14;
  const sp = dense ? CONTRACT_SPACING_TIGHT : CONTRACT_SPACING_ROOMY;
  function ensure(need: number) {
    if (y + need > pageH - 20) {
      n++;
      y = contractNewPage(doc, n);
    }
  }
  function listItem(markerX: number, bodyX: number, marker: string, body: string, boldMarker: boolean) {
    const w = marginR - bodyX;
    const lines: string[] = doc.splitTextToSize(body, w);
    const h = Math.max(lines.length * sp.lineH, sp.lineH);
    ensure(h + sp.itemGap);
    setContractFont(doc, boldMarker ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...CONTRACT_INK);
    doc.text(marker, markerX, y);
    setContractFont(doc, 'normal');
    doc.setFontSize(10);
    doc.text(body, bodyX, y, { maxWidth: w, align: 'justify' });
    y += h + sp.itemGap;
  }
  String(text || '')
    .split(/\n\s*\n/)
    .forEach((raw) => {
      const para = raw.trim();
      if (!para) return;
      doc.setTextColor(...CONTRACT_INK);
      const isSectionHeading = /^\d+\.\s+[A-Z]/.test(para) && para === para.toUpperCase();
      const threeLevel = !isSectionHeading && para.match(/^(\d+(?:\.\d+){2,})\s+([\s\S]+)$/);
      const romanOrLetter = !isSectionHeading && !threeLevel && para.match(/^((?:[ivx]+|[a-z]))\.\s+([\s\S]+)$/i);
      const twoLevel = !isSectionHeading && !threeLevel && !romanOrLetter && para.match(/^(\d+\.\d+)\s+([\s\S]+)$/);
      if (isSectionHeading) {
        setContractFont(doc, 'bold');
        doc.setFontSize(12.5);
        const hLines: string[] = doc.splitTextToSize(para, marginR - 14);
        ensure(hLines.length * sp.headLineH + sp.headLead * 2);
        y += sp.headLead;
        doc.text(hLines, 14, y);
        y += hLines.length * sp.headLineH + sp.headGap;
      } else if (threeLevel) {
        listItem(20, 38, threeLevel[1], threeLevel[2], false);
      } else if (romanOrLetter) {
        listItem(20, 38, romanOrLetter[1] + '.', romanOrLetter[2], false);
      } else if (twoLevel) {
        const bodyIsHeading = twoLevel[2] === twoLevel[2].toUpperCase() && twoLevel[2].length < 40;
        if (bodyIsHeading) {
          ensure(sp.subheadGap);
          setContractFont(doc, 'bold');
          doc.setFontSize(11);
          doc.text(twoLevel[1] + '  ' + twoLevel[2], 14, y);
          y += sp.subheadGap;
        } else {
          listItem(14, 30, twoLevel[1], twoLevel[2], true);
        }
      } else {
        const w = marginR - 14;
        const lines: string[] = doc.splitTextToSize(para, w);
        const h = lines.length * sp.lineH;
        ensure(h + sp.paraGap);
        setContractFont(doc, 'normal');
        doc.setFontSize(10);
        doc.text(para, 14, y, { maxWidth: w, align: 'justify' });
        y += h + sp.paraGap;
      }
    });
  return { y, n };
}

// A "full plot" is 70x100ft (7,000 sqft = 0.1607 acres); a "half plot" is
// half that -- matches the reference contract's own math (2 full plots =
// 0.32 acres exactly). lead.noPlots is a full-plot-equivalent count (0.5
// = one Half Plot, see previewGrandTotal's own comment in
// pipelineLogic.ts), so the Full Plot acreage constant alone converts it
// regardless of which plot type is selected -- no separate Half Plot
// constant needed any more.
function contractAcres(lead: Lead): number {
  return Math.round(0.1607 * (lead.noPlots || 1) * 100) / 100;
}

// The reference document underlines the Purchaser's name+address
// specifically ("NAME of ADDRESS herein called...") -- jsPDF has no
// per-substring rich-text within a single text() call, so this renders
// the paragraph left-aligned (not justified, unlike the surrounding body
// text) specifically so the underlined portion's width can be measured
// accurately and drawn beneath it, line by line if it wraps.
function contractUnderlinedPara(doc: jsPDF, y: number, n: number, underlinedText: string, restText: string): { y: number; n: number } {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const w = pageW - 28;
  const lineH = CONTRACT_SPACING_ROOMY.lineH;
  const fullText = underlinedText + restText;
  setContractFont(doc, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...CONTRACT_INK);
  const lines: string[] = doc.splitTextToSize(fullText, w);
  if (y + lines.length * lineH + CONTRACT_SPACING_ROOMY.paraGap > pageH - 20) {
    n++;
    y = contractNewPage(doc, n);
  }
  let remaining = underlinedText.length;
  lines.forEach((line, i) => {
    doc.text(line, 14, y + i * lineH);
    if (remaining > 0) {
      const take = Math.min(remaining, line.length);
      const uw = doc.getTextWidth(line.slice(0, take));
      doc.setDrawColor(...CONTRACT_INK);
      doc.setLineWidth(0.25);
      doc.line(14, y + i * lineH + 1, 14 + uw, y + i * lineH + 1);
      remaining -= take;
    }
  });
  return { y: y + lines.length * lineH + CONTRACT_SPACING_ROOMY.paraGap, n };
}

// A handful of paragraphs in the reference have a bold lead-in phrase
// followed by normal-weight text, or are bold in full -- same
// left-aligned, width-measured approach as contractUnderlinedPara so the
// bold/normal split lands correctly.
function contractLeadBoldPara(doc: jsPDF, y: number, n: number, boldLead: string, rest: string, dense?: boolean): { y: number; n: number } {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const w = pageW - 28;
  const sp = dense ? CONTRACT_SPACING_TIGHT : CONTRACT_SPACING_ROOMY;
  const fullText = boldLead + rest;
  setContractFont(doc, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...CONTRACT_INK);
  const lines: string[] = doc.splitTextToSize(fullText, w);
  if (y + lines.length * sp.lineH + sp.paraGap > pageH - 20) {
    n++;
    y = contractNewPage(doc, n);
  }
  let remaining = boldLead.length;
  lines.forEach((line, i) => {
    if (remaining > 0) {
      const take = Math.min(remaining, line.length);
      const boldPart = line.slice(0, take);
      const restPart = line.slice(take);
      setContractFont(doc, 'bold');
      doc.text(boldPart, 14, y + i * sp.lineH);
      const bw = doc.getTextWidth(boldPart);
      setContractFont(doc, 'normal');
      doc.text(restPart, 14 + bw, y + i * sp.lineH);
      remaining -= take;
    } else {
      setContractFont(doc, 'normal');
      doc.text(line, 14, y + i * sp.lineH);
    }
  });
  return { y: y + lines.length * sp.lineH + sp.paraGap, n };
}

function splitContractClauses(text: string): string[] {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Splits a clause-text block into chunks, starting a new chunk right
// before any clause whose text begins with one of the given marker
// prefixes (e.g. '2.2 ', '3. ') -- used to force the PDF's page breaks
// onto the exact same clauses the reference document itself breaks on,
// without hardcoding page numbers that would drift if wording changes.
function splitClausesBeforeMarkers(text: string, markers: string[]): string[] {
  const clauses = splitContractClauses(text);
  const chunks: string[][] = [[]];
  clauses.forEach((c) => {
    if (markers.some((m) => c.startsWith(m))) chunks.push([]);
    chunks[chunks.length - 1].push(c);
  });
  return chunks.map((arr) => arr.join('\n\n'));
}

export async function prepareStandardContractPdf(lead: Lead, config: Config, acresOverride?: number): Promise<jsPDF> {
  let cover: string | null = null;
  let wordmark: string | null = null;
  try {
    cover = config.contractCoverImage || (await loadImageAsDataUri('/contract-cover.jpg'));
  } catch {
    // A missing optional image must not prevent a legal document.
  }
  try {
    wordmark = config.contractWordmarkImage || (await loadImageAsDataUri('/trulander-wordmark.png'));
  } catch {
    // The title remains readable without an optional wordmark.
  }
  const fontBase64 = await loadContractFontBase64();
  return buildContractOfSalePdf(lead, config, cover, wordmark, acresOverride, fontBase64);
}

export function buildContractOfSalePdf(lead: Lead, config: Config, coverDataUri: string | null, wordmarkDataUri: string | null, acresOverride?: number, fontBase64?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  if (fontBase64) {
    doc.addFileToVFS('SortsMillGoudy-Regular.ttf', fontBase64);
    doc.addFont('SortsMillGoudy-Regular.ttf', CONTRACT_GOUDY_FONT, 'normal');
    contractGoudyDocuments.add(doc);
  }
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const t = computeLeadQuotationTotals(config, lead);
  const depositPct = t.net ? Math.round((t.deposit / t.net) * 1000) / 10 : 0;
  const planLabel = lead.paymentPlan === 'Full Payment' ? 'Outright' : lead.paymentPlan;
  const vendorName = (config.quoteCompanyName || 'Trulander JSF Limited').toUpperCase();
  const vendorAddress = contractAddress(config.contractCompanyAddress || 'Post Office Box CO 3644 Tema');
  const purchaserAddress = contractAddress(lead.kyc?.address || lead.address || lead.kyc?.location || '');
  const ceo = (config.contractCeoName || 'FRANK ADU PEPRAH').toUpperCase();
  const acres = acresOverride ?? contractAcres(lead);
  if (!Number.isFinite(acres) || acres <= 0) throw new Error('Contract land size must be greater than zero acres.');
  // lead.noPlots is a full-plot-equivalent count -- a signed legal
  // contract needs to read "1 x Half Plot" for one half plot, not the
  // confusing "0.5 x Half Plot" (see previewGrandTotal's own comment in
  // pipelineLogic.ts).
  const qtyOfType = (lead.noPlots || 1) / pricingFor(config, lead.plotType).eq;
  let n = 1;
  let y: number;

  // ---- Page 1: cover -- the real marketing photo, unchanged ----
  if (coverDataUri) {
    try {
      doc.addImage(coverDataUri, 'JPEG', 0, 0, pageW, pageH);
    } catch {
      // A malformed cover shouldn't block the rest of the document.
    }
  }

  // ---- Page 2: title page ----
  n = 2;
  y = contractNewPage(doc, n);
  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  // Match the reference title leaf's five distinct baselines. The vendor
  // address is part of the party block, not the letterhead at the foot.
  doc.text('CONTRACT OF SALES', pageW / 2, 55, { align: 'center' });
  doc.text('BETWEEN', pageW / 2, 73.6, { align: 'center' });
  doc.text(vendorName, pageW / 2, 92.2, { align: 'center' });
  centeredAddress(doc, '(' + vendorAddress + ')', 96.9, 2, pageW - 28);
  setContractFont(doc, 'normal');
  doc.text('AND', pageW / 2, 115.5, { align: 'center' });
  setContractFont(doc, 'bold');
  const purchaserName = String(lead.name || '').trim().toUpperCase();
  if (!purchaserName) throw new Error('Add the client name before generating the Contract of Sale.');
  fitContractName(doc, purchaserName, pageW - 28);
  doc.text(purchaserName, pageW / 2, 134.1, { align: 'center' });
  if (purchaserAddress) {
    setContractFont(doc, 'normal');
    centeredAddress(doc, '(' + purchaserAddress + ')', 139, 2, pageW - 28);
  }
  if (wordmarkDataUri) {
    try {
      doc.addImage(wordmarkDataUri, 'PNG', pageW / 2 - 25, 174, 50, 18);
    } catch {
      // A malformed wordmark shouldn't block the rest of the document.
    }
  }
  setContractFont(doc, 'normal');
  doc.setFontSize(11);
  centeredAddress(doc, vendorAddress, 199.3, 2, pageW - 28);

  // ---- Page 3: KYC I-III ----
  n = 3;
  y = contractNewPage(doc, n);
  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  doc.text('KNOW YOUR CUSTOMER AND TRANSACTION DETAILS', pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9.5);
  doc.text('PLEASE READ CAREFULLY AND COMPLETE ALL RELEVANT SECTIONS.', pageW / 2, y, { align: 'center' });
  y += 11;
  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  doc.text('I. PERSONAL DETAILS', 14, y);
  y += 9;
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  const nameLabel = 'NAME OF CLIENT: ';
  doc.text(nameLabel, 14, y);
  const nameValueX = 14 + doc.getTextWidth(nameLabel) + 1;
  fitContractName(doc, purchaserName, pageW - nameValueX - 14);
  doc.text(purchaserName, nameValueX, y);
  doc.setFontSize(10.5);
  y += 10;
  const k = lead.kyc || {};
  contractField(doc, 14, y, 86, 'NATIONALITY', k.nationality || '');
  contractField(doc, 108, y, 86, 'OCCUPATION', k.occupation || '');
  y += 10;
  contractField(doc, 14, y, 86, 'DATE OF BIRTH', k.dob ? fmtLongDate(k.dob) : '');
  contractField(doc, 108, y, 86, 'PHONE', lead.contact || '');
  y += 12;
  doc.text('ID TYPE:', 14, y);
  contractCheckRow(doc, 34, y, pageW, ['Voters', 'Passport', 'Ghana Card', "Driver's License"], k.idType || '');
  y += 9;
  contractField(doc, 14, y, pageW - 28, 'ID NO.', k.idNumber || '');
  y += 9;
  contractField(doc, 14, y, pageW - 28, 'ADDRESS', purchaserAddress);
  y += 9;
  contractField(doc, 14, y, 86, 'EMAIL', k.email || '');
  contractField(doc, 108, y, 86, 'LOCATION', k.location || '');
  y += 10;

  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  doc.text('II. CONTACT PERSON', 14, y);
  y += 9;
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  contractField(doc, 14, y, pageW - 28, 'NAME', k.contactName || '');
  y += 9;
  contractField(doc, 14, y, 86, 'PHONE', k.contactPhone || '');
  contractField(doc, 108, y, 86, 'EMAIL', k.contactEmail || '');
  y += 9;
  contractField(doc, 14, y, pageW - 28, 'ADDRESS', k.contactAddress || '');
  y += 9;
  contractField(doc, 14, y, pageW - 28, 'RELATION TO CLIENT', k.contactRelation || '');
  y += 11;

  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  doc.text('III. LAND USAGE AND DEVELOPMENT', 14, y);
  y += 11;
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  contractCheckRow(doc, 14, y, pageW, ['Residential', 'Commercial'], k.landUsage || '');
  y += 11;
  contractField(doc, 14, y, pageW - 28, 'If commercial indicate exact usage', k.landUsageDetail || '');
  y += 19;
  doc.text('PREFERRED PACKAGE: Carefully select a package that best suits your financial plan.', 14, y);
  y += 10;
  const pkgMap: Record<string, string> = { 'Full Payment': '1. OUTRIGHT', '3 Months': '2. Three (3) Months', '6 Months': '3. Six (6) Months', '9 Months': '4. Nine (9) Months', '12 Months': '5. Twelve (12) Months' };
  contractCheckRow(doc, 14, y, pageW, ['1. OUTRIGHT', '2. Three (3) Months', '3. Six (6) Months', '4. Nine (9) Months', '5. Twelve (12) Months'], pkgMap[lead.paymentPlan] || '');
  doc.setFontSize(10);
  doc.text("Note: Be reminded that without any payment we can't reserve your plots", 14, pageH - 30);

  // ---- Page 4: KYC IV-VI ----
  n = 4;
  y = contractNewPage(doc, n);
  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  doc.text('IV. MODE OF PAYMENT:', 14, y);
  y += 10;
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  contractCheckRow(doc, 14, y, pageW, ['1. Cheque', '2. Bank deposit', '3. Momo', '5. Bank Transfer'], '');
  y += 10;
  doc.text('All cheques should be written in the name of "' + vendorName + '"', 14, y);
  y += 10;

  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  const hdLines: string[] = doc.splitTextToSize('V. HOW DID YOU HEAR ABOUT US? Please help us appreciate how you heard about ' + (config.quoteCompanyName || 'Trulander JSF Limited') + '.', pageW - 28);
  doc.text(hdLines, 14, y);
  y += hdLines.length * 5.5 + 6;
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  y = contractCheckRow(doc, 14, y, pageW, ['1.Facebook', '2. Instagram', '3. LinkedIn', '4. Google', '5. TikTok', '6. Website'], '') + 2;
  y = contractCheckRow(doc, 14, y, pageW, ['7.Friends and Relatives', '8. Sales Executive'], '') + 2;
  contractField(doc, 14, y, pageW - 28, 'Name of Sales Executive', '');
  y += 14;

  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  doc.text('VI. OFFICIAL USE ONLY', 14, y);
  y += 10;
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  doc.text('Payment Terms: Cash', 14, y);
  contractCheckbox(doc, 52, y, '', false);
  doc.text('Credit', 60, y);
  contractCheckbox(doc, 73, y, '', false);
  contractField(doc, 81, y, pageW - 14 - 81, 'Number of plots', qtyOfType + ' x ' + (lead.plotType || 'Full Plot'));
  y += 10;
  contractField(doc, 14, y, 86, 'Agreed price GHS', contractMoney(t.grand).replace('GHS ', ''));
  contractField(doc, 108, y, 86, 'Amount paid GHS', contractMoney(lead.amtPaid).replace('GHS ', ''));
  y += 10;
  contractField(doc, 14, y, pageW - 28, 'Amount in words', '');
  y += 10;
  contractField(doc, 14, y, pageW - 28, '', '');
  y += 10;
  contractField(doc, 14, y, 86, 'Final payment date', planLabel === 'Outright' ? '' : 'within ' + t.planMonths + ' months of deposit');
  contractField(doc, 108, y, 86, 'Amount due monthly: GHS', t.monthlyDue ? contractMoney(t.monthlyDue).replace('GHS ', '') : '');
  y += 15;

  setContractFont(doc, 'bold');
  doc.setFontSize(10.5);
  doc.text('MANAGER', 14, y);
  y += 10;
  setContractFont(doc, 'normal');
  contractField(doc, 14, y, pageW - 28, 'Name', '');
  y += 10;
  contractField(doc, 14, y, pageW - 28, 'Sign.', '');
  y += 10;
  contractField(doc, 14, y, pageW - 28, 'Tel.', '');
  y += 14;
  doc.setFontSize(9.5);
  doc.text('Note: The above details shall be read of part of the terms of the Contract of Sale Document', 14, pageH - 41);

  // ---- Page 5: Contract of Sale opening + WHEREAS ----
  n = 5;
  y = contractNewPage(doc, n);
  setContractFont(doc, 'normal');
  doc.setFontSize(12);
  doc.text('CONTRACT OF SALE', pageW / 2, y, { align: 'center' });
  doc.setLineWidth(0.3);
  doc.setDrawColor(...CONTRACT_INK);
  const tw = doc.getTextWidth('CONTRACT OF SALE');
  doc.line(pageW / 2 - tw / 2, y + 1.2, pageW / 2 + tw / 2, y + 1.2);
  y += 10;
  // Party identification -- kept as four SEPARATE blocks (opening line,
  // BETWEEN, Vendor paragraph, AND, Purchaser paragraph) exactly as the
  // reference lays them out, not merged into one run-on sentence.
  ({ y, n } = contractBody(doc, y, n, 'THIS CONTRACT OF SALE (The Agreement) is made on this day of ………………………………..'));
  ({ y, n } = contractBody(doc, y, n, 'BETWEEN'));
  ({ y, n } = contractBody(doc, y, n, vendorName + ' of ' + vendorAddress + ' represented by its CEO, ' + ceo + ' (herein called "the Vendor" which expression shall where the context so requires, include its successors or assigns) on one part.'));
  ({ y, n } = contractBody(doc, y, n, 'AND'));
  ({ y, n } = contractUnderlinedPara(
    doc,
    y,
    n,
    String(lead.name || '').toUpperCase() + ' of ' + (purchaserAddress || '…………………………………………..'),
    ' herein called "the Purchaser", which expression shall, where the context so requires, include his legal heirs, successors, successors-in-interest, executors, legal representatives, and/or assigns) of the other part.',
  ));
  ({ y, n } = contractLeadBoldPara(doc, y, n, 'The Purchaser and the Vendor shall where the context so require be referred as "the Parties" and individually as "a party"', ''));
  setContractFont(doc, 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...CONTRACT_INK);
  doc.text('WHEREAS;', 14, y);
  y += 8;
  ({ y, n } = contractBody(doc, y, n, (config.contractPreamble || '').replace('{ACRES}', String(acres))));
  ({ y, n } = contractLeadBoldPara(doc, y, n, 'NOW THEREFORE,', ' in consideration of the foregoing and the terms set forth in this Agreement, the receipt and sufficiency of which is hereby acknowledged, and intending to be legally bound hereby, the Parties agree as follows:'));
  assertReferencePage(n, 5, 'The opening clauses');

  // ---- 1. Definitions and Interpretation (editable, static) ----
  // Reference document starts Section 1 on its own fresh page (page 6)
  // even though page 5 has room left -- a deliberate break in the
  // original, not natural overflow. Forced explicitly rather than relying
  // on height math, so it can never drift.
  n++;
  y = contractNewPage(doc, n);
  ({ y, n } = contractBody(doc, y, n, config.contractDefinitions || ''));
  assertReferencePage(n, 6, 'Definitions');

  // ---- 1.3 The Transaction (dynamic, computed from this lead) ----
  // Reference also force-breaks here -- "IT IS NOW MUTUALLY agreed..." opens page 7.
  n++;
  y = contractNewPage(doc, n);
  ({ y, n } = contractBody(doc, y, n, 'IT IS NOW MUTUALLY agreed as follows:'));
  const transactionItems = [
    '1.3 THE TRANSACTION',
    '1.3.1 The consideration for ' + acres + ' Acres of land (more or less) is hereby agreed at ' + (t.discountTotal > 0 ? 'a discounted amount of ' : '') + contractMoney(t.grand) + '.',
    planLabel === 'Outright'
      ? '1.3.2 The Purchaser agrees to pay the full consideration of ' + contractMoney(t.grand) + ' on the execution of this contract.'
      : '1.3.2 The Purchaser agrees to pay on the execution of this contract a deposit of ' + contractMoney(t.deposit) + ' which constitutes approximately ' + depositPct + '% of the net price. The remaining balance shall be spread over ' + (CONTRACT_MONTH_WORDS[t.planMonths] || t.planMonths) + ' (' + t.planMonths + ') monthly installments.',
    planLabel === 'Outright' ? null : '1.3.3 Monthly installment payments of ' + contractMoney(t.monthlyDue) + ' shall be made over ' + (CONTRACT_MONTH_WORDS[t.planMonths] || t.planMonths) + ' (' + t.planMonths + ') months. The final installment shall be adjusted to settle any rounding balance.',
    '1.3.4 All Payments shall be made via the Companies designated payment platforms and shall be in the name ' + vendorName + '. All Payment shall be duly receipted.',
    '1.3.5 Upon ' + (planLabel === 'Outright' ? 'receipt of the full consideration of ' + contractMoney(t.grand) : 'receipt of the agreed initial deposit of ' + contractMoney(t.deposit)) + ', ' + (config.quoteCompanyName || 'Trulander JSF Limited') + ' shall allocate the said Land with reference above to the Purchaser.',
    '1.3.6 Indentures shall be released to Purchaser after final payment unless explicitly agreed.',
    '1.3.7 All monthly installments shall be due on the fifth (5th) day of each month.',
  ]
    .filter((x): x is string => x !== null)
    .join('\n\n');
  ({ y, n } = contractBody(doc, y, n, transactionItems));

  // ---- 2-6: Representations, payments/defaults/refund, governing law,
  // notices (editable, static) ----
  // Reference document's own page breaks: 2.1 (Vendor warranties)
  // continues right after 1.3 on page 7; 2.2 (Purchaser warranties)
  // force-breaks onto page 8; Section 3 onward force-breaks onto page 9.
  // Split on the clause markers themselves so this stays correct even
  // after Management edits clause wording.
  const termsChunks = splitClausesBeforeMarkers(config.contractTerms || '', ['2.2 ', '3. ']);
  ({ y, n } = contractBody(doc, y, n, termsChunks[0] || ''));
  assertReferencePage(n, 7, 'The transaction and vendor warranties');
  if (termsChunks[1]) {
    n++;
    y = contractNewPage(doc, n);
    ({ y, n } = contractBody(doc, y, n, termsChunks[1]));
    assertReferencePage(n, 8, 'Purchaser warranties');
  }
  if (termsChunks[2]) {
    n++;
    y = contractNewPage(doc, n);
    ({ y, n } = contractBody(doc, y, n, termsChunks[2], true));
    assertReferencePage(n, 9, 'Final terms');
    y += 8;
    if (y > pageH - 24) {
      n++;
      y = contractNewPage(doc, n);
    }
    setContractFont(doc, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...CONTRACT_INK);
    doc.text('{SIGNATURE PAGE TO FOLLOW}', pageW / 2, y, { align: 'center' });
  }

  // ---- Signature page ----
  n++;
  y = contractNewPage(doc, n);
  const vendorX = 12.7;
  const purchaserX = 111.3;
  const witnessX = 25.4;
  const colW = 86;
  setContractFont(doc, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...CONTRACT_INK);
  const vLines: string[] = doc.splitTextToSize('SIGNED AND DELIVERED ON BEHALF OF THE VENDOR:', colW);
  const pLines: string[] = doc.splitTextToSize('SIGNED AND DELIVERED ON BEHALF OF THE PURCHASER:', colW);
  doc.text(vLines, vendorX, 25.5);
  doc.text(pLines, purchaserX, 25.5);
  drawContractPartyName(doc, vendorName, vendorX, 39.5, colW);
  drawContractPartyName(doc, purchaserName, purchaserX, 39.5, colW);
  setContractFont(doc, 'normal');
  doc.setFontSize(11);
  const sigRows: [string, string][] = [
    ['Sign', '............................................'],
    ['Name:', '............................................'],
    ['Designation:', '....................................'],
  ];
  sigRows.forEach(([lab, dots], index) => {
    const rowY = [58.2, 72.1, 86][index];
    doc.text(lab + ' ' + dots, vendorX, rowY);
    doc.text(lab + ' ' + dots, purchaserX, rowY);
  });
  setContractFont(doc, 'bold');
  doc.text('WITNESS:', witnessX, 109.3);
  doc.text('WITNESS:', purchaserX, 109.3);
  setContractFont(doc, 'normal');
  doc.text('In the presence of:', witnessX, 123.2);
  doc.text('In the presence of:', purchaserX, 123.2);
  sigRows.forEach(([lab, dots], index) => {
    const rowY = [132.5, 141.9, 155.8][index];
    doc.text(lab + ' ' + dots, witnessX, rowY);
    doc.text(lab + ' ' + dots, purchaserX, rowY);
  });

  if (doc.getNumberOfPages() !== 10) {
    throw new Error('The contract text no longer fits the required ten-page layout. Review the contract wording before generating it.');
  }

  return doc;
}

export function contractFilename(clientName: string): string {
  return `ContractOfSale_${(clientName || 'client').replace(/\s+/g, '_')}.pdf`;
}

