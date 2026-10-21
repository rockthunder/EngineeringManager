import type { SeriesPoint } from '@contract';

interface Props {
  readonly points: readonly SeriesPoint[];
  readonly bar?: { readonly value: number; readonly text: string; readonly level: string } | null;
  readonly format?: (v: number) => string;
  readonly height?: number;
}

const W = 520;
const PAD = { l: 8, r: 8, t: 12, b: 22 };

/** A 12-month trend with the bar as a dashed line. Colours come from the server (the cell colour each month). */
export function LineChart({ points, bar, height = 150 }: Props) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length === 0) return <p className="muted small">Not enough data in any month to draw a trend.</p>;
  const all = bar ? [...values, bar.value] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const lo = Math.max(0, min - span * 0.1);
  const hi = max + span * 0.1;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (height - PAD.t - PAD.b);

  const segments: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segments.push(cur);
      cur = '';
    } else cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (cur) segments.push(cur);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label="Twelve month trend">
      {bar && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(bar.value)} y2={y(bar.value)} className="bar-line" />
          <text x={W - PAD.r} y={y(bar.value) - 4} textAnchor="end" className="bar-label">
            bar: {bar.text} ({bar.level})
          </text>
        </g>
      )}
      {segments.map((d, i) => <path key={i} d={d} className="series" />)}
      {points.map((p, i) =>
        p.value === null ? null : (
          <circle key={p.endDay} cx={x(i)} cy={y(p.value)} r={4} className={`dot c-${p.colour}`}>
            <title>{`${p.label}: ${p.text}`}</title>
          </circle>
        ),
      )}
      {points.map((p, i) =>
        i % 2 === 1 || i === points.length - 1 ? (
          <text key={`l${p.endDay}`} x={x(i)} y={height - 6} textAnchor="middle" className="axis">{p.label.slice(0, 3)}</text>
        ) : null,
      )}
    </svg>
  );
}
