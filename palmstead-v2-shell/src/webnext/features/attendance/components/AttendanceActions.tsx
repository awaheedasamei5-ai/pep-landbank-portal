"use client";

// Adapted from the approved OSS foundation (mimnets/OpenHRApp's real
// src/components/attendance/AttendanceActions.tsx), with its generic
// "FACTORY duty needs remarks" condition replaced by V1's real rule:
// an off-site fix needs its own reason, and (sign-in only) arriving
// after the grace cutoff needs its own separate reason -- two distinct
// real columns (sign_in_reason / late_reason), not one merged remarks
// field, and never asked for a normal on-time office sign-in/out.
import { AlertCircle, RefreshCw, Fingerprint } from 'lucide-react';

export function AttendanceActions({
  mode,
  isOffSite,
  isLate,
  offSiteReason,
  setOffSiteReason,
  lateReason,
  setLateReason,
  onSubmit,
  status,
  isDisabled,
}: {
  mode: 'in' | 'out';
  isOffSite: boolean;
  isLate: boolean;
  offSiteReason: string;
  setOffSiteReason: (v: string) => void;
  lateReason: string;
  setLateReason: (v: string) => void;
  onSubmit: () => void;
  status: 'idle' | 'loading' | 'success';
  isDisabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-8 pb-12 pt-4">
      {isOffSite && (
        <div className="w-full max-w-[320px] space-y-2">
          <p className="flex items-center gap-1.5 px-2 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
            <AlertCircle size={10} className="text-amber-500" />
            Off-site {mode === 'in' ? 'sign-in' : 'sign-out'} reason (required)
          </p>
          <input
            type="text"
            placeholder="e.g. Client site visit, banner run…"
            className="w-full rounded-2xl border border-amber-200 bg-amber-50/40 px-6 py-3.5 text-xs font-bold text-slate-700 shadow-sm outline-none placeholder:text-slate-300"
            value={offSiteReason}
            onChange={(e) => setOffSiteReason(e.target.value)}
          />
        </div>
      )}
      {mode === 'in' && isLate && (
        <div className="w-full max-w-[320px] space-y-2">
          <p className="flex items-center gap-1.5 px-2 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
            <AlertCircle size={10} className="text-amber-500" />
            Reason for arriving late (required)
          </p>
          <input
            type="text"
            placeholder="e.g. Traffic, transport delay…"
            className="w-full rounded-2xl border border-amber-200 bg-amber-50/40 px-6 py-3.5 text-xs font-bold text-slate-700 shadow-sm outline-none placeholder:text-slate-300"
            value={lateReason}
            onChange={(e) => setLateReason(e.target.value)}
          />
        </div>
      )}

      <div className="w-full max-w-[320px]">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isDisabled}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 text-[20px] font-semibold uppercase tracking-[0.1em] text-white shadow-xl transition-all active:scale-95 disabled:opacity-20"
        >
          {status === 'loading' ? <RefreshCw className="animate-spin" size={18} /> : (
            <>
              <Fingerprint size={18} />
              {mode === 'in' ? 'Check In' : 'Check Out'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
