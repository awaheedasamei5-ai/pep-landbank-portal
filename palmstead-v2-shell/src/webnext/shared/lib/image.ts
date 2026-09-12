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

// Exact port of v1's real resizeImageToB64() (index.html:1528-1547) --
// caps a user-uploaded photo (camera capture or gallery pick) down to
// maxW×maxH before it's stored as a data URI, so a phone's full-
// resolution photo doesn't bloat a jsonb column or a real-time payload.
// Used by Banner Tracking's add-entry/log-status-update photo capture,
// same as v1's own real usage.
export function resizeImageToDataUri(file: File, maxW: number, maxH: number, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('not a valid image'));
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h *= maxW / w;
          w = maxW;
        }
        if (h > maxH) {
          w *= maxH / h;
          h = maxH;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
