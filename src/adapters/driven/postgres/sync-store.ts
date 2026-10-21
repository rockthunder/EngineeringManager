import type { StreamName } from '../../../application/ports/source';
import type { StreamBatch, SyncRun, SyncStore } from '../../../application/ports/sync-store';
import type { Instant } from '../../../domain/time/day';
import { instant, ms, type Pool } from './pool';
import { applyBatch } from './upserts';

interface RunRow {
  id: number; source: string; stream: StreamName; started_at: Date; finished_at: Date | null;
  cursor_before: string | null; cursor_after: string | null; status: SyncRun['status']; error: string | null; upserted: number;
}

export class PostgresSyncStore implements SyncStore {
  constructor(private readonly pool: Pool) {}

  async lastCursor(source: string, stream: StreamName): Promise<string | null> {
    const r = await this.pool.query<{ cursor_after: string }>(
      `SELECT cursor_after FROM sync_runs
       WHERE source = $1 AND stream = $2 AND cursor_after IS NOT NULL ORDER BY id DESC LIMIT 1`,
      [source, stream],
    );
    return r.rows[0]?.cursor_after ?? null;
  }

  async startRun(source: string, stream: StreamName, startedAt: Instant, cursorBefore: string | null): Promise<number> {
    const r = await this.pool.query<{ id: number }>(
      `INSERT INTO sync_runs (source, stream, started_at, cursor_before, status)
       VALUES ($1, $2, $3, $4, 'running') RETURNING id`,
      [source, stream, ms(startedAt), cursorBefore],
    );
    return r.rows[0]!.id;
  }

  /** Events and the cursor commit together or not at all. */
  async commitPage(runId: number, batch: StreamBatch, cursorAfter: string | null): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const written = await applyBatch(client, batch);
      await client.query(
        'UPDATE sync_runs SET cursor_after = COALESCE($2, cursor_after), upserted = upserted + $3 WHERE id = $1',
        [runId, cursorAfter, written],
      );
      await client.query('COMMIT');
      return written;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async finishRun(runId: number, finishedAt: Instant, error: string | null): Promise<void> {
    await this.pool.query(
      `UPDATE sync_runs SET finished_at = $2, status = $3, error = $4 WHERE id = $1`,
      [runId, ms(finishedAt), error === null ? 'succeeded' : 'failed', error],
    );
  }

  async listRuns(source?: string): Promise<readonly SyncRun[]> {
    const r = await this.pool.query<RunRow>(
      `SELECT * FROM sync_runs ${source ? 'WHERE source = $1' : ''} ORDER BY id`,
      source ? [source] : [],
    );
    return r.rows.map((x) => ({
      id: x.id, source: x.source, stream: x.stream, startedAt: instant(x.started_at)!, finishedAt: instant(x.finished_at),
      cursorBefore: x.cursor_before, cursorAfter: x.cursor_after, status: x.status, error: x.error, upserted: x.upserted,
    }));
  }
}
