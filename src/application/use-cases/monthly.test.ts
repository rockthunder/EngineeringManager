import { describe, expect, it } from 'vitest';
import { monthEnds } from './monthly';

describe('monthEnds', () => {
  it('lists the last N month ends ending today (the current month is partial)', () => {
    expect(monthEnds('2026-10-21', 4)).toEqual(['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-21']);
  });

  it('crosses year boundaries and handles leap years', () => {
    expect(monthEnds('2026-02-10', 3)).toEqual(['2025-12-31', '2026-01-31', '2026-02-10']);
    expect(monthEnds('2028-03-31', 2)).toEqual(['2028-02-29', '2028-03-31']);
  });

  it('twelve months back from today', () => {
    const m = monthEnds('2026-10-21', 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2025-11-30');
    expect(m[11]).toBe('2026-10-21');
  });
});
