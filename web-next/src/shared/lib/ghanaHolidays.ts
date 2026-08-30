import { isoPlusDays } from './format';

// Faithful port of index.html's Ghana public-holiday calendar math
// (index.html:23602-23668) -- fixed-date + Easter-derived + algorithmic-
// Eid holidays. Management can't edit this list (kept simple on purpose,
// matching the real app) -- if a specific year's government proclamation
// shifts a date, that's handled as a one-off leave-conflict override, not
// a code change.

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

function islamicToJDN(y: number, m: number, d: number): number {
  return Math.floor((11 * y + 3) / 30) + 354 * y + 30 * m - Math.floor((m - 1) / 2) + d + 1948440 - 385;
}

// Easter Sunday via the anonymous Gregorian algorithm.
function easterSundayForYear(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Eid al-Fitr = 1 Shawwal (month 10); Eid al-Adha = 10 Dhu al-Hijjah
// (month 12). A given Gregorian year can only ever contain the tail/head
// of 1-2 Hijri years, so this probes a small range around the estimate
// and keeps whichever land in-year. Window: 1 day either side of the
// computed date, to absorb typical moon-sighting variance.
function hijriEidWindowsForGregorianYear(gYear: number): { name: string; dates: string[] }[] {
  const results: { name: string; centerIso: string }[] = [];
  const estH = Math.floor(((gYear - 622) * 33) / 32);
  for (let hy = estH - 1; hy <= estH + 1; hy++) {
    const fitr = jdnToGregorian(islamicToJDN(hy, 10, 1));
    if (fitr.year === gYear) results.push({ name: 'Eid al-Fitr', centerIso: `${gYear}-${String(fitr.month).padStart(2, '0')}-${String(fitr.day).padStart(2, '0')}` });
    const adha = jdnToGregorian(islamicToJDN(hy, 12, 10));
    if (adha.year === gYear) results.push({ name: 'Eid al-Adha', centerIso: `${gYear}-${String(adha.month).padStart(2, '0')}-${String(adha.day).padStart(2, '0')}` });
  }
  return results.map((r) => ({ name: r.name, dates: [isoPlusDays(r.centerIso, -1), r.centerIso, isoPlusDays(r.centerIso, 1)] }));
}

export interface GhanaHoliday {
  date: string;
  name: string;
  isEid?: boolean;
}

export function ghanaHolidaysForYear(year: number): GhanaHoliday[] {
  const list: GhanaHoliday[] = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-03-06`, name: 'Independence Day' },
    { date: `${year}-05-01`, name: 'May Day' },
    { date: `${year}-08-04`, name: "Founders' Day" },
    { date: `${year}-09-21`, name: 'Kwame Nkrumah Memorial Day' },
    { date: `${year}-12-25`, name: 'Christmas Day' },
    { date: `${year}-12-26`, name: 'Boxing Day' },
  ];
  const easter = easterSundayForYear(year);
  list.push({ date: isoPlusDays(easter, -2), name: 'Good Friday' });
  list.push({ date: isoPlusDays(easter, 1), name: 'Easter Monday' });
  hijriEidWindowsForGregorianYear(year).forEach((w) => w.dates.forEach((d) => list.push({ date: d, name: w.name, isEid: true })));
  return list;
}

const holidayMapCache: Record<number, Map<string, GhanaHoliday>> = {};

export function ghanaHolidayMapForYear(year: number): Map<string, GhanaHoliday> {
  if (holidayMapCache[year]) return holidayMapCache[year];
  const map = new Map<string, GhanaHoliday>();
  ghanaHolidaysForYear(year).forEach((h) => {
    if (!map.has(h.date)) map.set(h.date, h);
  });
  holidayMapCache[year] = map;
  return map;
}

export function isWeekendIso(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00`).getDay();
  return dow === 0 || dow === 6;
}

export function nextWorkingDayIso(iso: string): string {
  let d = isoPlusDays(iso, 1);
  while (isWeekendIso(d)) d = isoPlusDays(d, 1);
  return d;
}

export function prevWorkingDayIso(iso: string): string {
  let d = isoPlusDays(iso, -1);
  while (isWeekendIso(d)) d = isoPlusDays(d, -1);
  return d;
}
