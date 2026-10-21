import { addDays, dayToInstant, instantToDay, type Day } from '../../../domain/time/day';

export function dayOfWeek(day: Day): number {
  return new Date(dayToInstant(day)).getUTCDay();
}

export function addMonths(day: Day, n: number): Day {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const first = Date.UTC(y, m - 1 + n, 1);
  const lastOfMonth = new Date(Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth() + 1, 0)).getUTCDate();
  const t = new Date(first);
  return instantToDay(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, lastOfMonth)));
}

export { addDays };
