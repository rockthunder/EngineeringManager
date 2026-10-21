import { describe, expect, it } from 'vitest';
import { REGISTRY_BY_ID } from '../metrics/registry';
import { defaultBenchmarkVersion } from './defaults';
import { gradeMetric } from './grading';
import { deriveBenchmarkVersion, versionInForce } from './version';

const v1 = defaultBenchmarkVersion('2025-10-21');
const v2 = deriveBenchmarkVersion(v1, { bars: { org: { lead_time: 'elite' } } }, '2026-07-21');

describe('benchmark versions', () => {
  it('deriving creates the next version and leaves the old one untouched', () => {
    expect(v2.number).toBe(2);
    expect(v2.effectiveFrom).toBe('2026-07-21');
    expect(v2.bars.org.lead_time).toBe('elite');
    expect(v2.bars.org.deployment_frequency).toBe('high');
    expect(v1.bars.org.lead_time).toBe('high');
  });

  it('versions are immutable', () => {
    expect(Object.isFrozen(v2)).toBe(true);
    expect(() => {
      (v2.bars.org as Record<string, string>)['lead_time'] = 'low';
    }).toThrow();
  });

  it('threshold changes merge per metric and profile', () => {
    const v = deriveBenchmarkVersion(v1, { thresholds: { platform: { lead_time: { elite: 48, high: 200, medium: 800 } } } }, '2026-08-01');
    expect(v.thresholds.platform?.lead_time?.elite).toBe(48);
    expect(v.thresholds.platform?.deployment_frequency).toBeDefined();
  });

  it('must take effect after the version it replaces', () => {
    expect(() => deriveBenchmarkVersion(v1, {}, '2025-10-21')).toThrow();
  });

  it('versionInForce picks the latest version effective on or before the day', () => {
    const history = [v1, v2];
    expect(versionInForce(history, '2026-07-20')?.number).toBe(1);
    expect(versionInForce(history, '2026-07-21')?.number).toBe(2);
    expect(versionInForce(history, '2025-01-01')).toBeNull();
  });

  it('raising the lead-time bar turns a green cell amber without changing the data', () => {
    const lt = REGISTRY_BY_ID.lead_time;
    const underV1 = gradeMetric(lt, 100, 50, v1, 'product'); // High (< 168 h)
    const underV2 = gradeMetric(lt, 100, 50, v2, 'product');
    expect(underV1).toMatchObject({ level: 'high', band: 'at', distance: 0 });
    expect(underV2).toMatchObject({ level: 'high', bar: 'elite', band: 'near', distance: -1 });
  });

  it('a bar can be set per profile', () => {
    const v = deriveBenchmarkVersion(v1, { bars: { byProfile: { platform: { deployment_frequency: 'medium' } } } }, '2026-08-01');
    const df = REGISTRY_BY_ID.deployment_frequency;
    expect(gradeMetric(df, 0.3, 50, v, 'platform')).toMatchObject({ bar: 'medium' });
    expect(gradeMetric(df, 0.3, 50, v, 'product')).toMatchObject({ bar: 'high' });
  });
});
