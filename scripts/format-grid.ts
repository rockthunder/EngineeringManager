import type { BenchmarkGrid, GridCell } from '../src/application/use-cases/benchmark-grid';
import { REGISTRY_BY_ID } from '../src/domain/metrics/registry';

const LETTER = { elite: 'E', high: 'H', medium: 'M', low: 'L' } as const;
const TREND = { improving: '↗', worsening: '↘', steady: '→', not_judged: '', unknown: '' } as const;

function fmt(v: number, unit: string): string {
  const n = (x: number, dp = 1) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(dp));
  switch (unit) {
    case 'hours': return v >= 48 ? `${n(v / 24)}d` : `${n(v)}h`;
    case 'days': return `${n(v)}d`;
    case 'per_week': return `${n(v)}/wk`;
    case 'lines': return `${Math.round(v)}ln`;
    case 'percent': return `${n(v)}%`;
    case 'per_100_changes': return `${n(v)}/100`;
    default: return n(v, 0);
  }
}

export function formatCell(c: GridCell): string {
  const def = REGISTRY_BY_ID[c.metricId];
  const arrow = c.trend ? TREND[c.trend.judgement] : '';
  if (c.grade.status === 'insufficient_data') return `n=${c.grade.sampleSize}/${c.grade.minSample} grey`;
  if (c.value === null) return '–';
  const value = fmt(c.value, def.unit);
  if (c.grade.status === 'not_graded') return `${value} ${arrow}`.trim();
  const d = c.grade.distance;
  return `${value} ${LETTER[c.grade.level]}${d > 0 ? '+' : ''}${d} ${arrow}`.trim();
}

const GROUPS: [string, number, number][] = [
  ['Speed and flow', 0, 11],
  ['Stability and quality', 11, 15],
  ['Investment and developer experience', 15, 18],
];

/** Markdown tables: teams × metrics, each cell "value LEVEL±distance trend". Rows are by name, never rank. */
export function formatGrid(grid: BenchmarkGrid): string {
  const lines: string[] = [];
  lines.push(
    `# Team benchmark grid: ${grid.endDay}, Bar v${grid.benchmarkVersion} (from ${grid.benchmarkEffectiveFrom})`,
    '',
    'Cell = value, level (E/H/M/L) and distance from the bar (+above, 0 at, −below), trend vs previous period (↗ improving, ↘ worsening, → steady).',
    `Windows: ${[...new Set(grid.metrics.map((m) => m.windowDays))].join(', ')} days.`,
    '',
  );
  for (const [title, from, to] of GROUPS) {
    const cols = grid.metrics.slice(from, to);
    lines.push(`## ${title}`, '');
    lines.push(`| Team | ${cols.map((m) => `${m.name} (${m.windowDays}d)`).join(' | ')} |`);
    lines.push(`| --- | ${cols.map(() => '---').join(' | ')} |`);
    for (const r of grid.rows) {
      lines.push(`| ${r.teamName}${r.profileId === 'platform' ? ' (platform)' : ''} | ${r.cells.slice(from, to).map(formatCell).join(' | ')} |`);
    }
    lines.push(`| **Org** | ${grid.org.cells.slice(from, to).map(formatCell).join(' | ')} |`, '');
  }
  return lines.join('\n');
}
