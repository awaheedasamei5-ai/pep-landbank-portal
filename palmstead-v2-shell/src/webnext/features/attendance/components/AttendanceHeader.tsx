"use client";

import { ArrowLeft } from 'lucide-react';

export function AttendanceHeader({ currentTime, onBack }: { currentTime: Date; onBack: () => void }) {
  return (
    <div className="relative flex flex-col items-center px-6 pb-2 pt-10">
      <button type="button" onClick={onBack} className="absolute left-6 top-8 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-400 shadow-lg active:scale-90 dark:border-slate-700 dark:bg-slate-800">
        <ArrowLeft size={20} />
      </button>
      <div className="text-center">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()}
        </p>
        <p className="text-4xl font-semibold tracking-tighter tabular-nums text-slate-900 dark:text-white">
          {currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
