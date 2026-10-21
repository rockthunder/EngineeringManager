import { daysBetween, type Day } from '../domain/time/day';

export type RangeKey = '7' | '14' | '30' | '90' | 'qtd' | 'metric' | 'custom';

export interface RangeInput {
  readonly range: RangeKey;
  readonly from?: Day;
  readonly to?: Day;
}

export interface ResolvedRange {
  readonly endDay: Day;
  /** Absent means "each metric's own default window". */
  readonly windowDays?: number;
}

export class RangeError extends Error {}

/** Turn the time-range picker's choice into a window ending on `endDay`. */
export function resolveRange(input: RangeInput, today: Day): ResolvedRange {
  switch (input.range) {
    case '7': case '14': case '30': case '90':
      return { endDay: today, windowDays: Number(input.range) };
    case 'metric':
      return { endDay: today };
    case 'qtd': {
      const [y, m] = today.split('-').map(Number) as [number, number];
      const qMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const start = `${y}-${String(qMonth).padStart(2, '0')}-01`;
      return { endDay: today, windowDays: daysBetween(start, today) + 1 };
    }
    case 'custom': {
      if (!input.from || !input.to) throw new RangeError('A custom range needs from and to');
      if (input.to < input.from) throw new RangeError('The range ends before it starts');
      return { endDay: input.to, windowDays: daysBetween(input.from, input.to) + 1 };
    }
    default:
      throw new RangeError(`Unknown range: ${String(input.range)}`);
  }
}

