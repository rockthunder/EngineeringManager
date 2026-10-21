import type { Deployment, Incident, PullRequest, Sprint, WorkItem } from '../../../domain/events/types';
import { dayToInstant, MS_PER_DAY, type Day, type Instant } from '../../../domain/time/day';
import type { World } from './generator';

export interface Snapshot {
  readonly deployments: readonly Deployment[];
  readonly pullRequests: readonly PullRequest[];
  readonly workItems: readonly WorkItem[];
  readonly sprints: readonly Sprint[];
  readonly incidents: readonly Incident[];
}

const max = (xs: readonly number[]) => xs.reduce((a, b) => Math.max(a, b), -Infinity);

/**
 * The world as a source system would report it at the end of `day`: anything that happens
 * later is not visible yet, and `updatedAt` is the latest visible change. Bulk backfill and
 * a day-by-day replay therefore see the same entities, by construction.
 */
export function snapshotAt(world: World, day: Day): Snapshot {
  const cutoff: Instant = dayToInstant(day) + MS_PER_DAY; // exclusive
  const seen = (t: Instant) => t < cutoff;

  const deployments = world.deployments.filter((d) => seen(d.at));
  const deployAt = new Map(deployments.map((d) => [d.sourceId, d.at]));

  const pullRequests: PullRequest[] = [];
  for (const p of world.pullRequests) {
    if (!seen(p.openedAt)) continue;
    const firstReviewAt = p.firstReviewAt !== null && seen(p.firstReviewAt) ? p.firstReviewAt : null;
    const mergedAt = p.mergedAt !== null && seen(p.mergedAt) ? p.mergedAt : null;
    const shippedAt = p.deploymentId === null ? undefined : deployAt.get(p.deploymentId);
    pullRequests.push({
      ...p,
      firstReviewAt,
      mergedAt,
      deploymentId: shippedAt === undefined ? null : p.deploymentId,
      updatedAt: max([p.openedAt, firstReviewAt ?? -Infinity, mergedAt ?? -Infinity, shippedAt ?? -Infinity]),
    });
  }

  const workItems: WorkItem[] = [];
  for (const w of world.workItems) {
    if (!seen(w.createdAt)) continue;
    const transitions = w.transitions.filter((t) => seen(t.at));
    const sprintMemberships = w.sprintMemberships.filter((m) => seen(m.addedAt));
    workItems.push({
      ...w,
      transitions,
      sprintMemberships,
      updatedAt: max([w.createdAt, ...transitions.map((t) => t.at), ...sprintMemberships.map((m) => m.addedAt)]),
    });
  }

  const sprints: Sprint[] = [];
  for (const s of world.sprints) {
    if (!seen(s.startAt)) continue;
    const completions = s.completions.filter((c) => seen(c.doneAt));
    sprints.push({
      source: 'fake',
      sourceId: s.sourceId,
      board: s.board,
      startAt: s.startAt,
      endAt: s.endAt,
      committedItemIds: s.committed,
      completedItemIds: completions.map((c) => c.itemId),
      updatedAt: max([s.startAt, ...completions.map((c) => c.doneAt), seen(s.endAt) ? s.endAt : -Infinity]),
    });
  }

  const incidents: Incident[] = [];
  for (const i of world.incidents) {
    if (!seen(i.startedAt)) continue;
    const restoredAt = i.restoredAt !== null && seen(i.restoredAt) ? i.restoredAt : null;
    incidents.push({ ...i, restoredAt, updatedAt: max([i.startedAt, restoredAt ?? -Infinity]) });
  }

  return { deployments, pullRequests, workItems, sprints, incidents };
}
