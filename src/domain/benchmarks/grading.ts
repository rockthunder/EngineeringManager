import type { MetricDefinition } from '../metrics/types';
import type { ProfileId } from '../teams/types';
import { bandOf, distanceFromBar, levelOf, type Band, type Level } from './levels';
import { barFor, thresholdsFor, type BenchmarkVersion } from './version';

export type Grade =
  | {
      readonly status: 'graded';
      readonly level: Level;
      readonly bar: Level;
      /** Levels above (+) or below (−) the bar. */
      readonly distance: number;
      readonly band: Band;
    }
  | { readonly status: 'insufficient_data'; readonly sampleSize: number; readonly minSample: number }
  | { readonly status: 'not_graded' };

/** Small samples are never graded: below the minimum we return the count, not a level. */
export function gradeMetric(
  def: MetricDefinition,
  value: number | null,
  sampleSize: number,
  version: BenchmarkVersion,
  profile: ProfileId,
): Grade {
  if (!def.graded || def.comparator === null) return { status: 'not_graded' };
  const thresholds = thresholdsFor(version, profile, def.id);
  if (thresholds === null) return { status: 'not_graded' };
  if (value === null || sampleSize < def.minSample.count) {
    return { status: 'insufficient_data', sampleSize, minSample: def.minSample.count };
  }
  const level = levelOf(value, def.comparator, thresholds);
  const bar = barFor(version, profile, def.id);
  const distance = distanceFromBar(level, bar);
  return { status: 'graded', level, bar, distance, band: bandOf(distance) };
}
