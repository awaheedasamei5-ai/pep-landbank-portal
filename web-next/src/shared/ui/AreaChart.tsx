// Original component -- a smooth trend line with a soft gradient fill under
// it, the "hero chart" convention several reference dashboards used for a
// headline metric's history (a real curve, not a bar sparkline) studied
// during Phase 11 UI research. Pure SVG, catmull-rom-style smoothing via
// quadratic bezier midpoints, no chart library.
export function AreaChart({ values, labels, color = 'var(--c-accent)', width = 100, height = 64 }: { values: number[]; labels?: string[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const stepX = width / (values.length - 1);
  const padY = height * 0.12;

  const points = values.map((v, i) => ({
    x: i * stepX,
    y: padY + (height - padY * 2) * (1 - (v - min) / range),
  }));

  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const midX = (prev.x + p.x) / 2;
    return `${acc} Q ${midX} ${prev.y} ${midX} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
  }, '');

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L 0 ${height} Z`;
  const gradientId = `areaFill-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={3.2} fill={color} stroke="var(--c-card)" strokeWidth={1.5} />
      {labels &&
        labels.map((l, i) => (
          <text key={i} x={points[i].x} y={height + 10} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontSize={7} fill="var(--c-faint)" fontWeight={700}>
            {l}
          </text>
        ))}
    </svg>
  );
}
