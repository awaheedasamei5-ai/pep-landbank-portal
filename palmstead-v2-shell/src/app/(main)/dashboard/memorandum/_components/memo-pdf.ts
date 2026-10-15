import { jsPDF } from "jspdf";

import { loadImageAsDataUri } from "@/webnext/shared/lib/image";
import { pdfGeneratedStamp, pdfReportFooter, PDF_INK, PDF_MUTED } from "@/webnext/shared/lib/pdfReport";
import { requireSupabase } from "@/lib/supabase.client";

import type { Memo } from "./use-memoranda";

// Real memo PDF (09-memorandum-plan.md) -- a letterhead document, same real
// intent as V1's buildMemoPDF: this is a formal internal letter meant to be
// printed/read, not a raw HTML dump of the editor. Converts the TipTap HTML
// body into real styled paragraph runs (bold/italic/underline/lists)
// instead of rasterizing the editor, matching V1's own real
// memoHtmlToRuns/pdfRenderMemoBlocks approach.
interface MemoCompanyConfig {
  companyName: string;
  companyAddress: string;
  logoImage: string | null;
}

async function fetchCompanyConfig(): Promise<MemoCompanyConfig> {
  const sb = requireSupabase();
  const { data } = await sb.from("app_config").select("quote_company_name,company_address,receipt_logo_image").limit(1).single();
  const row = data as { quote_company_name: string | null; company_address: string | null; receipt_logo_image: string | null } | null;
  return {
    companyName: row?.quote_company_name ?? "Palmstead",
    companyAddress: row?.company_address ?? "",
    logoImage: row?.receipt_logo_image ?? null,
  };
}

async function loadLogo(uploaded: string | null): Promise<string | null> {
  if (uploaded) return uploaded;
  try {
    return await loadImageAsDataUri("/trulander-logo.png");
  } catch {
    return null;
  }
}

interface HtmlBlock {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  listItem: boolean;
  ordered: boolean;
  index: number;
}

// Parses the TipTap-produced HTML body into plain paragraph/list-item blocks
// with their real inline formatting flags, walking the DOM rather than
// regex-stripping tags, so nested <strong>/<em>/<u> inside a <li> is
// preserved correctly.
function parseMemoHtml(html: string): HtmlBlock[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  const blocks: HtmlBlock[] = [];

  function textWithFlags(node: Node, bold: boolean, italic: boolean, underline: boolean): { text: string; bold: boolean; italic: boolean; underline: boolean }[] {
    const out: { text: string; bold: boolean; italic: boolean; underline: boolean }[] = [];
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent ?? "";
        if (t) out.push({ text: t, bold, italic, underline });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const nextBold = bold || tag === "strong" || tag === "b";
        const nextItalic = italic || tag === "em" || tag === "i";
        const nextUnderline = underline || tag === "u";
        out.push(...textWithFlags(el, nextBold, nextItalic, nextUnderline));
      }
    });
    return out;
  }

  let blockIndex = 0;
  container.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      el.querySelectorAll(":scope > li").forEach((li) => {
        const runs = textWithFlags(li, false, false, false);
        blocks.push({
          text: runs.map((r) => r.text).join(""),
          bold: runs.some((r) => r.bold),
          italic: runs.some((r) => r.italic),
          underline: runs.some((r) => r.underline),
          listItem: true,
          ordered,
          index: blockIndex++,
        });
      });
    } else {
      const runs = textWithFlags(el, false, false, false);
      const text = runs.map((r) => r.text).join("");
      if (text.trim()) {
        blocks.push({
          text,
          bold: runs.every((r) => r.bold) && runs.length > 0,
          italic: runs.every((r) => r.italic) && runs.length > 0,
          underline: runs.every((r) => r.underline) && runs.length > 0,
          listItem: false,
          ordered: false,
          index: blockIndex++,
        });
      }
    }
  });
  return blocks;
}

function renderMemoBlocks(doc: jsPDF, blocks: HtmlBlock[], marginL: number, marginR: number, startY: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - marginL - marginR;
  let y = startY;

  for (const block of blocks) {
    let fontStyle: "normal" | "bold" | "italic" | "bolditalic" = "normal";
    if (block.bold && block.italic) fontStyle = "bolditalic";
    else if (block.bold) fontStyle = "bold";
    else if (block.italic) fontStyle = "italic";
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(11);
    doc.setTextColor(...PDF_INK);

    const indent = block.listItem ? 6 : 0;
    const prefix = block.listItem ? (block.ordered ? `${block.index + 1}. ` : "• ") : "";
    const lines = doc.splitTextToSize(prefix + block.text, usableW - indent);
    for (const line of lines) {
      if (y > pageH - 25) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, marginL + indent, y);
      if (block.underline) {
        const w = doc.getTextWidth(line);
        doc.setDrawColor(...PDF_INK);
        doc.setLineWidth(0.3);
        doc.line(marginL + indent, y + 0.8, marginL + indent + w, y + 0.8);
      }
      y += 5.5;
    }
    y += block.listItem ? 1 : 3;
  }
  return y;
}

export async function buildMemoPdf(memo: Memo): Promise<jsPDF> {
  const config = await fetchCompanyConfig();
  const logo = await loadLogo(config.logoImage);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 18;
  const marginR = 18;
  let y = 18;

  if (logo) {
    try {
      doc.addImage(logo, "PNG", marginL, y, 20, 20);
    } catch {
      /* unreadable image data, skip */
    }
  }
  const textX = logo ? marginL + 26 : marginL;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PDF_INK);
  doc.text(config.companyName, textX, y + 7);
  if (config.companyAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(config.companyAddress, textX, y + 13);
  }
  y += 26;
  doc.setDrawColor(201, 162, 39);
  doc.setLineWidth(0.8);
  doc.line(marginL, y, pageW - marginR, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...PDF_INK);
  doc.text("MEMORANDUM", pageW / 2, y, { align: "center" });
  y += 12;

  const fieldRows: [string, string][] = [
    ["To", memo.toName],
    ["From", memo.fromName],
    ...(memo.cc.length ? ([["Cc", memo.cc.map((c) => c.staffName).join(", ")]] as [string, string][]) : []),
    ["Date", new Date(memo.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })],
    ["Subject", memo.subject],
  ];
  for (const [label, value] of fieldRows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(`${label.toUpperCase()}:`, marginL, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...PDF_INK);
    doc.text(value, marginL + 22, y);
    y += 6.5;
  }
  y += 4;
  doc.setDrawColor(...PDF_MUTED);
  doc.setLineWidth(0.3);
  doc.line(marginL, y, pageW - marginR, y);
  y += 10;

  const blocks = parseMemoHtml(memo.bodyHtml);
  y = renderMemoBlocks(doc, blocks, marginL, marginR, y);

  pdfReportFooter(doc, config.companyName);
  pdfGeneratedStamp(doc, memo.fromName);
  return doc;
}
