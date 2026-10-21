import type { PoolClient } from 'pg';
import type { StreamBatch } from '../../../application/ports/sync-store';
import type { Deployment, Incident, PullRequest, SourceRef, Sprint, WorkItem } from '../../../domain/events/types';
import { ms } from './pool';

const CHUNK = 400;

/** One row per (source, source_id); where a batch repeats an id, the most recently updated wins. */
function latestPerKey<T extends SourceRef>(items: readonly T[]): T[] {
  const m = new Map<string, T>();
  for (const it of items) {
    const k = `${it.source}\u0000${it.sourceId}`;
    const prev = m.get(k);
    if (!prev || it.updatedAt >= prev.updatedAt) m.set(k, it);
  }
  return [...m.values()];
}

/**
 * INSERT … ON CONFLICT (source, source_id) DO UPDATE, but only when the incoming record is at
 * least as new as the stored one, so a stale re-send never overwrites newer data. Returns the
 * (source, source_id) of rows actually written.
 */
async function upsert<T extends SourceRef>(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  items: readonly T[],
  toRow: (item: T) => unknown[],
): Promise<{ source: string; source_id: string }[]> {
  const written: { source: string; source_id: string }[] = [];
  const rows = latestPerKey(items);
  const updates = columns
    .filter((c) => c !== 'source' && c !== 'source_id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map((item) => {
      const r = toRow(item);
      const base = params.length;
      params.push(...r);
      return `(${r.map((_, j) => `$${base + j + 1}`).join(', ')})`;
    });
    const res = await client.query<{ source: string; source_id: string }>(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}
       ON CONFLICT (source, source_id) DO UPDATE SET ${updates}
       WHERE EXCLUDED.source_updated_at >= ${table}.source_updated_at
       RETURNING source, source_id`,
      params,
    );
    written.push(...res.rows);
  }
  return written;
}

const upsertDeployments = (c: PoolClient, items: readonly Deployment[]) =>
  upsert(c, 'deployments',
    ['source', 'source_id', 'repo', 'environment', 'at', 'commit_shas', 'is_rework', 'is_rollback', 'source_updated_at'],
    items, (d) => [d.source, d.sourceId, d.repo, d.environment, ms(d.at), [...d.commitShas], d.isRework, d.isRollback, ms(d.updatedAt)]);

const upsertPullRequests = (c: PoolClient, items: readonly PullRequest[]) =>
  upsert(c, 'pull_requests',
    ['source', 'source_id', 'repo', 'first_commit_at', 'opened_at', 'first_review_at', 'merged_at', 'lines_changed', 'deployment_source_id', 'source_updated_at'],
    items, (p) => [p.source, p.sourceId, p.repo, ms(p.firstCommitAt), ms(p.openedAt), ms(p.firstReviewAt), ms(p.mergedAt), p.linesChanged, p.deploymentId, ms(p.updatedAt)]);

const upsertSprints = (c: PoolClient, items: readonly Sprint[]) =>
  upsert(c, 'sprints',
    ['source', 'source_id', 'board', 'start_at', 'end_at', 'committed_item_ids', 'completed_item_ids', 'source_updated_at'],
    items, (s) => [s.source, s.sourceId, s.board, ms(s.startAt), ms(s.endAt), [...s.committedItemIds], [...s.completedItemIds], ms(s.updatedAt)]);

const upsertIncidents = (c: PoolClient, items: readonly Incident[]) =>
  upsert(c, 'incidents',
    ['source', 'source_id', 'service', 'started_at', 'restored_at', 'deployment_source_id', 'source_updated_at'],
    items, (i) => [i.source, i.sourceId, i.service, ms(i.startedAt), ms(i.restoredAt), i.deploymentId, ms(i.updatedAt)]);

async function upsertWorkItems(client: PoolClient, items: readonly WorkItem[]): Promise<number> {
  const written = await upsert(client, 'work_items',
    ['source', 'source_id', 'key', 'type', 'labels', 'board', 'created_at', 'found_in_production', 'last_transition_at', 'final_status', 'source_updated_at'],
    items, (w) => {
      const last = w.transitions[w.transitions.length - 1];
      return [w.source, w.sourceId, w.key, w.type, [...w.labels], w.board, ms(w.createdAt), w.foundInProduction, ms(last?.at ?? null), last?.to ?? null, ms(w.updatedAt)];
    });
  if (written.length === 0) return 0;

  // Children belong to the version just written: replace them wholesale in the same transaction.
  const byKey = new Map(latestPerKey(items).map((w) => [`${w.source}\u0000${w.sourceId}`, w]));
  const bySource = new Map<string, string[]>();
  for (const r of written) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r.source_id]);
  for (const [source, ids] of bySource) {
    await client.query('DELETE FROM status_transitions WHERE source = $1 AND item_id = ANY($2)', [source, ids]);
    await client.query('DELETE FROM sprint_memberships WHERE source = $1 AND item_id = ANY($2)', [source, ids]);
  }
  const transitions: unknown[][] = [];
  const memberships: unknown[][] = [];
  for (const r of written) {
    const w = byKey.get(`${r.source}\u0000${r.source_id}`)!;
    w.transitions.forEach((t, seq) => transitions.push([w.source, w.sourceId, seq, t.from, t.to, ms(t.at)]));
    w.sprintMemberships.forEach((m) => memberships.push([w.source, w.sourceId, m.sprintId, ms(m.addedAt)]));
  }
  await insertChildren(client, 'status_transitions', ['source', 'item_id', 'seq', 'from_status', 'to_status', 'at'], transitions);
  await insertChildren(client, 'sprint_memberships', ['source', 'item_id', 'sprint_id', 'added_at'], memberships);
  return written.length;
}

async function insertChildren(client: PoolClient, table: string, columns: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += CHUNK * 2) {
    const chunk = rows.slice(i, i + CHUNK * 2);
    const params: unknown[] = [];
    const tuples = chunk.map((r) => {
      const base = params.length;
      params.push(...r);
      return `(${r.map((_, j) => `$${base + j + 1}`).join(', ')})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`, params);
  }
}

/** Apply one page of events; returns how many rows were written. */
export async function applyBatch(client: PoolClient, batch: StreamBatch): Promise<number> {
  switch (batch.stream) {
    case 'deployments': return (await upsertDeployments(client, batch.items)).length;
    case 'pull_requests': return (await upsertPullRequests(client, batch.items)).length;
    case 'work_items': return upsertWorkItems(client, batch.items);
    case 'sprints': return (await upsertSprints(client, batch.items)).length;
    case 'incidents': return (await upsertIncidents(client, batch.items)).length;
  }
}
