import type { Instant } from '../../domain/time/day';

/** Time is injected, never read ambiently. */
export interface Clock {
  now(): Instant;
}
