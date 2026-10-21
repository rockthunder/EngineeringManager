import type { Level } from '../../domain/benchmarks/levels';
import type { MetricDefinition, Thresholds, Unit } from '../../domain/metrics/types';

const num = (x: number, dp = 1) => {
  const s = x.toFixed(dp);
  return s.includes('.') ? s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1') : s;
};
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

/** A value with its unit, the way a person would read it. */
export function formatValue(unit: Unit, v: number): string {
  switch (unit) {
    case 'hours': return v >= 48 ? plural(v / 24, 'day', 'days') : `${num(v)} h`;
    case 'days': return plural(v, 'day', 'days');
    case 'per_week': return `${num(v)} per week`;
    case 'lines': return plural(Math.round(v), 'line', 'lines');
    case 'percent': return `${num(v)}%`;
    case 'per_100_changes': return `${num(v)} per 100 changes`;
    case 'score': return `${Math.round(v)}`;
  }
}

/** A threshold, formatted to read naturally: 24 hours is "1 day", 168 hours is "7 days". */
function formatThreshold(unit: Unit, v: number): string {
  if (unit === 'hours') return v >= 24 && v % 24 === 0 ? plural(v / 24, 'day', 'days') : `${num(v)} h`;
  return formatValue(unit, v);
}

export const levelName = (l: Level): string => l[0]!.toUpperCase() + l.slice(1);

/** What the bar means for this metric, e.g. "under 1 day" or "10% or less". */
export function barText(def: MetricDefinition, t: Thresholds, bar: Level): string {
  if (bar === 'low') return 'any value';
  const v = formatThreshold(def.unit, t[bar]);
  switch (def.comparator) {
    case 'lt': return `under ${v}`;
    case 'lte': return `${v} or less`;
    case 'gte': return `${v} or more`;
    default: return v;
  }
}
