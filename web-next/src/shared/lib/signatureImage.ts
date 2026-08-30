// Port of index.html's readSignatureFile() (index.html:2279-2299).
// Signatures keep their natural (non-square) shape -- unlike an avatar
// cropper, this just downscales to a sane max width so the stored PNG
// stays small, and flattens onto white so a transparent-background
// upload still prints cleanly on a document.
export function readSignatureFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image'));
      img.onload = () => {
        const maxW = 420;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png', 0.92));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
