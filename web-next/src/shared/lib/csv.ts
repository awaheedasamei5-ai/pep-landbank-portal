// Ported from index.html's exportCSV() (index.html:19581-19589) -- same
// escaping (quote a field only if it contains a comma/quote/newline,
// double up embedded quotes) and same column shape: [header, key-or-getter].
export type CsvColumn<T> = [header: string, accessor: keyof T | ((row: T) => unknown)];

function escapeCsvField(v: unknown): string {
  const s = v == null ? '' : String(v);
  const escaped = s.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function exportCSV<T>(rows: T[], cols: CsvColumn<T>[], filename: string): void {
  const header = cols.map((c) => c[0]).join(',');
  const body = rows.map((r) => cols.map((c) => escapeCsvField(typeof c[1] === 'function' ? c[1](r) : r[c[1]])).join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
