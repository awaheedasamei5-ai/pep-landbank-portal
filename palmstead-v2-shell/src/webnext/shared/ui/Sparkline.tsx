// Original component -- the mini bar-chart-in-a-KPI-card idea studied on
// Dribbble during Phase 11 research (CRM dashboards embedding a small trend
// chart directly inside a stat card, not as a separate section). Renders
// real data only: callers pass an actual monthly series (see
// ManagerOverview.collectedTrend), never a placeholder shape.
export function Sparkline({ values, width = 72, height = 26 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const barWidth = width / values.length;
  const gap = Math.min(3, barWidth * 0.25);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * height);
        const isLast = i === values.length - 1;
        return <rect key={i} x={i * barWidth + gap / 2} y={height - h} width={Math.max(1, barWidth - gap)} height={h} rx={1.5} fill="currentColor" opacity={isLast ? 1 : 0.45} />;
      })}
    </svg>
  );
}
