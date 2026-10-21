import type { SourceDefinitions } from '../events/definitions';
import type { Deployment, EventSet, Sprint } from '../events/types';
import type { Window } from '../time/day';

export type MetricId =
  | 'deployment_frequency'
  | 'lead_time'
  | 'pr_cycle_time'
  | 'pr_pickup_time'
  | 'pr_size'
  | 'work_item_cycle_time'
  | 'flow_efficiency'
  | 'ageing_wip'
  | 'plan_predictability'
  | 'throughput'
  | 'change_failure_rate'
  | 'failed_deployment_recovery_time'
  | 'deployment_rework_rate'
  | 'escaped_defects'
  | 'new_capability_share'
  | 'unplanned_work'
  | 'devex_score';

export type MetricGroup = 'speed_flow' | 'stability_quality' | 'investment' | 'developer_experience';
export type Unit = 'per_week' | 'hours' | 'days' | 'lines' | 'percent' | 'per_100_changes' | 'score';
export type Direction = 'higher' | 'lower' | 'neutral';
/** How a value is compared to a threshold to earn a level. */
export type Comparator = 'gte' | 'lte' | 'lt';
export type AggregationRule = 'sum' | 'pooled_median' | 'pooled_ratio' | 'pooled_mean';

export interface Thresholds {
  readonly elite: number;
  readonly high: number;
  readonly medium: number;
}

/**
 * Sufficient statistics from which both a team value and a pooled org value can be derived.
 * Org figures combine these (concatenate samples, sum numerators and denominators), so they
 * are computed from all events together and never by averaging team results.
 */
export type Measurement = (
  | { readonly kind: 'samples'; readonly values: readonly number[] }
  | { readonly kind: 'ratio'; readonly num: number; readonly den: number; readonly scale: number }
  | { readonly kind: 'rate'; readonly count: number; readonly days: number; readonly teams: number }
  | { readonly kind: 'mean'; readonly sum: number; readonly count: number }
) & { readonly sampleSize: number };

/** Indexes over the full (all-team) event set, so cross-entity links survive reorg boundaries. */
export interface MetricContext {
  readonly window: Window;
  readonly definitions: SourceDefinitions;
  /** Days of the window the team had a mapping in force (for day-based minimum samples). */
  readonly coverageDays: number;
  readonly deploymentsById: ReadonlyMap<string, Deployment>;
  readonly sprintsById: ReadonlyMap<string, Sprint>;
  readonly deploymentsWithIncident: ReadonlySet<string>;
}

export interface Glossary {
  readonly definition: string;
  readonly formula: string;
  readonly source: string;
  readonly highMeans: string;
  readonly lowMeans: string;
  readonly aggregationExample: string;
  readonly watchOuts: string;
}

export interface MetricDefinition {
  readonly id: MetricId;
  readonly name: string;
  readonly group: MetricGroup;
  readonly graded: boolean;
  readonly unit: Unit;
  readonly unitLabel: string;
  readonly direction: Direction;
  readonly comparator: Comparator | null;
  readonly defaultThresholds: Thresholds | null;
  readonly aggregation: {
    readonly rule: AggregationRule;
    readonly text: string;
    /** Org value is graded as value ÷ number of teams (deployment frequency). */
    readonly gradedPerTeam?: boolean;
  };
  /** Below this, the cell is not graded. Noun 'days' means days of coverage, not events. */
  readonly minSample: { readonly count: number; readonly noun: string };
  readonly defaultWindowDays: number;
  readonly counterpart: MetricId | null;
  readonly glossary: Glossary;
  readonly measure: (events: EventSet, ctx: MetricContext) => Measurement;
}
