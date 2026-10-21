import type { MetricDefinition } from '../metrics/types';

/** Relative movement within ±5 % counts as steady. */
export const STEADY_BAND = 0.05;

export interface Trend {
  /** Raw movement; null when it cannot be known. */
  readonly change: 'up' | 'down' | 'flat' | null;
  readonly judgement: 'improving' | 'worsening' | 'steady' | 'not_judged' | 'unknown';
  /** (current − previous) ÷ |previous|; ±Infinity if previous was 0, null if unknown. */
  readonly relativeChange: number | null;
}

interface Point {
  readonly value: number | null;
  readonly sampleSize: number;
}

/** Compare against the previous period of the same length, honouring the direction of good. */
export function trendOf(def: MetricDefinition, current: Point, previous: Point): Trend {
  const enough = (p: Point) => p.value !== null && p.sampleSize >= def.minSample.count;
  if (!enough(current) || !enough(previous)) return { change: null, judgement: 'unknown', relativeChange: null };

  const cur = current.value!;
  const prev = previous.value!;
  const rel = prev === 0 ? (cur === 0 ? 0 : cur > 0 ? Infinity : -Infinity) : (cur - prev) / Math.abs(prev);
  const change = Math.abs(rel) <= STEADY_BAND ? 'flat' : rel > 0 ? 'up' : 'down';

  if (def.direction === 'neutral') return { change, judgement: 'not_judged', relativeChange: rel };
  if (change === 'flat') return { change, judgement: 'steady', relativeChange: rel };
  const good = (change === 'up') === (def.direction === 'higher');
  return { change, judgement: good ? 'improving' : 'worsening', relativeChange: rel };
}
