import { jsPDF } from "jspdf";

import { loadImageAsDataUri } from "@/webnext/shared/lib/image";
import { pdfStampSignature } from "@/webnext/shared/lib/pdfSignature";
import { pdfGeneratedStamp, pdfReportFooter, pdfSimpleTable, PDF_INK, PDF_MUTED } from "@/webnext/shared/lib/pdfReport";

import type { CommissionReportConfig } from "./use-finance-commission";
import type { CalcEntry } from "./use-commission-calculator";

// Real Commission Calculator PDF (Part E.3 -- corrected after the user's
// real complaint: a document sent to a bank is a payment instruction, not
// an internal working paper. It must never show commission rates, caps,
// pool amounts or per-client sale detail -- only who gets paid, which
// account, and how much. Format follows real bank payment-advice/
// remittance-letter conventions (letterhead -> reference -> addressee ->
// subject -> instruction paragraph -> beneficiary table -> total ->
// authorized signatory), researched directly rather than invented.
function money(n: number): string {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(period: string): string {
  return new Date(`${period}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

async function loadLogo(uploaded: string | null): Promise<string | null> {
  if (uploaded) return uploaded;
  try {
    return await loadImageAsDataUri("/trulander-logo.png");
  } catch {
    return null;
  }
}

export interface CalcPdfRow {
  payrollStaffId: string;
  staffName: string;
  bankAccountNumber: string | null;
  entries: CalcEntry[];
  personal: number;
  poolShare: number;
  eligible: boolean;
  total: number;
}

export async function buildCommissionCalculatorPdf(
  period: string,
  sessionName: string | null,
  rows: CalcPdfRow[],
  config: CommissionReportConfig,
  issuerSignature: string | null | undefined,
  issuerName: string | null | undefined,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = await loadLogo(config.logoImage);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const reference = `COMM-${period}${sessionName ? `-${sessionName.replace(/\s+/g, "").slice(0, 10).toUpperCase()}` : ""}`;

  let y = 16;

  // Letterhead -- company identity, no logo-on-the-right report chrome,
  // this is a letter, not a dashboard export.
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 12, y, 22, 22);
    } catch {
      /* unreadable image data, skip silently */
    }
  }
  const textX = logo ? 40 : 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_INK);
  doc.text(config.companyName, textX, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_MUTED);
  const letterheadLines = [config.companyAddress, [config.companyPhone, config.companyEmail].filter(Boolean).join("  ·  ")].filter(Boolean);
  letterheadLines.forEach((line, i) => doc.text(line as string, textX, y + 13 + i * 4.5));
  y += 28;
  doc.setDrawColor(201, 162, 39);
  doc.setLineWidth(0.8);
  doc.line(12, y, pageW - 12, y);
  y += 10;

  // Date and reference.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_INK);
  doc.text(new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }), pageW - 12, y, { align: "right" });
  doc.text(`Ref: ${reference}`, pageW - 12, y + 5, { align: "right" });

  // Addressee.
  doc.setFont("helvetica", "bold");
  doc.text("The Manager", 12, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${config.bankName || "[Bank name]"}`, 12, y + 5);
  doc.text(`${config.bankBranch || "[Branch]"}`, 12, y + 10);
  y += 20;

  // Subject line.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(`Subject: Payment Advice — Sales Commission Payout — ${monthLabel(period)}`, 12, y);
  y += 9;

  // Instruction paragraph.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_INK);
  const bodyText = doc.splitTextToSize(
    `Dear Sir/Madam,\n\nPlease be instructed to debit our account ${config.bankAccountNumber || "[account number]"} (${config.bankAccountName || config.companyName}) held with your bank, and credit each beneficiary listed below with the amount shown against their name, being sales commission due for ${monthLabel(period)}.`,
    pageW - 24,
  );
  doc.text(bodyText, 12, y);
  y += bodyText.length * 4.6 + 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(`Total value: ${money(grandTotal)}  (${rows.length} beneficiar${rows.length === 1 ? "y" : "ies"})`, 12, y);
  y += 9;

  // Beneficiary table -- the only real content a bank needs.
  y = pdfSimpleTable(
    doc,
    y,
    pageW,
    ["No.", "Beneficiary name", "Account number", "Amount"],
    rows.map((r, i) => [`${i + 1}`, r.staffName, r.bankAccountNumber || "Not on file", money(r.total)]),
    [0.1, 0.35, 0.3, 0.25],
  );
  y += 4;

  doc.setDrawColor(201, 162, 39);
  doc.setLineWidth(0.5);
  doc.line(pageW - 90, y, pageW - 12, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_INK);
  doc.text(`TOTAL: ${money(grandTotal)}`, pageW - 12, y, { align: "right" });
  y += 12;

  if (y > pageH - 55) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("Kindly confirm execution of this instruction at your earliest convenience.", 12, y);
  y += 6;
  doc.text("Thank you.", 12, y);
  y += 16;

  if (issuerSignature) pdfStampSignature(doc, 12, y - 2, 45, 16, issuerSignature);
  doc.setDrawColor(201, 162, 39);
  doc.setLineWidth(0.6);
  doc.line(12, y, 12 + 65, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_MUTED);
  doc.text("Authorized Signatory", 12, y);
  doc.text(issuerName ?? "", 12, y + 5);
  doc.text("Management", 12, y + 10);

  pdfReportFooter(doc, config.companyName);
  pdfGeneratedStamp(doc, issuerName);
  return doc;
}
