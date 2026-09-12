"use client";

// Exact port of the real app's svgDonut()/svgLineChart() primitives --
// same math (stroke-dasharray arc segments for the donut, a scaled
// path+area-fill for the line), rewritten as React components instead
// of returning an HTML string.
export function DonutRing({ pct, size = 84, stroke = 12 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={stroke} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke}
        strokeDasharray={`${dash.toFixed(1)} ${(circ - dash).toFixed(1)}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  );
}

export function LineChart({ values, labels, height = 140 }: { values: number[]; labels: string[]; height?: number }) {
  const w = 600;
  const pad = 30;
  const max = Math.max(1, ...values);
  const n = values.length;
  if (!n) return null;
  const stepX = n > 1 ? (w - 2 * pad) / (n - 1) : 0;
  const scaleY = (v: number) => height - pad - (v / max) * (height - 2 * pad);
  const pts = values.map((v, i): [number, number] => [pad + i * stepX, scaleY(v)]);
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${pts[n - 1][0].toFixed(1)},${height - pad} L${pts[0][0].toFixed(1)},${height - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height, display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="bannerLcGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.32} />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#bannerLcGrad)" />
      <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r={4} fill="#3B82F6" stroke="#fff" strokeWidth={1.5} />
      ))}
      {labels.map((l, i) => (
        <text key={i} x={pts[i][0].toFixed(1)} y={height - 8} fontSize={10.5} fill="rgba(255,255,255,.6)" textAnchor="middle">
          {l}
        </text>
      ))}
    </svg>
  );
}
