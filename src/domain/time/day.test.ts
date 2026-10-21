import { describe, expect, it } from 'vitest';
import { addDays, dayToInstant, daysBetween, instantToDay, lastNDays, previousWindow, windowDays } from './day';

describe('day helpers (UTC)', () => {
  it('round-trips day ↔ instant', () => {
    expect(instantToDay(dayToInstant('2026-10-21'))).toBe('2026-10-21');
    expect(dayToInstant('1970-01-02')).toBe(86_400_000);
  });

  it('adds days across month and leap boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('counts days between', () => {
    expect(daysBetween('2026-10-01', '2026-10-21')).toBe(20);
  });

  it('rejects malformed days', () => {
    expect(() => dayToInstant('2026-1-1')).toThrow();
    expect(() => dayToInstant('2026-02-30')).toThrow();
  });

  it('builds a last-N-days window ending at the end of the given day', () => {
    const w = lastNDays('2026-10-21', 30);
    expect(windowDays(w)).toBe(30);
    expect(instantToDay(w.from)).toBe('2026-09-22');
    expect(w.to).toBe(dayToInstant('2026-10-22'));
  });

  it('previous window has the same length and ends where the window starts', () => {
    const w = lastNDays('2026-10-21', 30);
    const p = previousWindow(w);
    expect(p.to).toBe(w.from);
    expect(windowDays(p)).toBe(30);
  });
});
