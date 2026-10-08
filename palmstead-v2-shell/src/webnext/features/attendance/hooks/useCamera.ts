"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { resizeImageToWebpBlob } from '../../../shared/lib/image';

// Adapted from the approved OSS foundation (mimnets/OpenHRApp's real
// src/hooks/attendance/useCamera.ts) -- this is genuinely battle-tested
// camera handling V1 never had at all (V1's own sign-in photo is a bare
// file input with no live preview): live front/back camera stream with
// torch support, auto-recovery when the OS reclaims the camera (tab
// backgrounded then foregrounded), and a real fallback path for iOS PWA
// standalone mode, where a live stream can be blocked but the device's
// own camera app (via <input type=file capture>) still works.
const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });

function pickImageFile(capture: 'user' | 'environment' | null): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', capture);
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.onchange = () => finish(input.files?.[0] ?? null);
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && !input.files?.length) finish(null);
      }, 500);
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('focus', onFocus);
    input.click();
  });
}

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  streamRef.current = stream;
  const facingModeRef = useRef<'user' | 'environment'>(facingMode);
  facingModeRef.current = facingMode;

  const stopCamera = useCallback(() => {
    const current = streamRef.current;
    if (current) {
      current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const startCamera = useCallback(async (mode: 'user' | 'environment' = 'user') => {
    const existing = streamRef.current;
    if (existing) {
      existing.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
    setLoading(true);
    try {
      setError(null);
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, width: { ideal: 1080 }, height: { ideal: 1440 } } });
      streamRef.current = s;
      setStream(s);
      setFacingMode(mode);
      if (videoRef.current) videoRef.current.srcObject = s;
      const videoTrack = s.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (streamRef.current === s) setTimeout(() => { if (streamRef.current === s) startCamera(facingModeRef.current); }, 500);
        };
      }
    } catch {
      const isIOSPWA = /iPad|iPhone|iPod/.test(navigator.userAgent) && ((navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches);
      setError(isIOSPWA ? null : 'Camera permission denied.');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    setFacingMode((prev) => {
      const next = prev === 'user' ? 'environment' : 'user';
      setIsTorchOn(false);
      startCamera(next);
      return prev;
    });
  }, [startCamera]);

  const toggleTorch = useCallback(async () => {
    const current = streamRef.current;
    if (!current) return;
    const track = current.getVideoTracks()[0];
    const capabilities = (track as unknown as { getCapabilities?: () => { torch?: boolean } }).getCapabilities?.() || {};
    if (capabilities.torch) {
      try {
        await (track as unknown as { applyConstraints: (c: { advanced: { torch: boolean }[] }) => Promise<void> }).applyConstraints({ advanced: [{ torch: !isTorchOn }] });
        setIsTorchOn(!isTorchOn);
      } catch {
        // Torch toggle failing shouldn't block sign-in.
      }
    }
  }, [isTorchOn]);

  const takeSelfie = useCallback(
    (canvas: HTMLCanvasElement): string | null => {
      if (!streamRef.current || !videoRef.current) return null;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
      }
      return canvas.toDataURL('image/webp', 0.8);
    },
    [facingMode],
  );

  const takePhoto = useCallback(async (): Promise<string | null> => {
    try {
      setLoading(true);
      setError(null);
      const file = await pickImageFile('user');
      if (!file) return null;
      const dataUri = await blobToDataUrl(file);
      const webp = await resizeImageToWebpBlob(dataUri, 1080, 0.7);
      return await blobToDataUrl(webp);
    } catch {
      setError('Failed to take photo. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        // play() can fail on iOS PWA before user activation; autoPlay+playsInline retries.
      });
    }
  }, [stream]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && streamRef.current) {
        const tracks = streamRef.current.getVideoTracks();
        const allEnded = tracks.length === 0 || tracks.every((t) => t.readyState === 'ended');
        if (allEnded) startCamera(facingModeRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [startCamera]);

  useEffect(
    () => () => {
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    },
    [],
  );

  return { videoRef, stream, error, facingMode, isTorchOn, startCamera, stopCamera, toggleCamera, toggleTorch, takeSelfie, takePhoto, loading };
}
