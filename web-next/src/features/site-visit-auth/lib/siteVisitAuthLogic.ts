import { isoDateOnly, isoPlusDays } from '../../../shared/lib/format';
import type { WeeklyVisitForm } from '../../../types/domain';

// Ported from index.html's Mon-Fri week helpers (index.html:2896-2917) --
// the form covers a Monday-Friday work week even though real client site
// visits only ever happen Tue/Wed/Fri/Sun (SVE_ALLOWED_DAYS below).
export function mondayOfDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function currentWeekStartIso(): string {
  return isoDateOnly(mondayOfDate(new Date()));
}

export function weekFridayIso(weekStartIso: string): string {
  return isoPlusDays(weekStartIso, 4);
}

export function weekRangeLabel(weekStartIso: string): string {
  const s = new Date(`${weekStartIso}T00:00:00`);
  const e = new Date(s);
  e.setDate(e.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${fmt(s)} – ${fmt(e)}, ${e.getFullYear()}`;
}

// Real client site visits only ever happen Tue/Wed/Fri/Sun (confirmed by
// index.html's own SVE_ALLOWED_DAYS, shared by both Logistics' day picker
// and Site Visit Experience's) -- JS Date.getDay() values, 0=Sun.
const ALLOWED_DAYS = [2, 3, 5, 0];

export function allowedDayIsos(weekStartIso: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(isoPlusDays(weekStartIso, i));
  return out.filter((iso) => ALLOWED_DAYS.includes(new Date(`${iso}T00:00:00`).getDay()));
}

export function fmtLongDate(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface CostRow {
  estKey: keyof WeeklyVisitForm;
  actKey: keyof WeeklyVisitForm;
  estLabel: string;
  actLabel: string;
}

// Ported verbatim from index.html's SVA_COST_ROWS (index.html:15045-15051).
export const COST_ROWS: CostRow[] = [
  { estKey: 'vehicleRentalEst', actKey: 'vehicleRentalAct', estLabel: 'Vehicle Rentals', actLabel: 'Van Hiring' },
  { estKey: 'driversTipEst', actKey: 'driversTipAct', estLabel: "Driver's Tip", actLabel: "Driver's Tip" },
  { estKey: 'fuelEst', actKey: 'fuelAct', estLabel: 'Cost of fuel', actLabel: 'Cost of fuel' },
  { estKey: 'refreshmentEst', actKey: 'refreshmentAct', estLabel: 'Cost of refreshment', actLabel: 'Cost of refreshment' },
  { estKey: 'tntEst', actKey: 'tntAct', estLabel: 'TNT for staff', actLabel: 'TNT for staff' },
];

export function costTotal(form: WeeklyVisitForm, suffix: 'Est' | 'Act'): number {
  return COST_ROWS.reduce((n, r) => n + Number(form[suffix === 'Est' ? r.estKey : r.actKey] ?? 0), 0);
}

// Ported from index.html's svaAccompaniedText (index.html:15058-15063) -- a
// visit logged with a headcount but no name should still read that count,
// not a blank cell that looks like nobody checked.
export function accompaniedText(people: number | null, accompanied: string | null): string {
  const n = people ?? 0;
  const who = (accompanied ?? '').trim();
  if (!n && !who) return '-';
  if (n && who) return `${n} (${who})`;
  return n ? String(n) : who;
}
