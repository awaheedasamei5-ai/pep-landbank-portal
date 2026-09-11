import { useEffect, useRef, useState } from 'react';
import { captureVideoFrameToDataUri, resizeSelfieToDataUri } from '../lib/selfiePhoto';
import { Icon } from './Icon';
import styles from './CameraCapture.module.css';

interface CameraCaptureProps {
  value: string | null;
  onChange: (dataUri: string | null) => void;
  label?: string;
}

// Real ATTENDANCE_BLUEPRINT.md §3 step 5 / §15 requirement: the 59-page
// master spec's own sign-in flow says "request camera permission and
// capture a fresh snapshot" -- a live in-app camera, not a file-input
// handoff to the OS camera app (what both v1 and web-next used before
// this). Falls back to that exact file-input approach automatically
// when getUserMedia is unavailable or permission is denied, so a real
// device/browser gap never blocks sign-in entirely.
export function CameraCapture({ value, onChange, label = 'Photo' }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<'idle' | 'live' | 'unsupported'>('idle');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stopStream, []);

  async function startCamera() {
    setError(null);
    setPending(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMode('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setMode('live');
      setStatus('Camera ready');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setMode('unsupported');
    }
  }

  // Blueprint §3 step 5: capture only stages the still for review -- the
  // photo isn't accepted until the person taps "Use this photo", so a bad
  // frame (blinked, blurry) can be retaken before it ever reaches onChange.
  function capture() {
    if (!videoRef.current) return;
    try {
      const dataUri = captureVideoFrameToDataUri(videoRef.current);
      setPending(dataUri);
      stopStream();
      setStatus('Photo captured -- review and confirm');
    } catch {
      setError('Could not capture that photo -- try again.');
    }
  }

  function retake() {
    setPending(null);
    setStatus('');
    startCamera();
  }

  function usePhoto() {
    if (!pending) return;
    onChange(pending);
    setPending(null);
    setStatus('Photo saved');
    setMode('idle');
  }

  function retakeFinal() {
    onChange(null);
    setStatus('');
    startCamera();
  }

  async function handleFileFallback(file: File | null) {
    if (!file) return;
    try {
      onChange(await resizeSelfieToDataUri(file));
      setStatus('Photo captured');
    } catch {
      setError('Could not read that photo -- try again.');
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.srOnly} aria-live="polite">
        {status}
      </p>
      {value ? (
        <>
          <img src={value} alt={label} className={styles.preview} />
          <button type="button" className={styles.retakeBtn} onClick={retakeFinal}>
            Retake
          </button>
        </>
      ) : pending ? (
        <>
          <img src={pending} alt={label} className={styles.preview} />
          <div className={styles.confirmRow}>
            <button type="button" className={styles.retakeBtn} onClick={retake}>
              Retake
            </button>
            <button type="button" className={styles.useBtn} onClick={usePhoto}>
              Use this photo
            </button>
          </div>
        </>
      ) : mode === 'live' ? (
        <>
          <video ref={videoRef} className={styles.preview} muted playsInline style={{ transform: 'scaleX(-1)' }} />
          <button type="button" className={styles.captureBtn} onClick={capture} aria-label="Capture photo">
            <Icon name="camera" size={24} />
          </button>
        </>
      ) : mode === 'unsupported' ? (
        <>
          <p className={styles.hint}>Camera access unavailable — using your device's camera app instead.</p>
          <input className={styles.fileInput} type="file" accept="image/*" capture="user" onChange={(e) => handleFileFallback(e.target.files?.[0] ?? null)} />
        </>
      ) : (
        <>
          <div className={styles.placeholder}>No photo yet</div>
          <button type="button" className={styles.takeBtn} onClick={startCamera}>
            <Icon name="camera" size={18} /> Take photo
          </button>
        </>
      )}
      {error && <p className={styles.hint}>{error}</p>}
    </div>
  );
}
