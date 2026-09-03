import { isoDateOnly, isoPlusDays } from '../../../shared/lib/format';
import type { WeeklyVisitForm } from '../../../types/domain';

// Ported from index.html's Mon-Fri week helpers (index.html:2896-2917) --
// the form covers a Monday-Friday work week; ALLOWED_DAYS below governs
// which days within it (now all 7) are real bookable site-visit days.
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

// Fixed 2026-09-03 alongside ALLOWED_DAYS above: this used to be
// weekFridayIso (weekStart+4), matching legacy's own apiLoadSiteVisitsForWeek
// exactly -- both cut the week's site-visit query off at Friday even though
// Sunday was already a real bookable day under the OLD schedule, meaning a
// real Sunday visit's costs could never be reconciled in this form (a real,
// pre-existing bug in legacy too, not introduced here). Now that Saturday
// is also a real bookable day, the same bug would have hidden two real
// days' worth of visits instead of one -- extended to the full week
// (weekStart+6, Sunday) rather than left to get worse.
export function weekEndIso(weekStartIso: string): string {
  return isoPlusDays(weekStartIso, 6);
}

export function weekRangeLabel(weekStartIso: string): string {
  const s = new Date(`${weekStartIso}T00:00:00`);
  const e = new Date(s);
  // Fixed 2026-09-03 alongside ALLOWED_DAYS/weekEndIso above -- used to
  // stop at Friday (+4); now the full Monday-Sunday week the schedule
  // actually covers.
  e.setDate(e.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${fmt(s)} – ${fmt(e)}, ${e.getFullYear()}`;
}

// Fixed 2026-09-03 (master spec's "Site-visit day logic is outdated" --
// flagged critical): both this app and legacy's own SVE_ALLOWED_DAYS
// restricted bookable days to Tue/Wed/Fri/Sun, but the real, current
// business schedule is every day of the week -- Monday-Saturday 9:00am,
// Sunday 12:00pm. JS Date.getDay() values, 0=Sun -- all 7 kept here (not
// deleted) so a future schedule change is a one-line edit again, not a
// re-derivation. The per-day time distinction (9am vs Sunday's 12pm) isn't
// separately modeled or enforced anywhere in this app (no existing UI
// shows a specific visit time at all -- AddSiteVisitScreen's "Visit time"
// field is free text) -- out of scope for this fix, which corrects which
// days are bookable, not what time on those days.
const ALLOWED_DAYS = [0, 1, 2, 3, 4, 5, 6];

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
