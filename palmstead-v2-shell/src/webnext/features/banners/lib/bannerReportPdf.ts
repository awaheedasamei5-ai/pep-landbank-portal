"use client";

import { jsPDF } from 'jspdf';
import { sitePdfHeader } from '../../site-visits/lib/sitePdfPrimitives';
import { pdfFitText, pdfGeneratedStamp } from '../../../shared/lib/pdfReport';
import { BANNER_STATUS } from './bannerLogic';
import type { Banner } from '../../../types/domain';

// Exact port of v1's real buildBannerReportPDF() (index.html:18597-
// 18632) -- same navy pdfHeader band (sitePdfHeader is the same real
// function, already ported for the Site Visit forms), same summary
// line, same 4-column NAME/AREA · STATUS · ADDED BY · DATE table. The
// hand-rolled "Generated ..." line at the bottom is replaced with this
// app's own pdfGeneratedStamp -- same information, the one shared helper
// every other PDF in this app already uses instead of re-deriving it.
export function buildBannerReportPdf(banners: Banner[], logoDataUri: string | null, generatedByName?: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = sitePdfHeader(doc, 'BANNER TRACKING REPORT', logoDataUri);
  y += 6;

  const placed = banners.filter((b) => b.status === 'placed').length;
  const maint = banners.filter((b) => b.status === 'needs_maintenance').length;
  const newLoc = banners.filter((b) => b.status === 'location_only').length;
  const areas = new Set(banners.map((b) => b.area).filter(Boolean));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(`Total banners: ${placed + maint}   ·   Perfect: ${placed}   ·   Needs maintenance: ${maint}   ·   New locations: ${newLoc}   ·   Areas: ${areas.size}`, 14, y);
  y += 10;

  const colX = [14, 90, 130, 160];
  doc.setFillColor(11, 30, 61);
  doc.rect(14, y, pageW - 28, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('NAME / AREA', colX[0] + 2, y + 4.8);
  doc.text('STATUS', colX[1] + 2, y + 4.8);
  doc.text('ADDED BY', colX[2] + 2, y + 4.8);
  doc.text('DATE', colX[3] + 2, y + 4.8);
  y += 7;
  doc.setTextColor(20, 20, 20);

  const sorted = banners.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  sorted.forEach((b) => {
    if (y > 265) {
      doc.addPage();
      y = 16;
    }
    doc.setDrawColor(226, 231, 237);
    doc.line(14, y + 11, pageW - 14, y + 11);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(pdfFitText(doc, b.name, 72), colX[0] + 2, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 112, 133);
    doc.text(pdfFitText(doc, b.area || '—', 72), colX[0] + 2, y + 8.5);
    doc.setFontSize(8);
    doc.setTextColor(20, 20, 20);
    doc.text(pdfFitText(doc, (BANNER_STATUS[b.status] || BANNER_STATUS.placed).label, 38), colX[1] + 2, y + 4.5);
    doc.text(pdfFitText(doc, b.createdByName || '—', 28), colX[2] + 2, y + 4.5);
    doc.setFontSize(7.5);
    doc.text((b.createdAt || '').slice(0, 10), colX[3] + 2, y + 4.5);
    y += 15;
  });

  pdfGeneratedStamp(doc, generatedByName);
  return doc;
}

export function bannerReportFilename(): string {
  return `Banner_Tracking_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
}
