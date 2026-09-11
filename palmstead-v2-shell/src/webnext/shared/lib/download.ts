// Triggers a browser download for an in-memory Blob -- same click-a-
// throwaway-anchor approach csv.ts's exportCSV() already uses, factored
// out here so binary exports (xlsx) can share it too.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ExcelJS's writeBuffer() returns an ArrayBuffer, not a data URI like
// jsPDF's doc.output('datauristring') -- this is the equivalent
// conversion so Document Vault can store an .xlsx export the same way
// it stores a PDF (one file_data column, format-agnostic).
export function arrayBufferToDataUri(buffer: ArrayBuffer, mimeType: string): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${btoa(binary)}`;
}
