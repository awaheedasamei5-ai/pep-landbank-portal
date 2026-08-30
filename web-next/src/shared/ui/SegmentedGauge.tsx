import styles from './SegmentedGauge.module.css';

// Original component, built from a pattern studied live on Dribbble during
// Phase 11 UI research (an HR/attendance dashboard using a colorful
// segmented semicircle gauge for a monthly day-count, "28" centered under
// the arc) -- not a copy of that shot's assets, a from-scratch SVG built to
// the same idea using this app's own tokens. One arc segment per unit of
// `max`, filled left-to-right through `value`, so the gauge itself IS the
// tally, not just a decorated number.
const PALETTE = ['#2563A8', '#146C43', '#3F9C6C', '#C9A227', '#E7CE7A'];

function polarPoint(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function segmentPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarPoint(cx, cy, r, startDeg);
  const end = polarPoint(cx, cy, r, endDeg);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 0 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function SegmentedGauge({ value, max, label, sublabel }: { value: number; max: number; label: string; sublabel?: string }) {
  const total = Math.max(max, 1);
  const filled = Math.min(Math.max(value, 0), total);
  const gapDeg = total > 1 ? 3 : 0;
  const span = 180 / total;
  const cx = 60;
  const cy = 58;
  const r = 48;

  const segments = Array.from({ length: total }, (_, i) => {
    const start = 180 - i * span + gapDeg / 2;
    const end = 180 - (i + 1) * span - gapDeg / 2;
    return { start, end, filled: i < filled, color: PALETTE[i % PALETTE.length] };
  });

  return (
    <div className={styles.wrap}>
      <svg viewBox="0 0 120 66" className={styles.svg}>
        {segments.map((s, i) => (
          <path key={i} d={segmentPath(cx, cy, r, s.start, s.end)} stroke={s.filled ? s.color : 'var(--c-line)'} strokeWidth={9} strokeLinecap="round" fill="none" opacity={s.filled ? 1 : 0.55} />
        ))}
      </svg>
      <div className={styles.center}>
        <div className={styles.value}>{value}</div>
        <div className={styles.label}>{label}</div>
        {sublabel && <div className={styles.sublabel}>{sublabel}</div>}
      </div>
    </div>
  );
}
