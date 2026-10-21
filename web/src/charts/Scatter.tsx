const W = 520;
const H = 170;
const PAD = { l: 34, r: 8, t: 10, b: 22 };

/** Each dot is one finished work item: the day it finished and how many days it took. */
export function Scatter({ points }: { readonly points: readonly { day: string; days: number }[] }) {
  if (points.length === 0) return <p className="muted small">No work items finished in this window.</p>;
  const times = points.map((p) => Date.parse(`${p.day}T00:00:00Z`));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times, t0 + 86_400_000);
  const maxY = Math.max(...points.map((p) => p.days)) * 1.1;
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.5, 1].map((f) => f * maxY);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Cycle time scatter">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid-line" />
          <text x={PAD.l - 4} y={y(v) + 4} textAnchor="end" className="axis">{v.toFixed(0)}d</text>
        </g>
      ))}
      {points.map((p, i) => (
        <circle key={i} cx={x(Date.parse(`${p.day}T00:00:00Z`))} cy={y(p.days)} r={4} className="dot dot-plain">
          <title>{`Finished ${p.day}: ${p.days.toFixed(1)} days`}</title>
        </circle>
      ))}
      <text x={PAD.l} y={H - 6} className="axis">{points[0]!.day}</text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" className="axis">{points[points.length - 1]!.day}</text>
    </svg>
  );
}
