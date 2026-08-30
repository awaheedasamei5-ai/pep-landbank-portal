// Direct ports of index.html's small formatting/date helpers -- same
// behavior, so any future side-by-side comparison against the production
// card matches exactly.

export function num(x: unknown): number {
  const n = typeof x === 'number' ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
}

export function ghs(x: unknown): string {
  return 'GHS ' + num(x).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function today(): string {
  return isoDateOnly(new Date());
}

export function isoDateOnly(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function isoPlusDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoDateOnly(d);
}

export function monthKey(iso: string | undefined): string {
  return (iso || '').slice(0, 7);
}

// Ported from index.html's monthLabel() (index.html:2870) -- 'YYYY-MM' -> 'Aug 2026'.
export function monthLabel(mk: string): string {
  if (!mk) return '—';
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function shiftMonth(mk: string, delta: number): string {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Ported from index.html's fmtLongDate() (index.html:23587) -- 'YYYY-MM-DD' -> '12 April 1990'.
export function fmtLongDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function daysSince(iso: string): number {
  const then = new Date(iso + 'T00:00:00').getTime();
  const now = new Date(today() + 'T00:00:00').getTime();
  return Math.round((now - then) / 86400000);
}
