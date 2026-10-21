import type { Measurement, MetricDefinition } from './types';

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function finalize(m: Measurement): number | null {
  switch (m.kind) {
    case 'samples':
      return median(m.values);
    case 'ratio':
      return m.den === 0 ? null : (m.num / m.den) * m.scale;
    case 'rate':
      return m.days === 0 ? null : m.count / (m.days / 7);
    case 'mean':
      return m.count === 0 ? null : m.sum / m.count;
  }
}

/** Org value used for grading: deployment frequency is judged per team, not as a raw sum. */
export function valueForGrading(
  aggregation: Pick<MetricDefinition['aggregation'], 'gradedPerTeam'>,
  m: Measurement,
): number | null {
  const v = finalize(m);
  if (v === null) return null;
  return aggregation.gradedPerTeam && m.kind === 'rate' && m.teams > 0 ? v / m.teams : v;
}

/**
 * Combine measurements of the same metric from several teams into one org measurement.
 * `sampleNoun` 'days' means sample sizes are coverage days (take the longest), otherwise counts (sum).
 */
export function pool(sampleNoun: string, ms: readonly Measurement[]): Measurement {
  const first = ms[0];
  if (!first) return { kind: 'samples', values: [], sampleSize: 0 };
  const sampleSize =
    sampleNoun === 'days' ? Math.max(...ms.map((m) => m.sampleSize)) : ms.reduce((a, m) => a + m.sampleSize, 0);

  switch (first.kind) {
    case 'samples':
      return { kind: 'samples', values: ms.flatMap((m) => (m.kind === 'samples' ? m.values : [])), sampleSize };
    case 'ratio': {
      const rs = ms.filter((m) => m.kind === 'ratio');
      return {
        kind: 'ratio',
        num: rs.reduce((a, m) => a + m.num, 0),
        den: rs.reduce((a, m) => a + m.den, 0),
        scale: first.scale,
        sampleSize,
      };
    }
    case 'rate': {
      const rs = ms.filter((m) => m.kind === 'rate');
      return {
        kind: 'rate',
        count: rs.reduce((a, m) => a + m.count, 0),
        days: Math.max(...rs.map((m) => m.days)),
        teams: rs.reduce((a, m) => a + m.teams, 0),
        sampleSize,
      };
    }
    case 'mean': {
      const rs = ms.filter((m) => m.kind === 'mean');
      return {
        kind: 'mean',
        sum: rs.reduce((a, m) => a + m.sum, 0),
        count: rs.reduce((a, m) => a + m.count, 0),
        sampleSize,
      };
    }
  }
}
