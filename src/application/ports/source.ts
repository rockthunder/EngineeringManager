import type { Day } from '../../domain/time/day';
import type { Deployment, Incident, PullRequest, Sprint, WorkItem } from '../../domain/events/types';

export type StreamName = 'deployments' | 'pull_requests' | 'work_items' | 'sprints' | 'incidents';

export const ALL_STREAMS: readonly StreamName[] = [
  'deployments',
  'pull_requests',
  'work_items',
  'sprints',
  'incidents',
];

/** Ask for items changed since `cursor`; with no cursor, backfill from `sinceDay`. */
export interface FetchRequest {
  readonly cursor: string | null;
  readonly sinceDay: Day;
  readonly pageSize: number;
}

/** `nextCursor` is opaque; on an empty page it equals the request cursor. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface DeliverySource {
  fetchDeployments(req: FetchRequest): Promise<Page<Deployment>>;
  fetchPullRequests(req: FetchRequest): Promise<Page<PullRequest>>;
}

export interface WorkSource {
  fetchWorkItems(req: FetchRequest): Promise<Page<WorkItem>>;
  fetchSprints(req: FetchRequest): Promise<Page<Sprint>>;
}

export interface IncidentSource {
  fetchIncidents(req: FetchRequest): Promise<Page<Incident>>;
}

/** One named source system exposing all three source ports (the fake source, later GitHub + Jira + JSM). */
export interface SourceSet {
  readonly name: string;
  readonly delivery: DeliverySource;
  readonly work: WorkSource;
  readonly incident: IncidentSource;
}
