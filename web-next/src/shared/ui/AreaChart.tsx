// Original component -- rebuilt after the first version rendered visibly
// wrong: a narrow 100x64 viewBox with preserveAspectRatio="none" stretched
// into a ~350-450px-wide card meant the SVG scaled ~5x horizontally but
// only ~1.1x vertically, which distorted the curve's shape AND stretched
// the in-SVG <text> labels into an unreadable smear. Two real fixes here,
// not cosmetic ones: (1) the viewBox width is now close to the actual
// rendered aspect ratio so distortion is negligible either way, and (2)
// month labels are plain HTML below the chart, in real CSS pixels, so they
// can never be scaled by SVG viewBox math again regardless of container
// width. The curve itself is a proper Catmull-Rom-to-cubic-Bezier spline
// (the standard technique for a smooth line through data points) instead
// of the rougher quadratic chaining the first version used.
function catmullRomPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaChart({ values, labels, color = 'var(--c-accent)', height = 96 }: { values: number[]; labels?: string[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const width = Math.max(240, values.length * 56);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const padY = 10;
  const padX = 6;
  const plotW = width - padX * 2;
  const stepX = plotW / (values.length - 1);

  const points = values.map((v, i) => ({
    x: padX + i * stepX,
    y: padY + (height - padY * 2) * (1 - (v - min) / range),
  }));

  const linePath = catmullRomPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  const gradientId = `areaFill-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  const gridLines = [0.25, 0.5, 0.75];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.38} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {gridLines.map((g) => (
          <line key={g} x1={0} x2={width} y1={height * g} y2={height * g} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
        ))}
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={color} stroke="var(--c-ink)" strokeWidth={2} />
      </svg>
      {labels && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 2px' }}>
          {labels.map((l, i) => (
            <span key={i} style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.6, letterSpacing: '.02em' }}>
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
