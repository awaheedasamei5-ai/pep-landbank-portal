// Fixed 2026-10-08: next/font/google's Turbopack loader was reliably failing
// in this dev environment ("Module not found: Can't resolve
// '@vercel/turbopack-next/internal/font/google/font'", reproduced across a
// full node_modules reinstall, so not a stale-install fluke) -- a hard
// blocker on booting the app at all, for a template-provided theme-preset
// font PICKER with no Palmstead-specific logic of its own. Rewritten to load
// the same 16 Google Fonts via a plain <link> tag (app/layout.tsx) instead of
// next/font's internal fetcher -- the exact same CDN-link pattern already
// used, proven reliable, for Palmstead's own real fonts (Bricolage Grotesque/
// Plus Jakarta Sans/IBM Plex Mono) a few lines below this file's old import.
// `font` is now just the CSS font-family stack string instead of a next/font
// object; `variable`/`fontVars` are gone (nothing outside this file and
// layout.tsx ever consumed them -- confirmed via a full grep before this
// rewrite) since each family's --font-* custom property is now declared
// directly in globals.css against the real family name, not a generated
// next/font identifier.
export const fontRegistry = {
  geist: { label: "Geist", font: "'Geist', sans-serif" },
  inter: { label: "Inter", font: "'Inter', sans-serif" },
  notoSans: { label: "Noto Sans", font: "'Noto Sans', sans-serif" },
  nunitoSans: { label: "Nunito Sans", font: "'Nunito Sans', sans-serif" },
  figtree: { label: "Figtree", font: "'Figtree', sans-serif" },
  roboto: { label: "Roboto", font: "'Roboto', sans-serif" },
  raleway: { label: "Raleway", font: "'Raleway', sans-serif" },
  dmSans: { label: "DM Sans", font: "'DM Sans', sans-serif" },
  publicSans: { label: "Public Sans", font: "'Public Sans', sans-serif" },
  outfit: { label: "Outfit", font: "'Outfit', sans-serif" },
  geistMono: { label: "Geist Mono", font: "'Geist Mono', monospace" },
  geistPixelSquare: { label: "Geist Pixel Square", font: "'Geist Mono', monospace" },
  jetBrainsMono: { label: "JetBrains Mono", font: "'JetBrains Mono', monospace" },
  notoSerif: { label: "Noto Serif", font: "'Noto Serif', serif" },
  robotoSlab: { label: "Roboto Slab", font: "'Roboto Slab', serif" },
  merriweather: { label: "Merriweather", font: "'Merriweather', serif" },
  lora: { label: "Lora", font: "'Lora', serif" },
  playfairDisplay: { label: "Playfair Display", font: "'Playfair Display', serif" },
} as const;

export type FontKey = keyof typeof fontRegistry;

export const fontKeys = Object.keys(fontRegistry) as FontKey[];

export const fontOptions = fontKeys.map((key) => ({
  key,
  label: fontRegistry[key].label,
}));
