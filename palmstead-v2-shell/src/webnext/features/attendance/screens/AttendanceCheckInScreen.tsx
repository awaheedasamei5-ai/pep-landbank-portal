"use client";

// Adapted directly from the approved OSS foundation (mimnets/OpenHRApp's
// real src/pages/Attendance.tsx) -- a full-screen, camera-first check-
// in/out flow. V1's own sign-in is a bare "capture a location, maybe
// attach a photo" background action with no dedicated screen at all;
// this is a genuine upgrade, not a reinterpretation of V1's UI (V1
// contributed no UI here -- only the off-site/late reason rules, which
// this screen enforces via AttendanceActions).
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useGeoLocation } from '../hooks/useGeoLocation';
import { useAttendance } from '../hooks/useAttendance';
import { computeLateness } from '../lib/attendanceGeo';
import { AttendanceHeader } from '../components/AttendanceHeader';
import { CameraFeed } from '../components/CameraFeed';
import { LocationDisplay } from '../components/LocationDisplay';
import { AttendanceActions } from '../components/AttendanceActions';

export function AttendanceCheckInScreen({ onFinish }: { onFinish: () => void }) {
  const { currentTime, today, isLoadingToday, policy, status, setStatus, signIn, signOut } = useAttendance();
  const { videoRef, stream, error: cameraError, facingMode, isTorchOn, startCamera, stopCamera, toggleCamera, toggleTorch, takeSelfie, takePhoto, loading: cameraLoading } = useCamera();
  const { location, isLocating, error: locationError, detectLocation } = useGeoLocation();

  const mode: 'in' | 'out' = today?.signInAt && !today?.signOutAt ? 'out' : 'in';
  const [offSiteReason, setOffSiteReason] = useState('');
  const [lateReason, setLateReason] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [fallbackPhoto, setFallbackPhoto] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInitialized = useRef(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (isLoadingToday || cameraInitialized.current) return;
    cameraInitialized.current = true;
    detectLocation(true);
    startCamera('user');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs exactly once, when today's record has finished loading
  }, [isLoadingToday]);

  const isOffSite = !!location && !location.isAtOffice;
  const isLate = mode === 'in' && computeLateness(currentTime, policy ?? null);
  const hasPhoto = !!stream || !!fallbackPhoto;
  const reasonSatisfied = (!isOffSite || offSiteReason.trim().length > 0) && (!isLate || lateReason.trim().length > 0);

  async function handleTakePhoto() {
    const photo = await takePhoto();
    if (photo) setFallbackPhoto(photo);
  }

  async function handleSubmit() {
    if (status !== 'idle' || !location) return;
    let selfieData: string | null = null;
    if (stream && canvasRef.current) selfieData = takeSelfie(canvasRef.current);
    else if (fallbackPhoto) selfieData = fallbackPhoto;
    else {
      selfieData = await takePhoto();
      if (selfieData) setFallbackPhoto(selfieData);
    }

    try {
      if (mode === 'out' && today) {
        await signOut(today, { lat: location.lat, lng: location.lng, accuracy: location.accuracy, isOffSite, offSiteReason });
      } else {
        await signIn({ lat: location.lat, lng: location.lng, accuracy: location.accuracy, isOffSite, offSiteReason: isOffSite ? offSiteReason : lateReason, photoDataUri: selfieData });
      }
      setTimeout(() => {
        stopCamera();
        onFinish();
      }, 1500);
    } catch {
      setStatus('idle');
    }
  }

  if (isLoadingToday) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-[#fcfdfe] dark:bg-slate-950">
      <AttendanceHeader
        currentTime={currentTime}
        onBack={() => {
          stopCamera();
          onFinish();
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        <CameraFeed
          videoRef={videoRef}
          stream={stream}
          error={cameraError}
          facingMode={facingMode}
          isMobile={isMobile}
          isTorchOn={isTorchOn}
          toggleTorch={toggleTorch}
          toggleCamera={toggleCamera}
          showSuccess={status === 'success'}
          fallbackPhoto={fallbackPhoto}
          onTakePhoto={handleTakePhoto}
          photoLoading={cameraLoading}
        >
          <LocationDisplay location={location} isLocating={isLocating} error={locationError} onRetry={() => detectLocation(true)} />
        </CameraFeed>
      </div>

      <AttendanceActions
        mode={mode}
        isOffSite={isOffSite}
        isLate={isLate}
        offSiteReason={offSiteReason}
        setOffSiteReason={setOffSiteReason}
        lateReason={lateReason}
        setLateReason={setLateReason}
        onSubmit={handleSubmit}
        status={status}
        isDisabled={!location || isLocating || status !== 'idle' || !hasPhoto || !reasonSatisfied}
      />

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
