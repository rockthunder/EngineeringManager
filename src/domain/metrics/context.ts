import type { SourceDefinitions } from '../events/definitions';
import type { EventSet } from '../events/types';
import type { Window } from '../time/day';
import type { MetricContext } from './types';

/** Lookup indexes over the full (all-team) event set; build once, reuse for every metric and window. */
export type EventIndex = Pick<MetricContext, 'deploymentsById' | 'sprintsById' | 'deploymentsWithIncident'>;

export function buildIndex(all: EventSet): EventIndex {
  return {
    deploymentsById: new Map(all.deployments.map((x) => [x.sourceId, x])),
    sprintsById: new Map(all.sprints.map((x) => [x.sourceId, x])),
    deploymentsWithIncident: new Set(
      all.incidents.flatMap((i) => (i.deploymentId === null ? [] : [i.deploymentId])),
    ),
  };
}

export function contextFor(
  index: EventIndex,
  definitions: SourceDefinitions,
  window: Window,
  coverageDays: number,
): MetricContext {
  return { ...index, window, definitions, coverageDays };
}

export function buildContext(
  all: EventSet,
  definitions: SourceDefinitions,
  window: Window,
  coverageDays: number,
): MetricContext {
  return contextFor(buildIndex(all), definitions, window, coverageDays);
}
