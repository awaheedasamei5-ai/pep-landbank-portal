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
