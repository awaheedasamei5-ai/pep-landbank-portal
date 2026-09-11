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

// New 2026-09-11 (ATTENDANCE_BLUEPRINT.md §3 step 5) -- companion to
// resizeSelfieToDataUri() for a LIVE getUserMedia capture instead of a
// file input: a playing <video> frame is already decoded, so this can
// draw straight to a correctly-sized canvas in one synchronous step,
// no FileReader/Image round-trip needed. Same (480,480,0.85) bounds so
// a live capture and the file-input fallback produce equivalent output.
export function captureVideoFrameToDataUri(video: HTMLVideoElement, maxW = 480, maxH = 480, quality = 0.85): string {
  let w = video.videoWidth;
  let h = video.videoHeight;
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
  if (!ctx) throw new Error('Canvas not supported');
  // Mirror horizontally so the still matches what the person saw in the
  // live preview (a front camera feed is shown mirrored by convention,
  // like every phone's own selfie camera) -- without this the captured
  // photo looks flipped/backwards compared to the preview they just saw.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
