import { addDays, daysBetween, type Day } from '../../domain/time/day';
import { computeBenchmarkGrid, type BenchmarkGrid, type GridInput } from './benchmark-grid';

/** The last `n` month ends, oldest first; the final entry is `today` (the current, partial month). */
export function monthEnds(today: Day, n: number): Day[] {
  const out: Day[] = [today];
  let [y, m] = today.split('-').map(Number) as [number, number];
  while (out.length < n) {
    // last day of the previous month = day before the first of this month
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    out.unshift(addDays(first, -1));
    [y, m] = out[0]!.split('-').map(Number) as [number, number];
  }
  return out;
}

export interface MonthlyGrid {
  readonly endDay: Day;
  readonly grid: BenchmarkGrid;
}

/** How far back events must reach to compute the grid at the oldest month end with default windows. */
export const LONGEST_DEFAULT_WINDOW = 90;

export function monthlyRangeDays(today: Day, months: Day[]): number {
  return daysBetween(months[0]!, today) + LONGEST_DEFAULT_WINDOW + 1;
}

/**
 * The grid at each month end, each metric over its own default window. Raw events are loaded
 * once; nothing here is stored. `version`: grade each month against the bar in force then
 * (default) or today's.
 */
export function computeMonthly(
  input: GridInput,
  months: readonly Day[],
  version: 'in_force' | 'today' = 'in_force',
): MonthlyGrid[] {
  return months.map((endDay) => ({ endDay, grid: computeBenchmarkGrid(input, { endDay, compare: false, version }) }));
}
