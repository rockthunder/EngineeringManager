import type { Day } from '../../../domain/time/day';

/** [median, sigma] of a log-normal distribution. */
export type Dist = readonly [median: number, sigma: number];

export type Cadence =
  | { readonly kind: 'perMerge' }
  | { readonly kind: 'weekdays'; readonly dows: readonly number[]; readonly hourUtc: number }
  | { readonly kind: 'every'; readonly days: number; readonly hourUtc: number };

/** Everything that characterises how a team works. All behaviour in the dummy data comes from here. */
export interface Behaviour {
  readonly engineers: number;
  readonly prsPerEngineerWeek: number;
  readonly codingH: Dist;
  readonly pickupH: Dist;
  readonly reviewH: Dist;
  readonly sizeLines: Dist;
  readonly deployDelayH: Dist;
  readonly cadence: Cadence;
  readonly changeFailureRate: number;
  readonly rollbackShare: number;
  readonly reworkRate: number;
  readonly recoveryH: Dist;
  readonly backgroundIncidentsPerMonth: number;
  readonly itemsPerEngineerWeek: number;
  readonly cycleDays: Dist;
  readonly flowEfficiency: number;
  readonly mix: { readonly newCapability: number; readonly bug: number; readonly maintenance: number; readonly techDebt: number };
  /** Share of bugs that were found in production. */
  readonly bugFoundInProd: number;
  readonly unplannedShare: number;
  /** Chance a work item is sent back at least once (review or QA rejection). */
  readonly bounceRate: number;
  readonly survey: { readonly mean: number; readonly responseRate: number; readonly fixedResponses?: number };
  /** Multiplies durations (and, softened, PR size and failure rate). 1 = steady. */
  readonly drift?: (day: Day) => number;
  readonly driftsFailureRate?: boolean;
}

export interface RepoPlan {
  readonly name: string;
  readonly service: string;
  readonly prsPerWeek: number;
  readonly behaviourAt: (day: Day) => Behaviour;
  readonly backgroundIncidentsPerMonth: number;
}

export interface BoardPlan {
  readonly name: string;
  readonly prefix: string;
  readonly startDay: Day;
  readonly sprintOffsetDays: number;
  readonly behaviourAt: (day: Day) => Behaviour;
}

export interface OrgPlan {
  readonly repos: readonly RepoPlan[];
  readonly boards: readonly BoardPlan[];
}
