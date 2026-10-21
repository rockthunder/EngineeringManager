import type { Day } from '../time/day';
import type { MetricId, Thresholds } from '../metrics/types';
import type { ProfileId } from '../teams/types';
import type { Level } from './levels';

type PerMetric<T> = Partial<Record<MetricId, T>>;
type PerProfile<T> = Partial<Record<ProfileId, T>>;

/** An immutable, effective-dated set of thresholds and bars. A change creates a new version. */
export interface BenchmarkVersion {
  readonly number: number;
  readonly effectiveFrom: Day;
  readonly thresholds: PerProfile<PerMetric<Thresholds>>;
  readonly bars: {
    readonly org: PerMetric<Level>;
    readonly byProfile?: PerProfile<PerMetric<Level>>;
  };
}

export interface BenchmarkChange {
  readonly thresholds?: PerProfile<PerMetric<Thresholds>>;
  readonly bars?: { readonly org?: PerMetric<Level>; readonly byProfile?: PerProfile<PerMetric<Level>> };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

function mergeProfiles<T>(base: PerProfile<PerMetric<T>> | undefined, change: PerProfile<PerMetric<T>> | undefined) {
  const out: PerProfile<PerMetric<T>> = {};
  for (const p of new Set([...Object.keys(base ?? {}), ...Object.keys(change ?? {})]) as Set<ProfileId>) {
    out[p] = { ...base?.[p], ...change?.[p] };
  }
  return out;
}

export function deriveBenchmarkVersion(
  prev: BenchmarkVersion,
  change: BenchmarkChange,
  effectiveFrom: Day,
): BenchmarkVersion {
  if (effectiveFrom <= prev.effectiveFrom) {
    throw new Error(`New version must take effect after ${prev.effectiveFrom} (version ${prev.number})`);
  }
  const byProfile = mergeProfiles(prev.bars.byProfile, change.bars?.byProfile);
  return deepFreeze({
    number: prev.number + 1,
    effectiveFrom,
    thresholds: mergeProfiles(prev.thresholds, change.thresholds),
    bars: {
      org: { ...prev.bars.org, ...change.bars?.org },
      ...(Object.keys(byProfile).length > 0 ? { byProfile } : {}),
    },
  });
}

/** The version in force on `day`, or null before the first version. `history` need not be sorted. */
export function versionInForce(history: readonly BenchmarkVersion[], day: Day): BenchmarkVersion | null {
  let best: BenchmarkVersion | null = null;
  for (const v of history) {
    if (v.effectiveFrom <= day && (best === null || v.number > best.number)) best = v;
  }
  return best;
}

export function thresholdsFor(v: BenchmarkVersion, profile: ProfileId, metric: MetricId): Thresholds | null {
  return v.thresholds[profile]?.[metric] ?? v.thresholds.product?.[metric] ?? null;
}

export function barFor(v: BenchmarkVersion, profile: ProfileId, metric: MetricId): Level {
  return v.bars.byProfile?.[profile]?.[metric] ?? v.bars.org[metric] ?? 'high';
}
