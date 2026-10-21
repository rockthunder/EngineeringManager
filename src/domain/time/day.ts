/** A UTC calendar day, 'YYYY-MM-DD'. */
export type Day = string;

/** Epoch milliseconds, UTC. */
export type Instant = number;

/** A half-open interval [from, to). */
export interface Window {
  readonly from: Instant;
  readonly to: Instant;
}

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dayToInstant(day: Day): Instant {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day: ${day}`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (instantToDay(t) !== day) throw new Error(`Invalid day: ${day}`);
  return t;
}

export function instantToDay(t: Instant): Day {
  return new Date(t).toISOString().slice(0, 10);
}

export function startOfDay(t: Instant): Instant {
  return Math.floor(t / MS_PER_DAY) * MS_PER_DAY;
}

export function addDays(day: Day, n: number): Day {
  return instantToDay(dayToInstant(day) + n * MS_PER_DAY);
}

export function daysBetween(a: Day, b: Day): number {
  return Math.round((dayToInstant(b) - dayToInstant(a)) / MS_PER_DAY);
}

/** The n days ending at the end of `endDay` (inclusive). */
export function lastNDays(endDay: Day, n: number): Window {
  return { from: dayToInstant(addDays(endDay, -(n - 1))), to: dayToInstant(addDays(endDay, 1)) };
}

export function windowDays(w: Window): number {
  return Math.round((w.to - w.from) / MS_PER_DAY);
}

/** The period of the same length immediately before `w`. */
export function previousWindow(w: Window): Window {
  const len = w.to - w.from;
  return { from: w.from - len, to: w.from };
}

export function inWindow(t: Instant, w: Window): boolean {
  return t >= w.from && t < w.to;
}
