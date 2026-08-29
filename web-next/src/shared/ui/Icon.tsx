// Typed port of index.html's `ic` registry (index.html:8388-8401) -- SVG
// markup copied verbatim (element-for-element, not flattened into a single
// path string, since several of these mix <rect>/<path>), keyed by a name
// union so callers get compile-time checking instead of the old runtime
// `ic[name] || ''` silent-failure fallback. Only the 5 bottom-nav icons are
// ported for Phase 1; widen this as later phases need more (fic()'s ~40+
// colored tile glyphs are a separate, larger registry -- not needed yet).

export type IconName = 'home' | 'briefcase2' | 'desk' | 'chat' | 'more';

function IconInner({ name }: { name: IconName }) {
  switch (name) {
    case 'home':
      return <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-8z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />;
    case 'briefcase2':
      return (
        <>
          <rect x={3} y={8} width={18} height={12} rx={2} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth={1.8} fill="none" />
        </>
      );
    case 'desk':
      return (
        <>
          <rect x={3} y={12.5} width={18} height={3} rx={1} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M5 15.5v4M19 15.5v4M8 12.5V8a1 1 0 011-1h6a1 1 0 011 1v4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case 'chat':
      return <path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-4 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />;
    case 'more':
      return (
        <g fill="currentColor">
          <circle cx={5} cy={12} r={2} />
          <circle cx={12} cy={12} r={2} />
          <circle cx={19} cy={12} r={2} />
        </g>
      );
  }
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <IconInner name={name} />
    </svg>
  );
}
