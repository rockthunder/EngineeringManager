import { describe, expect, it } from 'vitest';
import { finalize, median, pool, valueForGrading } from './aggregation';
import type { Measurement } from './types';

const samples = (values: number[]): Measurement => ({ kind: 'samples', values, sampleSize: values.length });
const ratio = (num: number, den: number, sampleSize = den): Measurement => ({ kind: 'ratio', num, den, scale: 100, sampleSize });

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('org aggregation pools events, never averages team results', () => {
  it('pooled median differs from the mean of team medians', () => {
    const teamA = samples([1, 1, 1]); // median 1
    const teamB = samples(Array(9).fill(10)); // median 10
    const meanOfMedians = (finalize(teamA)! + finalize(teamB)!) / 2;
    const pooled = finalize(pool('count', [teamA, teamB]))!;
    expect(meanOfMedians).toBe(5.5);
    expect(pooled).toBe(10);
    expect(pooled).not.toBe(meanOfMedians);
  });

  it('pooled rate is total numerator over total denominator, not the mean of rates', () => {
    const small = ratio(1, 2); // 50 %
    const big = ratio(10, 100); // 10 %
    const pooled = finalize(pool('count', [small, big]))!;
    expect(pooled).toBeCloseTo((11 / 102) * 100, 6);
    expect(pooled).not.toBeCloseTo(30, 1);
  });

  it('pools flow efficiency as total active time over total cycle time', () => {
    const a = ratio(48, 72, 1);
    const b = ratio(24, 24, 1);
    expect(finalize(pool('count', [a, b]))).toBeCloseTo(75, 6);
  });

  it('sums counts for rates and takes the longest coverage for day-based samples', () => {
    const a: Measurement = { kind: 'rate', count: 6, days: 30, teams: 1, sampleSize: 20 };
    const b: Measurement = { kind: 'rate', count: 3, days: 30, teams: 1, sampleSize: 30 };
    const p = pool('days', [a, b]);
    expect(p).toMatchObject({ kind: 'rate', count: 9, teams: 2, sampleSize: 30 });
    expect(finalize(p)).toBeCloseTo(9 / (30 / 7), 6);
  });

  it('pools means by total sum over total count', () => {
    const a: Measurement = { kind: 'mean', sum: 150, count: 2, sampleSize: 2 };
    const b: Measurement = { kind: 'mean', sum: 60, count: 1, sampleSize: 1 };
    expect(finalize(pool('count', [a, b]))).toBe(70);
  });

  it('sums sample sizes for count-based metrics', () => {
    expect(pool('count', [samples([1, 2]), samples([3])]).sampleSize).toBe(3);
  });
});

describe('finalize on empty input', () => {
  it('returns null rather than NaN', () => {
    expect(finalize(samples([]))).toBeNull();
    expect(finalize(ratio(0, 0))).toBeNull();
    expect(finalize({ kind: 'mean', sum: 0, count: 0, sampleSize: 0 })).toBeNull();
  });
});

describe('valueForGrading', () => {
  it('grades an org deploy-frequency sum per team', () => {
    const org: Measurement = { kind: 'rate', count: 60, days: 30, teams: 10, sampleSize: 30 };
    expect(finalize(org)).toBeCloseTo(14, 6);
    expect(valueForGrading({ gradedPerTeam: true }, org)).toBeCloseTo(1.4, 6);
    expect(valueForGrading({}, org)).toBeCloseTo(14, 6);
  });
});
