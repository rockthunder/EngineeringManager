import { describe, expect, it } from 'vitest';
import { validateBenchmarkChange } from './validate';

describe('validateBenchmarkChange', () => {
  it('accepts a well-ordered threshold change and a bar change', () => {
    expect(
      validateBenchmarkChange({
        thresholds: { product: { lead_time: { elite: 12, high: 100, medium: 500 } } },
        bars: { org: { lead_time: 'elite' }, byProfile: { platform: { deployment_frequency: 'medium' } } },
      }),
    ).toEqual([]);
  });

  it('requires thresholds to improve in the direction of good', () => {
    const lower = validateBenchmarkChange({ thresholds: { product: { lead_time: { elite: 100, high: 50, medium: 500 } } } });
    expect(lower.join()).toMatch(/Lead time for changes.*Elite.*better than High/);
    const higher = validateBenchmarkChange({ thresholds: { product: { deployment_frequency: { elite: 1, high: 5, medium: 0.1 } } } });
    expect(higher.join()).toMatch(/Deployment frequency/);
  });

  it('rejects equal thresholds: each level must be strictly different', () => {
    expect(validateBenchmarkChange({ thresholds: { product: { pr_size: { elite: 100, high: 100, medium: 500 } } } })).toHaveLength(1);
  });

  it('rejects unknown metrics and ungraded ones (throughput has no bar)', () => {
    expect(validateBenchmarkChange({ bars: { org: { nonsense: 'high' } as never } }).join()).toMatch(/Unknown metric/);
    expect(validateBenchmarkChange({ bars: { org: { throughput: 'high' } } }).join()).toMatch(/not graded/);
  });

  it('rejects unknown levels and non-finite numbers', () => {
    expect(validateBenchmarkChange({ bars: { org: { lead_time: 'gold' as never } } }).join()).toMatch(/level/);
    expect(validateBenchmarkChange({ thresholds: { product: { lead_time: { elite: NaN, high: 1, medium: 2 } } } }).join()).toMatch(/number/);
  });
});
