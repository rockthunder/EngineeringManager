import { dayToInstant, MS_PER_HOUR } from '../../src/domain/time/day';
import { fixedClock } from '../../src/adapters/driven/system-clock/system-clock';

/** The dummy world ends on this day; tests pin the clock to it so numbers are reproducible. */
export const ANCHOR = '2026-10-21';
export const clock = fixedClock(dayToInstant(ANCHOR) + 12 * MS_PER_HOUR);
