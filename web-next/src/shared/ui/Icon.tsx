// Typed port of index.html's `ic` registry (index.html:8388-8401) -- SVG
// markup copied verbatim (element-for-element, not flattened into a single
// path string, since several of these mix <rect>/<path>), keyed by a name
// union so callers get compile-time checking instead of the old runtime
// `ic[name] || ''` silent-failure fallback. The 5 bottom-nav icons were the
// Phase 1 cut; the 16 below are new for Phase 11, replacing the raw emoji
// glyphs TileGrid was using as a stand-in (see that file's own comment) --
// every path here is drawn from scratch as plain geometry (rects/circles/
// paths), not copied from any icon library, kept to the same stroke-based
// visual language as the original 5 (strokeWidth 1.8, round caps/joins,
// no fill) so the whole set reads as one system.

export type IconName =
  | 'home'
  | 'briefcase2'
  | 'desk'
  | 'chat'
  | 'more'
  | 'chartLine'
  | 'folder'
  | 'map'
  | 'ruler'
  | 'pin'
  | 'question'
  | 'gift'
  | 'warning'
  | 'building'
  | 'checklist'
  | 'note'
  | 'check'
  | 'card'
  | 'document'
  | 'calculator'
  | 'palm'
  | 'notepad'
  | 'trophy'
  | 'wallet'
  | 'settings'
  | 'barChart'
  | 'chevronDown'
  | 'search';

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
    case 'chartLine':
      return (
        <>
          <path d="M4 19V5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <path d="M4 19h16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <path d="M6.5 15l4-4.5 3 2.5L19 6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M14.5 6H19v4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case 'folder':
      return <path d="M3 7a1 1 0 011-1h5l2 2h9a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />;
    case 'map':
      return (
        <>
          <path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </>
      );
    case 'ruler':
      return (
        <>
          <rect x={3} y={9} width={18} height={7} rx={1.5} transform="rotate(-8 12 12.5)" stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M8 10.3l.7 1.6M12 9.7l.7 1.9M16 9.1l.7 2.1" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" fill="none" />
        </>
      );
    case 'pin':
      return (
        <>
          <path d="M12 21s7-6.4 7-11.5A7 7 0 105 9.5C5 14.6 12 21 12 21z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <circle cx={12} cy={9.5} r={2.4} stroke="currentColor" strokeWidth={1.8} fill="none" />
        </>
      );
    case 'question':
      return (
        <>
          <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M9.6 9.4a2.5 2.5 0 114.15 1.88c-.7.62-1.75 1.05-1.75 2.22" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <circle cx={12} cy={17} r={0.9} fill="currentColor" />
        </>
      );
    case 'gift':
      return (
        <>
          <rect x={4} y={10} width={16} height={10} rx={1.2} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M3 7h18v3.5H3z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M12 7v13" stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M12 7C10.5 3.5 6 3.5 6 6c0 1.4 2.5 1 6 1zM12 7c1.5-3.5 6-3.5 6-1 0 1.4-2.5 1-6 1z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
        </>
      );
    case 'warning':
      return (
        <>
          <path d="M12 4.5L21 19H3L12 4.5z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M12 10.2v3.6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <circle cx={12} cy={16.4} r={0.9} fill="currentColor" />
        </>
      );
    case 'building':
      return (
        <>
          <rect x={5} y={3.5} width={11} height={17} rx={1} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M16 10h3v10.5h-3M8 8h2M11.5 8h2M8 11.5h2M11.5 11.5h2M8 15h2M11.5 15h2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" fill="none" />
        </>
      );
    case 'checklist':
      return (
        <>
          <rect x={3.5} y={4} width={17} height={16} rx={2} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M7 9l1.4 1.4L10.5 8M7 14.5l1.4 1.4 2.1-2.4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M13.5 9h4M13.5 14.5h4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </>
      );
    case 'note':
      return (
        <>
          <path d="M5 3.5h9.5L19 8v12.5H5z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M14.5 3.5V8H19" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M8 12.5h8M8 16h8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" fill="none" />
        </>
      );
    case 'check':
      return (
        <>
          <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M8 12.3l2.6 2.6L16.2 9" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case 'card':
      return (
        <>
          <rect x={3} y={5.5} width={18} height={13} rx={2} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M3 9.5h18" stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M6.5 14.3h4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </>
      );
    case 'document':
      return (
        <>
          <path d="M6 3.5h8L20 9.5v11H6z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M14 3.5v6h6" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M9 13.5h7M9 17h7" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" fill="none" />
        </>
      );
    case 'calculator':
      return (
        <>
          <rect x={5} y={3} width={14} height={18} rx={2} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M7.5 6.5h9v3.5h-9z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" fill="none" />
          <g fill="currentColor">
            <circle cx={8} cy={14} r={0.9} />
            <circle cx={12} cy={14} r={0.9} />
            <circle cx={16} cy={14} r={0.9} />
            <circle cx={8} cy={17.5} r={0.9} />
            <circle cx={12} cy={17.5} r={0.9} />
            <circle cx={16} cy={17.5} r={0.9} />
          </g>
        </>
      );
    case 'palm':
      return (
        <>
          <path d="M12 21V12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <path d="M12 12c0-3.5-2-6-5.5-6.5C7 9 9 11.5 12 12zM12 12c0-3.5 2-6 5.5-6.5C17 9 15 11.5 12 12zM12 10.5c-.3-3-2.4-4.7-5-5.2C7.5 8.2 9.4 10 12 10.5zM12 10.5c.3-3 2.4-4.7 5-5.2C16.5 8.2 14.6 10 12 10.5z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" fill="none" />
        </>
      );
    case 'notepad':
      return (
        <>
          <rect x={4.5} y={5} width={15} height={16} rx={1.5} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M8.5 3.5v3M12 3.5v3M15.5 3.5v3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <path d="M8 12h8M8 15.5h8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" fill="none" />
        </>
      );
    case 'trophy':
      return (
        <>
          <path d="M7 4h10v5a5 5 0 01-10 0V4z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M7 5H4v2a3 3 0 003 3M17 5h3v2a3 3 0 01-3 3" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M12 14v3M9 20.5h6M9.5 20.5c0-2 .8-3 2.5-3.5 1.7.5 2.5 1.5 2.5 3.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case 'wallet':
      return (
        <>
          <path d="M3.5 7.5a2 2 0 012-2h11a2 2 0 012 2v9a2 2 0 01-2 2h-11a2 2 0 01-2-2v-9z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M15 6.2L7.5 3 4 6.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x={14} y={11} width={6} height={4} rx={1} stroke="currentColor" strokeWidth={1.6} fill="none" />
          <circle cx={16.5} cy={13} r={0.7} fill="currentColor" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx={12} cy={12} r={3} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path
            d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9L6.3 6.3"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
    case 'barChart':
      return (
        <>
          <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <rect x={6.5} y={13} width={3} height={6} rx={0.8} fill="currentColor" />
          <rect x={11} y={9} width={3} height={10} rx={0.8} fill="currentColor" />
          <rect x={15.5} y={6} width={3} height={13} rx={0.8} fill="currentColor" />
        </>
      );
    case 'chevronDown':
      return <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
    case 'search':
      return (
        <>
          <circle cx={11} cy={11} r={6.5} stroke="currentColor" strokeWidth={1.8} fill="none" />
          <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </>
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
