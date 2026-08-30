import type { jsPDF } from 'jspdf';

// Port of index.html's pdfStampSignature() (index.html:2332-2343) -- draws
// a signature image into a jsPDF doc at natural aspect ratio, capped to
// maxW/maxH, anchored so (x,y) is the BASELINE the signature sits above
// (matches every real call site, which positions y at the line the
// signature should sit just above). Used anywhere a document needs an
// approver's/preparer's/issuer's own saved signature auto-filled.
export function pdfStampSignature(doc: jsPDF, x: number, y: number, maxW: number, maxH: number, signatureDataUrl: string | null | undefined): boolean {
  if (!signatureDataUrl) return false;
  try {
    const props = doc.getImageProperties(signatureDataUrl);
    const scale = Math.min(maxW / props.width, maxH / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    doc.addImage(signatureDataUrl, 'PNG', x, y - h, w, h);
    return true;
  } catch {
    return false;
  }
}
