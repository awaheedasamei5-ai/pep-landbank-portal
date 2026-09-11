// Fetches a same-origin static asset (e.g. from public/) and converts it to
// a base64 data URI, the format jsPDF's addImage() requires. Used for
// stamping the Trulander logo onto generated PDFs.
export async function loadImageAsDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load image: ${url}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image blob'));
    reader.readAsDataURL(blob);
  });
}
