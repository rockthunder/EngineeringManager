import type { SourceDefinitions } from '../events/definitions';
import type { EventSet } from '../events/types';
import type { Window } from '../time/day';
import type { MetricContext } from './types';

/** Build lookup indexes from the full event set (all teams), plus the per-team coverage. */
export function buildContext(
  all: EventSet,
  definitions: SourceDefinitions,
  window: Window,
  coverageDays: number,
): MetricContext {
  return {
    window,
    definitions,
    coverageDays,
    deploymentsById: new Map(all.deployments.map((x) => [x.sourceId, x])),
    sprintsById: new Map(all.sprints.map((x) => [x.sourceId, x])),
    deploymentsWithIncident: new Set(
      all.incidents.flatMap((i) => (i.deploymentId === null ? [] : [i.deploymentId])),
    ),
  };
}
