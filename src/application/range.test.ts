import { describe, expect, it } from 'vitest';
import { resolveRange } from './range';

describe('resolveRange', () => {
  const today = '2026-10-21';

  it('last N days ends today', () => {
    expect(resolveRange({ range: '30' }, today)).toEqual({ endDay: today, windowDays: 30 });
    expect(resolveRange({ range: '7' }, today)).toEqual({ endDay: today, windowDays: 7 });
  });

  it('quarter to date starts on the first day of the calendar quarter', () => {
    expect(resolveRange({ range: 'qtd' }, today)).toEqual({ endDay: today, windowDays: 21 }); // 1 Oct → 21 Oct
    expect(resolveRange({ range: 'qtd' }, '2026-01-01')).toEqual({ endDay: '2026-01-01', windowDays: 1 });
    expect(resolveRange({ range: 'qtd' }, '2026-05-15')?.windowDays).toBe(45); // 1 Apr → 15 May
  });

  it('custom uses the given days inclusively and rejects bad input', () => {
    expect(resolveRange({ range: 'custom', from: '2026-09-01', to: '2026-09-30' }, today)).toEqual({
      endDay: '2026-09-30', windowDays: 30,
    });
    expect(() => resolveRange({ range: 'custom', from: '2026-09-30', to: '2026-09-01' }, today)).toThrow();
    expect(() => resolveRange({ range: 'custom' }, today)).toThrow();
  });

  it('"metric" means each metric uses its own default window', () => {
    expect(resolveRange({ range: 'metric' }, today)).toEqual({ endDay: today });
  });

  it('refuses unknown ranges', () => {
    expect(() => resolveRange({ range: '45' as never }, today)).toThrow();
  });
});
