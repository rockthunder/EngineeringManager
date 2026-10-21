import { describe, expect, it } from 'vitest';
import { Rng, hash32, streamFor } from './prng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('stays in [0, 1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 10_000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('logNormal has the requested median', () => {
    const r = new Rng(7);
    const xs = Array.from({ length: 20_001 }, () => r.logNormal(10, 0.6)).sort((p, q) => p - q);
    expect(xs[10_000]!).toBeGreaterThan(9.5);
    expect(xs[10_000]!).toBeLessThan(10.5);
  });

  it('poisson has the requested mean', () => {
    const r = new Rng(9);
    const n = 20_000;
    const mean = Array.from({ length: n }, () => r.poisson(2.5)).reduce((a, b) => a + b, 0) / n;
    expect(mean).toBeGreaterThan(2.4);
    expect(mean).toBeLessThan(2.6);
  });

  it('poisson of zero is zero', () => {
    expect(new Rng(1).poisson(0)).toBe(0);
  });
});

describe('streamFor', () => {
  it('gives each named stream its own sequence, independent of call order', () => {
    const first = streamFor(1, 'aurora', 'pr', '2026-01-01', 0).next();
    streamFor(1, 'birch', 'pr', '2026-01-01', 0).next();
    expect(streamFor(1, 'aurora', 'pr', '2026-01-01', 0).next()).toBe(first);
    expect(streamFor(1, 'aurora', 'pr', '2026-01-01', 1).next()).not.toBe(first);
    expect(streamFor(2, 'aurora', 'pr', '2026-01-01', 0).next()).not.toBe(first);
  });

  it('hash32 is stable', () => {
    expect(hash32('abc')).toBe(hash32('abc'));
    expect(hash32('abc')).not.toBe(hash32('abd'));
  });
});
