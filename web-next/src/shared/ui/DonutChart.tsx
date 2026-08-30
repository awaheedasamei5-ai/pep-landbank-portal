// Original component. Replaces MgrHomeScreen's stage-funnel bar list with
// a real donut + legend, the summary-chart convention every reference
// dashboard studied this session used for a category breakdown -- built
// from scratch (stroke-dasharray ring segments), no chart library.
export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ segments, size = 128, thickness = 16, centerValue, centerLabel }: { segments: DonutSegment[]; size?: number; thickness?: number; centerValue?: string; centerLabel?: string }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-line)" strokeWidth={thickness} opacity={total > 0 ? 0.4 : 1} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const frac = s.value / total;
              const dash = Math.max(frac * c - 1.5, 0);
              const offset = -((cumulative / total) * c);
              cumulative += s.value;
              return <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={offset} strokeLinecap="round" />;
            })}
      </g>
      {centerValue && (
        <text x="50%" y="47%" textAnchor="middle" fontSize={size * 0.18} fontWeight={800} fill="var(--c-text)" fontFamily="var(--font-mono)">
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text x="50%" y="63%" textAnchor="middle" fontSize={size * 0.075} fontWeight={700} fill="var(--c-muted)" letterSpacing="0.04em">
          {centerLabel.toUpperCase()}
        </text>
      )}
    </svg>
  );
}
