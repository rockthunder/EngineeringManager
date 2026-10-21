import { addDays, instantToDay } from '../../domain/time/day';
import type { Clock } from '../ports/clock';
import { ALL_STREAMS, type FetchRequest, type Page, type SourceSet, type StreamName } from '../ports/source';
import type { StreamBatch, SyncStore } from '../ports/sync-store';

export interface SyncDeps {
  readonly source: SourceSet;
  readonly syncStore: SyncStore;
  readonly clock: Clock;
  /** How far back the first sync reaches (default 365). */
  readonly backfillDays?: number;
  readonly pageSize?: number;
}

export interface SyncResult {
  readonly stream: StreamName;
  readonly runId: number;
  readonly mode: 'backfill' | 'incremental';
  readonly pages: number;
  readonly fetched: number;
  readonly upserted: number;
  readonly cursor: string | null;
}

async function fetchPage(s: SourceSet, stream: StreamName, req: FetchRequest): Promise<StreamBatch & { page: Page<unknown> }> {
  switch (stream) {
    case 'deployments': { const p = await s.delivery.fetchDeployments(req); return { stream, items: p.items, page: p }; }
    case 'pull_requests': { const p = await s.delivery.fetchPullRequests(req); return { stream, items: p.items, page: p }; }
    case 'work_items': { const p = await s.work.fetchWorkItems(req); return { stream, items: p.items, page: p }; }
    case 'sprints': { const p = await s.work.fetchSprints(req); return { stream, items: p.items, page: p }; }
    case 'incidents': { const p = await s.incident.fetchIncidents(req); return { stream, items: p.items, page: p }; }
  }
}

/**
 * Pull everything that changed since each stream's cursor and upsert it by source id. The first
 * run (no cursor) backfills; later runs are incremental. Each page is committed together with its
 * cursor, so a failed run resumes where it stopped and a repeated run is harmless.
 */
export async function syncSource(
  deps: SyncDeps,
  opts: { streams?: readonly StreamName[] } = {},
): Promise<SyncResult[]> {
  const { source, syncStore, clock } = deps;
  const pageSize = deps.pageSize ?? 500;
  const sinceDay = addDays(instantToDay(clock.now()), -(deps.backfillDays ?? 365));
  const results: SyncResult[] = [];

  for (const stream of opts.streams ?? ALL_STREAMS) {
    let cursor = await syncStore.lastCursor(source.name, stream);
    const mode = cursor === null ? 'backfill' : 'incremental';
    const runId = await syncStore.startRun(source.name, stream, clock.now(), cursor);
    let pages = 0;
    let fetched = 0;
    let upserted = 0;
    try {
      for (;;) {
        const { page, ...batch } = await fetchPage(source, stream, { cursor, sinceDay, pageSize });
        pages++;
        fetched += page.items.length;
        if (page.items.length > 0) upserted += await syncStore.commitPage(runId, batch as StreamBatch, page.nextCursor);
        cursor = page.nextCursor;
        if (!page.hasMore) break;
      }
      await syncStore.finishRun(runId, clock.now(), null);
    } catch (e) {
      await syncStore.finishRun(runId, clock.now(), e instanceof Error ? e.message : String(e));
      throw e;
    }
    results.push({ stream, runId, mode, pages, fetched, upserted, cursor });
  }
  return results;
}
