import type { SeriesPoint } from '@contract';

interface Props {
  readonly points: readonly SeriesPoint[];
  readonly bar?: { readonly value: number; readonly text: string } | null;
}

/** A 12-month trend with the bar drawn across it: direction and distance at a glance. */
export function Sparkline({ points, bar }: Props) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) return <div className="spark-empty muted small">Trend needs more data</div>;
  const W = 220;
  const H = 54;
  const all = bar ? [...values, bar.value] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => 4 + (i * (W - 8)) / (points.length - 1);
  const y = (v: number) => 5 + (1 - (v - lo) / span) * (H - 10);
  let d = '';
  points.forEach((p, i) => {
    if (p.value !== null) d += `${d && points[i - 1]?.value !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  const last = [...points].reverse().find((p) => p.value !== null)!;
  const lastIdx = points.lastIndexOf(last);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" role="img" aria-label="Twelve month trend against the bar">
      {bar && <line x1={4} x2={W - 4} y1={y(bar.value)} y2={y(bar.value)} className="bar-line"><title>bar: {bar.text}</title></line>}
      <path d={d} className="series" />
      <circle cx={x(lastIdx)} cy={y(last.value!)} r={4} className={`dot c-${last.colour}`}><title>{`${last.label}: ${last.text}`}</title></circle>
    </svg>
  );
}

/** Teams by band as unnamed dots, so the spread is visible without naming anyone. */
export function BandDots({ bands }: { bands: { above: number; at: number; near: number; below: number; insufficient: number } }) {
  const dots: [string, number, string][] = [['blue', bands.above, 'above'], ['green', bands.at, 'at'], ['amber', bands.near, 'near'], ['red', bands.below, 'below'], ['grey', bands.insufficient, 'not enough data']];
  const label = dots.filter(([, n]) => n > 0).map(([, n, l]) => `${n} ${l}`).join(', ');
  return (
    <span className="dots" role="img" aria-label={`Teams: ${label}`} title={`Teams: ${label}`}>
      {dots.flatMap(([c, n]) => Array.from({ length: n }, (_, i) => <i key={`${c}${i}`} className={`dot-i c-${c}`} />))}
    </span>
  );
}
