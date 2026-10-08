"use client";

// Adapted directly from the approved OSS foundation (mimnets/OpenHRApp's
// real src/components/attendance/CameraFeed.tsx) -- a real live camera
// preview with a fallback static-photo path, torch/camera-switch
// controls, and a success overlay. V1 has none of this at all (a bare
// file input, no live preview, no fallback path for iOS PWA).
import type { RefObject, ReactNode } from 'react';
import { CameraOff, Loader2, Flashlight, SwitchCamera, CheckCircle2, Camera as CameraIcon } from 'lucide-react';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  error: string | null;
  facingMode: 'user' | 'environment';
  isMobile: boolean;
  isTorchOn: boolean;
  toggleTorch: () => void;
  toggleCamera: () => void;
  showSuccess: boolean;
  children?: ReactNode;
  fallbackPhoto?: string | null;
  onTakePhoto?: () => void;
  photoLoading?: boolean;
}

export function CameraFeed({ videoRef, stream, error, facingMode, isMobile, isTorchOn, toggleTorch, toggleCamera, showSuccess, children, fallbackPhoto, onTakePhoto, photoLoading }: Props) {
  const hasLiveStream = !!stream;
  const hasFallbackPhoto = !!fallbackPhoto;
  const showFallbackButton = !hasLiveStream && !error && !hasFallbackPhoto && onTakePhoto;

  return (
    <div className="relative w-full max-w-[280px] aspect-[3/4] rounded-[2.5rem] overflow-hidden bg-slate-900 shadow-2xl ring-8 ring-white dark:ring-slate-800">
      {hasLiveStream ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- a live self-capture preview, not media content
        <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
      ) : hasFallbackPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- a locally-captured data URI preview, not worth next/image's remote-loader config
        <img src={fallbackPhoto!} alt="Captured" className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white/40">
          {photoLoading ? (
            <Loader2 size={40} className="mb-3 animate-spin text-primary" />
          ) : error ? (
            <>
              <CameraOff size={40} className="mb-3 text-rose-500" />
              <p className="text-[9px] font-semibold uppercase tracking-widest">{error}</p>
            </>
          ) : showFallbackButton ? (
            <button type="button" onClick={onTakePhoto} className="pointer-events-auto flex flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                <CameraIcon size={32} className="text-white/70" />
              </div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60">Tap to take photo</p>
            </button>
          ) : (
            <Loader2 size={40} className="mb-3 animate-spin text-primary" />
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center pt-6">
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-[8px] font-semibold uppercase tracking-widest text-white shadow-xl ring-2 ring-emerald-500/20">
          <div className="h-1 w-1 animate-pulse rounded-full bg-white" />
          Face ready
        </div>
        {children}
      </div>

      {isMobile && hasLiveStream && (
        <>
          <button
            type="button"
            onClick={toggleTorch}
            className={`pointer-events-auto absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl backdrop-blur-md ${isTorchOn ? 'bg-amber-400 text-white' : 'bg-black/30 text-white'}`}
          >
            <Flashlight size={16} />
          </button>
          <button type="button" onClick={toggleCamera} className="pointer-events-auto absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl bg-black/30 text-white backdrop-blur-md active:scale-90">
            <SwitchCamera size={16} />
          </button>
        </>
      )}

      {hasFallbackPhoto && onTakePhoto && (
        <button type="button" onClick={onTakePhoto} className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-xs font-medium text-white backdrop-blur-md">
          Retake
        </button>
      )}

      {showSuccess && (
        <div className="absolute inset-0 z-[1002] flex flex-col items-center justify-center bg-emerald-600/95">
          <div className="mb-4 rounded-full bg-white p-4 shadow-2xl">
            <CheckCircle2 size={48} className="animate-bounce text-emerald-500" />
          </div>
          <h3 className="text-xl font-semibold uppercase tracking-widest text-white">Verified</h3>
        </div>
      )}
    </div>
  );
}
