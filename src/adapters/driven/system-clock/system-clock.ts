import type { Clock } from '../../../application/ports/clock';

export const systemClock: Clock = { now: () => Date.now() };

/** A clock stuck at one instant, for deterministic runs (tests, reproducible reports). */
export function fixedClock(at: number): Clock {
  return { now: () => at };
}
