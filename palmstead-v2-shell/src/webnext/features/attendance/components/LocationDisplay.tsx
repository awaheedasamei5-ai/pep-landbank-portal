"use client";

// Adapted directly from the approved OSS foundation (mimnets/OpenHRApp's
// real src/components/attendance/LocationDisplay.tsx) -- real,
// platform-specific help text instead of a bare "location failed"
// message, which is exactly the kind of situation-has-a-real-answer
// detail the app needs. Extended with V1's own real requirement: the
// pill also shows whether this fix is inside a configured office
// radius, since that's what decides whether an off-site reason is
// mandatory before sign-in can proceed.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, RefreshCw, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { AttendanceLocation } from '../hooks/useGeoLocation';

function LocationHelpGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between rounded-t-3xl border-b border-slate-100 bg-white px-6 pb-3 pt-5">
          <h3 className="text-sm font-bold text-slate-800">How to enable location</h3>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
            <X size={14} className="text-slate-500" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-4 text-xs leading-relaxed text-slate-600">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-800">Android (Chrome / installed app)</p>
            <ol className="list-inside list-decimal space-y-1.5">
              <li>Open Settings &gt; Location and turn it ON</li>
              <li>Go to Settings &gt; Apps &gt; Chrome (or Palmstead if installed)</li>
              <li>Tap Permissions &gt; Location &gt; Allow</li>
              <li>Return to the app and tap Retry</li>
            </ol>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-800">iPhone / iPad (Safari / installed app)</p>
            <ol className="list-inside list-decimal space-y-1.5">
              <li>Open Settings &gt; Privacy &amp; Security &gt; Location Services and turn it ON</li>
              <li>Scroll down and tap Safari Websites (or Palmstead if installed)</li>
              <li>Select While Using the App</li>
              <li>Return to the app and tap Retry</li>
            </ol>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-800">Desktop Chrome</p>
            <ol className="list-inside list-decimal space-y-1.5">
              <li>Click the lock icon in the address bar</li>
              <li>Find Location and set it to Allow</li>
              <li>Reload the page or tap Retry</li>
            </ol>
          </div>
          <p className="border-t border-slate-100 pt-2 text-[10px] text-slate-400">Tip: if location still doesn&apos;t work, turn Wi-Fi ON -- it helps with indoor positioning.</p>
        </div>
      </div>
    </div>
  );
}

export function LocationDisplay({ location, isLocating, error, onRetry }: { location: AttendanceLocation | null; isLocating: boolean; error?: string | null; onRetry: () => void }) {
  const [showHelp, setShowHelp] = useState(false);
  const [showError, setShowError] = useState(true);

  if (location && !error) {
    return (
      <button type="button" onClick={onRetry} className="pointer-events-auto mt-3 flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-1.5 backdrop-blur-md">
        <MapPin size={10} className={location.isAtOffice ? 'text-emerald-400' : 'text-rose-400'} />
        <span className="text-[8px] font-semibold uppercase tracking-wider text-white">{location.isAtOffice ? location.officeName || 'At the office' : 'Off-site'}</span>
      </button>
    );
  }

  if (isLocating) {
    return (
      <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-1.5 backdrop-blur-md">
        <RefreshCw size={10} className="animate-spin text-blue-400" />
        <span className="text-[8px] font-semibold uppercase tracking-wider text-white">Detecting location…</span>
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-auto mt-3 flex flex-col items-center gap-1.5">
        {error && showError && (
          <div className="max-w-[240px] rounded-xl bg-red-500/90 px-3 py-2 backdrop-blur-md">
            <div className="flex items-start gap-1.5">
              <AlertTriangle size={10} className="mt-0.5 shrink-0 text-white" />
              <span className="text-[7px] font-medium leading-tight text-white">{error}</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onRetry} className="flex items-center gap-1.5 rounded-xl bg-blue-500/90 px-3 py-1.5 backdrop-blur-md transition-transform active:scale-95">
            <RefreshCw size={9} className="text-white" />
            <span className="text-[8px] font-semibold uppercase tracking-wider text-white">Retry location</span>
          </button>
          <button type="button" onClick={() => setShowHelp(true)} className="flex items-center gap-1 rounded-xl bg-white/20 px-3 py-1.5 backdrop-blur-md">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-white/80">Help</span>
          </button>
          {error && (
            <button type="button" onClick={() => setShowError(!showError)} className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 backdrop-blur-md">
              {showError ? <ChevronUp size={10} className="text-white/60" /> : <ChevronDown size={10} className="text-white/60" />}
            </button>
          )}
        </div>
      </div>
      {showHelp && typeof document !== 'undefined' && createPortal(<LocationHelpGuide onClose={() => setShowHelp(false)} />, document.body)}
    </>
  );
}
