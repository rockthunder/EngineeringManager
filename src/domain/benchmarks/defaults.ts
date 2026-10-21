import type { Day } from '../time/day';
import { REGISTRY } from '../metrics/registry';
import type { MetricId, Thresholds } from '../metrics/types';
import type { Level } from './levels';
import type { BenchmarkVersion } from './version';

/** Platform teams deploy their own code less often: only deployment frequency differs by default. */
const PLATFORM_OVERRIDES: Partial<Record<MetricId, Thresholds>> = {
  deployment_frequency: { elite: 2, high: 0.5, medium: 0.1 },
};

/** Version 1: the registry's thresholds, Product and Platform profiles, bar = High everywhere. */
export function defaultBenchmarkVersion(effectiveFrom: Day): BenchmarkVersion {
  const product: Partial<Record<MetricId, Thresholds>> = {};
  const org: Partial<Record<MetricId, Level>> = {};
  for (const m of REGISTRY) {
    if (!m.graded || !m.defaultThresholds) continue;
    product[m.id] = m.defaultThresholds;
    org[m.id] = 'high';
  }
  return Object.freeze({
    number: 1,
    effectiveFrom,
    thresholds: Object.freeze({ product: Object.freeze(product), platform: Object.freeze({ ...PLATFORM_OVERRIDES }) }),
    bars: Object.freeze({ org: Object.freeze(org) }),
  });
}
