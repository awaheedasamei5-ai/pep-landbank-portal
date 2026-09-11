// Real, reproduced bug (2026-09-06): jsPDF's standard Helvetica font uses
// WinAnsiEncoding, which has no glyph for several characters AI models
// (and phone keyboards) commonly produce -- em/en dashes, curly quotes,
// ellipsis, non-breaking spaces. Most of those get silently DROPPED by
// jsPDF (gluing the words on either side together, e.g. "half‑plot"
// becoming "halfplot"). One of them is far worse: U+2011 (the "non-
// breaking hyphen" some models use inside compound words) makes jsPDF
// fall back to encoding the ENTIRE string as UTF-16BE instead of Latin-1
// -- confirmed by generating a real PDF and inspecting its raw content
// stream, which showed a stray 0x00 byte before every character. Whatever
// renders that malformed byte sequence back out (Chrome's built-in PDF
// viewer included) shows it as a letter with a full space after every
// character -- exactly the "stretched"/spaced-out look reported live --
// and because splitTextToSize measured the ORIGINAL string's width before
// this corruption, the corrupted (much wider) run then overflows past
// where the wrap calculation put it, reading as text "cut off" the page.
// Root cause is the character, not the layout math -- every PDF builder
// that ever draws AI-generated or free-typed text needs this, so it's
// applied inside the shared drawing primitives themselves (sitePdfFields,
// pdfSimpleTable, etc.) rather than trusted to each call site to remember.
const PDF_UNSAFE_CHAR_MAP: [RegExp, string][] = [
  // Hyphen family: U+2010 hyphen, U+2011 non-breaking hyphen (the one
  // that actually corrupts jsPDF's encoding), U+2012 figure dash, U+2013
  // en dash -> plain ASCII hyphen.
  [/[‐‑‒–]/g, '-'],
  // Em dash (U+2014) -> spaced hyphen, closer to how it reads than
  // gluing the two words together.
  [/—/g, ' - '],
  // Curly/typographic single quotes and primes -> straight apostrophe.
  [/[‘’‚′]/g, "'"],
  // Curly/typographic double quotes and double primes -> straight quote.
  [/[“”„″]/g, '"'],
  // Ellipsis character (U+2026) -> three literal periods.
  [/…/g, '...'],
  // Non-breaking space and other Unicode space variants -> plain space.
  [/[  -   ]/g, ' '],
];

export function sanitizePdfText(value: string): string {
  let s = value;
  for (const [pattern, replacement] of PDF_UNSAFE_CHAR_MAP) s = s.replace(pattern, replacement);
  return s;
}
