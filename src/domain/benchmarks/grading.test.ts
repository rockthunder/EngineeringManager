import { describe, expect, it } from 'vitest';
import { REGISTRY, REGISTRY_BY_ID } from '../metrics/registry';
import { defaultBenchmarkVersion } from './defaults';
import { gradeMetric } from './grading';
import { levelOf } from './levels';

const v1 = defaultBenchmarkVersion('2025-10-21');
const grade = (id: keyof typeof REGISTRY_BY_ID, value: number | null, n = 100, profile: 'product' | 'platform' = 'product') =>
  gradeMetric(REGISTRY_BY_ID[id], value, n, v1, profile);

describe('levelOf boundaries follow each metric’s comparator', () => {
  const df = REGISTRY_BY_ID.deployment_frequency; // ≥ 7 / 1 / 0.25
  const lt = REGISTRY_BY_ID.lead_time; // < 24 / 168 / 720 h
  const cfr = REGISTRY_BY_ID.change_failure_rate; // ≤ 5 / 10 / 15 %

  it('≥ is inclusive', () => {
    const lv = (x: number) => levelOf(x, df.comparator!, df.defaultThresholds!);
    expect([lv(7), lv(6.99), lv(1), lv(0.99), lv(0.25), lv(0.24)]).toEqual(['elite', 'high', 'high', 'medium', 'medium', 'low']);
  });
  it('< is exclusive', () => {
    const lv = (x: number) => levelOf(x, lt.comparator!, lt.defaultThresholds!);
    expect([lv(23.99), lv(24), lv(167), lv(168), lv(719), lv(720)]).toEqual(['elite', 'high', 'high', 'medium', 'medium', 'low']);
  });
  it('≤ is inclusive', () => {
    const lv = (x: number) => levelOf(x, cfr.comparator!, cfr.defaultThresholds!);
    expect([lv(5), lv(5.01), lv(10), lv(10.01), lv(15), lv(15.01)]).toEqual(['elite', 'high', 'high', 'medium', 'medium', 'low']);
  });
});

describe('distance from bar (bar = High)', () => {
  it.each([
    ['elite', 100, 1, 'above'],
    ['high', 3, 0, 'at'],
    ['medium', 0.5, -1, 'near'],
    ['low', 0.1, -2, 'below'],
  ] as const)('%s → distance %i', (level, value, distance, band) => {
    const g = grade('deployment_frequency', level === 'elite' ? 8 : value, 100);
    expect(g).toMatchObject({ status: 'graded', level, bar: 'high', distance, band });
  });

  it('works for lower-is-better metrics (direction of good)', () => {
    expect(grade('lead_time', 10)).toMatchObject({ level: 'elite', band: 'above' });
    expect(grade('lead_time', 1000)).toMatchObject({ level: 'low', band: 'below', distance: -2 });
  });
});

describe('insufficient data', () => {
  it('returns the count, not a grade, below the minimum sample', () => {
    expect(grade('lead_time', 5, 9)).toEqual({ status: 'insufficient_data', sampleSize: 9, minSample: 10 });
    expect(grade('lead_time', 5, 10)).toMatchObject({ status: 'graded' });
  });
  it('applies to day-based coverage and to missing values', () => {
    expect(grade('deployment_frequency', 3, 13)).toMatchObject({ status: 'insufficient_data', minSample: 14 });
    expect(grade('lead_time', null, 50)).toMatchObject({ status: 'insufficient_data' });
  });
  it('never grades from the value when the sample is small, even for a perfect value', () => {
    expect(grade('change_failure_rate', 0, 3).status).toBe('insufficient_data');
  });
});

describe('throughput', () => {
  it('is not graded', () => {
    expect(grade('throughput', 12)).toEqual({ status: 'not_graded' });
  });
});

describe('profiles', () => {
  it('platform overrides deployment frequency thresholds and inherits the rest from product', () => {
    expect(grade('deployment_frequency', 0.6, 100, 'product')).toMatchObject({ level: 'medium' });
    expect(grade('deployment_frequency', 0.6, 100, 'platform')).toMatchObject({ level: 'high' });
    expect(grade('lead_time', 100, 100, 'platform')).toEqual(grade('lead_time', 100, 100, 'product'));
  });
});

describe('default benchmark', () => {
  it('sets the bar to High for every graded metric and covers all of them', () => {
    for (const m of REGISTRY.filter((x) => x.graded)) {
      expect(v1.bars.org[m.id], m.id).toBe('high');
      expect(v1.thresholds.product?.[m.id], m.id).toEqual(m.defaultThresholds);
    }
  });
});
