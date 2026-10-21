import type { Deployment, Incident, PullRequest, Sprint, WorkItem } from '../../domain/events/types';
import type { Instant } from '../../domain/time/day';
import type { StreamName } from './source';

export type StreamBatch =
  | { readonly stream: 'deployments'; readonly items: readonly Deployment[] }
  | { readonly stream: 'pull_requests'; readonly items: readonly PullRequest[] }
  | { readonly stream: 'work_items'; readonly items: readonly WorkItem[] }
  | { readonly stream: 'sprints'; readonly items: readonly Sprint[] }
  | { readonly stream: 'incidents'; readonly items: readonly Incident[] };

export interface SyncRun {
  readonly id: number;
  readonly source: string;
  readonly stream: StreamName;
  readonly startedAt: Instant;
  readonly finishedAt: Instant | null;
  readonly cursorBefore: string | null;
  readonly cursorAfter: string | null;
  readonly status: 'running' | 'succeeded' | 'failed';
  readonly error: string | null;
  readonly upserted: number;
}

/**
 * Sync bookkeeping. `commitPage` upserts events by (source, sourceId) and advances the run's
 * cursor in ONE transaction, so a failure never leaves a cursor ahead of the stored data.
 */
export interface SyncStore {
  /** Cursor after the latest successful or partially committed run, or null if never synced. */
  lastCursor(source: string, stream: StreamName): Promise<string | null>;
  startRun(source: string, stream: StreamName, startedAt: Instant, cursorBefore: string | null): Promise<number>;
  commitPage(runId: number, batch: StreamBatch, cursorAfter: string | null): Promise<number>;
  finishRun(runId: number, finishedAt: Instant, error: string | null): Promise<void>;
  listRuns(source?: string): Promise<readonly SyncRun[]>;
}
