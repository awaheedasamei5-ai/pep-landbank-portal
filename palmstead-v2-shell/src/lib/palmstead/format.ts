// Direct ports of web-next's src/shared/lib/format.ts -- same behavior,
// so real figures shown here always match what the rest of Palmstead
// computes from the same tables.

export function num(x: unknown): number {
  const n = typeof x === "number" ? x : Number.parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
}

export function ghs(x: unknown): string {
  return `GHS ${num(x).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function today(): string {
  return isoDateOnly(new Date());
}

export function isoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthKey(iso: string | undefined): string {
  return (iso ?? "").slice(0, 7);
}

export function shiftMonth(mk: string, delta: number): string {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
