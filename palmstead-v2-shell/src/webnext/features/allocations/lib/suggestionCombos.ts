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

// Real user ask: "when a plot is suggested for allocation, that plot
// shouldnt be allowed for another suggestion until the previous
// suggestions is saved and that plot is still remaining veccant
// therefore such plots should still be shown as available when
// suggesting but locked with a suggested tag on it." A plot only counts
// as locked once its request has actually been SAVED to "Awaiting
// Authorization" (suggested_plots populated server-side by
// apiSuggestAllocationPlots's real equivalent) -- an in-progress, still-
// unsaved combo draft on someone else's screen never locks anything.
// Returns every locked plot number (lowercased) mapped to the client
// it's currently suggested for, so callers can both exclude it from
// fresh candidate searches and show a "Suggested for <name>" tag.
export function lockedPlotNumbers(requests: { id: string; status: string; clientName: string; suggestedPlots: string | null }[], excludeRequestId?: string): Map<string, string> {
  const locked = new Map<string, string>();
  for (const r of requests) {
    if (r.status !== 'Awaiting Authorization' || r.id === excludeRequestId) continue;
    // unitsCount only changes how decodeSuggestionCombos GROUPS a legacy
    // (no ';') row's tokens into combos -- 3 single-plot combos vs 1
    // multi-plot combo -- never which tokens come out. Since this just
    // flattens every combo back into one set of plot numbers, the exact
    // value doesn't matter as long as it's > 1; 2 is as good as any.
    for (const combo of decodeSuggestionCombos(r.suggestedPlots, 2)) {
      for (const pn of combo) {
        const key = pn.trim().toLowerCase();
        if (key) locked.set(key, r.clientName);
      }
    }
  }
  return locked;
}
