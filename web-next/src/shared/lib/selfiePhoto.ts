// Port of index.html's resizeImageToB64 (index.html:2408-2426), called with
// the same (480,480,0.85) bounds captureSelfie() used -- keeps the stored
// attendance photo small (JPEG, longest side capped at 480px) without a
// bespoke crop-to-square step; aspect ratio is preserved, not forced.
export function resizeSelfieToDataUri(file: File, maxW = 480, maxH = 480, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that photo'));
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = h * (maxW / w);
          w = maxW;
        }
        if (h > maxH) {
          w = w * (maxH / h);
          h = maxH;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
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
