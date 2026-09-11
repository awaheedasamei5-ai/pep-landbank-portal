"use client";

// Real user request: every allocation suggestion (single-unit OR
// multi-unit) now needs 3 full alternative combos before Management can
// sign off, not just 3 loose single-plot options. A "combo" is one
// complete set of plot numbers, one per real unit the lead needs (length
// 1 for a plain Full/Half Plot lead, length 2+ for a multi-unit one like
// 1.5 plots). suggested_plots stores up to 3 combos separated by ';',
// each combo's own plot numbers comma-joined -- e.g. a 1.5-plot lead's
// suggested_plots might read "K19,K20;K21,K22;M5,M7" (3 alternative
// Full+Half pairs).
//
// Backward compatible with every real row already in production before
// this feature existed: those have no ';' at all. A pre-existing
// single-unit request stored 3 comma-separated single plots as 3
// alternatives already (unchanged meaning under the new model -- each
// becomes its own 1-plot combo). A pre-existing multi-unit request
// stored exactly ONE combo (comma-joined, no alternatives) -- decodes as
// a single available combo rather than crashing or silently dropping it.
export function encodeSuggestionCombos(combos: string[][]): string {
  return combos
    .map((combo) => combo.map((s) => s.trim()).join(','))
    .join(';');
}

export function decodeSuggestionCombos(raw: string | null | undefined, unitsCount: number): string[][] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.includes(';')) {
    return trimmed
      .split(';')
      .map((combo) => combo.split(',').map((s) => s.trim()).filter(Boolean))
      .filter((combo) => combo.length > 0);
  }
  const flat = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  if (flat.length === 0) return [];
  if (unitsCount <= 1) return flat.map((pn) => [pn]);
  return [flat];
}

export function emptyCombos(slotsPerCombo: number): string[][] {
  return Array.from({ length: 3 }, () => Array.from({ length: slotsPerCombo }, () => ''));
}

export function combosAreComplete(combos: string[][], slotsPerCombo: number): boolean {
  return combos.length === 3 && combos.every((combo) => combo.length === slotsPerCombo && combo.every((pn) => pn.trim().length > 0));
}
