import { describe, expect, it } from 'vitest';
import { dayToInstant, lastNDays } from '../time/day';
import { coverageDays, findMappingOverlaps, resolveTeam } from './mapping';
import type { Mapping } from './types';

const harbour = 'harbour';
const juniper = 'juniper';
const reorg = '2026-06-23';

const mappings: Mapping[] = [
  { teamId: harbour, kind: 'repo', ref: 'billing', effectiveFrom: '2025-10-01', effectiveTo: reorg },
  { teamId: juniper, kind: 'repo', ref: 'billing', effectiveFrom: reorg, effectiveTo: null },
  { teamId: harbour, kind: 'repo', ref: 'core', effectiveFrom: '2025-10-01', effectiveTo: null },
];

describe('resolveTeam (effective-dated)', () => {
  it('resolves to the old team before the effective date', () => {
    expect(resolveTeam(mappings, 'repo', 'billing', dayToInstant('2026-06-22') + 3_600_000)).toBe(harbour);
  });

  it('resolves to the new team from the effective date (from is inclusive, to is exclusive)', () => {
    expect(resolveTeam(mappings, 'repo', 'billing', dayToInstant(reorg))).toBe(juniper);
    expect(resolveTeam(mappings, 'repo', 'billing', dayToInstant(reorg) - 1)).toBe(harbour);
  });

  it('returns null before any mapping existed and for unmapped refs', () => {
    expect(resolveTeam(mappings, 'repo', 'billing', dayToInstant('2025-09-30'))).toBeNull();
    expect(resolveTeam(mappings, 'repo', 'unknown', dayToInstant('2026-01-01'))).toBeNull();
  });

  it('keeps kinds separate', () => {
    expect(resolveTeam(mappings, 'board', 'billing', dayToInstant('2026-01-01'))).toBeNull();
  });
});

describe('findMappingOverlaps', () => {
  it('accepts a clean hand-over', () => {
    expect(findMappingOverlaps(mappings)).toEqual([]);
  });

  it('flags overlapping ranges for the same ref', () => {
    const bad: Mapping[] = [
      ...mappings,
      { teamId: 'comet', kind: 'repo', ref: 'core', effectiveFrom: '2026-01-01', effectiveTo: null },
    ];
    expect(findMappingOverlaps(bad)).toHaveLength(1);
  });
});

describe('coverageDays', () => {
  it('counts window days covered by a team’s mappings', () => {
    const window = lastNDays('2026-10-21', 30);
    expect(coverageDays(mappings, juniper, window)).toBe(30);
    expect(coverageDays(mappings, 'nobody', window)).toBe(0);
  });

  it('counts only the part of the window after the mapping starts', () => {
    const window = lastNDays('2026-06-30', 30); // 2026-06-01 .. 2026-06-30
    expect(coverageDays(mappings, juniper, window)).toBe(8); // 06-23 .. 06-30
  });
});
