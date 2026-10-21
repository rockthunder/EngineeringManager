import { completedAt, type SourceDefinitions } from '../events/definitions';
import type { EventSet } from '../events/types';
import { resolveTeam } from './mapping';
import type { Mapping, TeamId } from './types';

type Mutable = { -readonly [K in keyof EventSet]: EventSet[K][number][] };

/**
 * Split pooled events by team. An event belongs to the team its repo/board/service was
 * mapped to at the event's own time (deployment time; PR merge time else opened; work item
 * completion else creation; incident start; sprint end). Unmapped events are dropped.
 */
export function attributeEvents(
  all: EventSet,
  mappings: readonly Mapping[],
  defs: SourceDefinitions,
): Map<TeamId, EventSet> {
  const buckets = new Map<TeamId, Mutable>();
  const bucket = (team: TeamId): Mutable => {
    let b = buckets.get(team);
    if (!b) {
      b = { deployments: [], pullRequests: [], workItems: [], sprints: [], incidents: [], surveyResponses: [] };
      buckets.set(team, b);
    }
    return b;
  };

  for (const e of all.deployments) {
    const t = resolveTeam(mappings, 'repo', e.repo, e.at);
    if (t) bucket(t).deployments.push(e);
  }
  for (const e of all.pullRequests) {
    const t = resolveTeam(mappings, 'repo', e.repo, e.mergedAt ?? e.openedAt);
    if (t) bucket(t).pullRequests.push(e);
  }
  for (const e of all.workItems) {
    const t = resolveTeam(mappings, 'board', e.board, completedAt(e, defs) ?? e.createdAt);
    if (t) bucket(t).workItems.push(e);
  }
  for (const e of all.incidents) {
    const t = resolveTeam(mappings, 'service', e.service, e.startedAt);
    if (t) bucket(t).incidents.push(e);
  }
  for (const e of all.sprints) {
    const t = resolveTeam(mappings, 'board', e.board, e.endAt);
    if (t) bucket(t).sprints.push(e);
  }
  for (const e of all.surveyResponses) bucket(e.teamId).surveyResponses.push(e);

  return buckets as Map<TeamId, EventSet>;
}

