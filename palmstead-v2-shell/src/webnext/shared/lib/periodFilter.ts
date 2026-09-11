"use client";

import { useState } from 'react';

// Real user ask: "the tile list format of the data is not sustainable
// in the long run form this apps, it should be in build in filters
// where only recent (this month) data or history is shown on the
// current page the rest u have to filter either by day/month/year/
// duration etc to retrive previous data." One shared filter (state +
// range math) reused across Site Visits, SVE, Enquiries, Complaints,
// and Allocations rather than five separate ad-hoc implementations, so
// "this month by default, day/month/year/custom range to go back" means
// the same thing everywhere in the app.
export type PeriodMode = 'month' | 'day' | 'year' | 'custom' | 'all';

export interface PeriodRange {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}
function currentYearKey(): string {
  return String(new Date().getFullYear());
}
function monthRange(key: string): PeriodRange {
  const [y, m] = key.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${pad(lastDay)}` };
}
function yearRange(key: string): PeriodRange {
  return { from: `${key}-01-01`, to: `${key}-12-31` };
}

export function usePeriodFilter() {
  const [mode, setMode] = useState<PeriodMode>('month');
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [dayKey, setDayKey] = useState(todayIso());
  const [yearKey, setYearKey] = useState(currentYearKey());
  const [customFrom, setCustomFrom] = useState(currentMonthKey() + '-01');
  const [customTo, setCustomTo] = useState(todayIso());

  const range: PeriodRange | null =
    mode === 'all' ? null : mode === 'month' ? monthRange(monthKey) : mode === 'day' ? { from: dayKey, to: dayKey } : mode === 'year' ? yearRange(yearKey) : { from: customFrom, to: customTo };

  const label =
    mode === 'all'
      ? 'All time'
      : mode === 'month'
        ? new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : mode === 'day'
          ? new Date(`${dayKey}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
          : mode === 'year'
            ? yearKey
            : `${customFrom} to ${customTo}`;

  function resetToThisMonth() {
    setMode('month');
    setMonthKey(currentMonthKey());
  }

  return {
    mode,
    setMode,
    monthKey,
    setMonthKey,
    dayKey,
    setDayKey,
    yearKey,
    setYearKey,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    range,
    label,
    resetToThisMonth,
    isThisMonth: mode === 'month' && monthKey === currentMonthKey(),
  };
}

export type PeriodFilterState = ReturnType<typeof usePeriodFilter>;

// dateStr may be a full timestamp or a plain date -- only the date part
// matters for range comparison.
export function inPeriodRange(dateStr: string | null | undefined, range: PeriodRange | null): boolean {
  if (!range) return true;
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= range.from && d <= range.to;
}
