import { isoPlusDays } from './format';
import type { EidWindow } from '../../types/domain';

// Faithful port of index.html's Ghana public-holiday calendar math
// (index.html:23602-23668) for the FIXED-DATE/Easter-derived holidays
// only. Master Spec 12.3 is explicit that Eid dates must NOT be
// algorithmically predicted ("Nager.Date's own project documentation says
// Islamic holidays such as Eid al-Fitr and Eid al-Adha cannot be reliably
// calculated in advance because local moon sightings can shift dates...
// allow Management to maintain an annual Eid window") -- Eid dates come
// from Config.eidWindows, a real Management-editable list, each expanded
// to a date range by its own configurable days-before/after buffer -- see
// eidHolidaysFromWindows below.

// Easter Sunday via the anonymous Gregorian algorithm -- kept: this is a
// real, universally-agreed deterministic calculation (unlike Eid), the
// same one every Western-calendar Easter-holiday system in the world uses.
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

export interface GhanaHoliday {
  date: string;
  name: string;
  isEid?: boolean;
}

// Expands each Management-configured Eid window into its real date range.
// A window whose center date falls near a year boundary can legitimately
// contribute dates in two different years -- callers filter by year
// themselves (see ghanaHolidaysForYear) rather than this function guessing.
export function eidHolidaysFromWindows(windows: EidWindow[]): GhanaHoliday[] {
  const list: GhanaHoliday[] = [];
  windows.forEach((w) => {
    for (let offset = -Math.max(0, w.daysBefore); offset <= Math.max(0, w.daysAfter); offset++) {
      list.push({ date: isoPlusDays(w.centerDate, offset), name: `${w.name} — Eid window`, isEid: true });
    }
  });
  return list;
}

export function ghanaHolidaysForYear(year: number, eidWindows: EidWindow[] = []): GhanaHoliday[] {
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
  eidHolidaysFromWindows(eidWindows)
    .filter((h) => h.date.startsWith(String(year)))
    .forEach((h) => list.push(h));
  return list;
}

// No module-level cache here on purpose -- Eid windows are live,
// Management-editable config, so a cache keyed only by year would keep
// serving stale Eid dates after an edit until a full reload. Recomputing
// a dozen date-arithmetic entries per call is cheap enough that a cache
// buys nothing but a real staleness bug.
export function ghanaHolidayMapForYear(year: number, eidWindows: EidWindow[] = []): Map<string, GhanaHoliday> {
  const map = new Map<string, GhanaHoliday>();
  ghanaHolidaysForYear(year, eidWindows).forEach((h) => {
    if (!map.has(h.date)) map.set(h.date, h);
  });
  return map;
}

export function isWeekendIso(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00`).getDay();
  return dow === 0 || dow === 6;
}
