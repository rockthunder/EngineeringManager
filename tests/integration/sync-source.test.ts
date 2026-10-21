import { afterEach, describe, expect, inject, it } from 'vitest';
import { FakeSource } from '../../src/adapters/driven/fake-source/fake-source';
import { DEFAULT_SEED } from '../../src/adapters/driven/fake-source/seed';
import { postgresStores } from '../../src/adapters/driven/postgres';
import { ALL_STREAMS, type SourceSet } from '../../src/application/ports/source';
import { syncSource } from '../../src/application/use-cases/sync-source';
import { ANCHOR, clock } from '../support/constants';
import { cloneDatabase, type TestDb } from '../support/postgres';

const dbs: TestDb[] = [];
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((d) => d.drop()));
});

async function freshStores() {
  const db = await cloneDatabase(inject('pgAdminUrl'), 'migrated');
  dbs.push(db);
  return { db, stores: postgresStores(db.pool) };
}

const newSource = () => new FakeSource({ seed: DEFAULT_SEED, anchorDay: ANCHOR });

const TABLES = ['deployments', 'pull_requests', 'work_items', 'sprints', 'incidents', 'status_transitions', 'sprint_memberships'] as const;

async function counts(db: TestDb) {
  const out = {} as Record<(typeof TABLES)[number], number>;
  for (const t of TABLES) out[t] = (await db.pool.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  return out;
}

/** Content fingerprint of every event table, independent of insertion order. */
async function fingerprint(db: TestDb) {
  const out: string[] = [];
  for (const t of TABLES) {
    const r = await db.pool.query(`SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM ${t} x`);
    out.push(`${t}:${r.rows[0].h}`);
  }
  return out;
}

async function fakeCounts(src: FakeSource) {
  const drain = async (f: (r: never) => Promise<{ items: readonly unknown[]; nextCursor: string | null; hasMore: boolean }>) => {
    let cursor: string | null = null;
    let n = 0;
    for (;;) {
      const p = await f({ cursor, sinceDay: src.scenario.historyStart, pageSize: 1000 } as never);
      n += p.items.length;
      cursor = p.nextCursor;
      if (!p.hasMore) return n;
    }
  };
  return {
    deployments: await drain((r) => src.fetchDeployments(r)),
    pull_requests: await drain((r) => src.fetchPullRequests(r)),
    work_items: await drain((r) => src.fetchWorkItems(r)),
    sprints: await drain((r) => src.fetchSprints(r)),
    incidents: await drain((r) => src.fetchIncidents(r)),
  };
}

describe('syncSource with the fake source', () => {
  it('backfills 12 months on the first run, matching what the source holds', async () => {
    const { db, stores } = await freshStores();
    const src = newSource();
    const results = await syncSource({ source: src.asSourceSet(), syncStore: stores.sync, clock, pageSize: 300 });

    expect(results.map((r) => r.stream)).toEqual([...ALL_STREAMS]);
    expect(results.every((r) => r.mode === 'backfill')).toBe(true);
    expect(results.find((r) => r.stream === 'pull_requests')!.pages).toBeGreaterThan(5);

    const expected = await fakeCounts(src);
    const got = await counts(db);
    expect(got.deployments).toBe(expected.deployments);
    expect(got.pull_requests).toBe(expected.pull_requests);
    expect(got.work_items).toBe(expected.work_items);
    expect(got.sprints).toBe(expected.sprints);
    expect(got.incidents).toBe(expected.incidents);
    expect(got.deployments).toBeGreaterThan(2500);
  });

  it('re-running with nothing new fetches nothing and changes nothing (idempotent)', async () => {
    const { db, stores } = await freshStores();
    const src = newSource();
    const deps = { source: src.asSourceSet(), syncStore: stores.sync, clock, pageSize: 500 };
    await syncSource(deps);
    const before = { counts: await counts(db), print: await fingerprint(db) };

    const again = await syncSource(deps);
    expect(again.every((r) => r.mode === 'incremental' && r.fetched === 0 && r.upserted === 0)).toBe(true);
    expect(await counts(db)).toEqual(before.counts);
    expect(await fingerprint(db)).toEqual(before.print);
  });

  it('is deterministic: two databases synced from the same seed hold identical content', async () => {
    const a = await freshStores();
    const b = await freshStores();
    await syncSource({ source: newSource().asSourceSet(), syncStore: a.stores.sync, clock });
    await syncSource({ source: newSource().asSourceSet(), syncStore: b.stores.sync, clock, pageSize: 123 });
    expect(await fingerprint(a.db)).toEqual(await fingerprint(b.db));
  });

  it('"next day" emits only that day’s changes, and ends up identical to a fresh bulk load', async () => {
    const inc = await freshStores();
    const src = newSource();
    const deps = { source: src.asSourceSet(), syncStore: inc.stores.sync, clock };
    await syncSource(deps);
    const before = await counts(inc.db);

    src.simulateNextDay();
    const delta = await syncSource(deps);
    expect(delta.every((r) => r.mode === 'incremental')).toBe(true);
    const fetched = delta.reduce((a, r) => a + r.fetched, 0);
    expect(fetched).toBeGreaterThan(0);
    expect(fetched).toBeLessThan(120); // a day, not a re-send of the year
    const after = await counts(inc.db);
    expect(after.pull_requests).toBeGreaterThanOrEqual(before.pull_requests);

    // Re-running immediately is a no-op again.
    expect((await syncSource(deps)).every((r) => r.fetched === 0)).toBe(true);

    const bulk = await freshStores();
    const src2 = newSource();
    src2.simulateNextDay();
    await syncSource({ source: src2.asSourceSet(), syncStore: bulk.stores.sync, clock });
    expect(await fingerprint(inc.db)).toEqual(await fingerprint(bulk.db));
  });

  it('resumes after a failure from the last committed page, without duplicates', async () => {
    const { db, stores } = await freshStores();
    const src = newSource();
    let pagesServed = 0;
    let failing = true;
    const flaky: SourceSet = {
      ...src.asSourceSet(),
      delivery: {
        fetchDeployments: (r) => src.fetchDeployments(r),
        fetchPullRequests: async (r) => {
          if (failing && ++pagesServed === 4) throw new Error('GitHub 502');
          return src.fetchPullRequests(r);
        },
      },
    };
    const deps = { source: flaky, syncStore: stores.sync, clock, pageSize: 200 };

    await expect(syncSource(deps)).rejects.toThrow('GitHub 502');
    const [failed] = (await stores.sync.listRuns('fake')).filter((r) => r.stream === 'pull_requests');
    expect(failed).toMatchObject({ status: 'failed', error: 'GitHub 502' });
    expect(failed!.cursorAfter).not.toBeNull();
    const partial = (await counts(db)).pull_requests;
    expect(partial).toBe(600); // three pages committed before the failure

    failing = false;
    const resumed = await syncSource(deps);
    const prRun = resumed.find((r) => r.stream === 'pull_requests')!;
    expect(prRun.mode).toBe('incremental'); // picked up from the committed cursor
    expect((await counts(db)).pull_requests).toBe((await fakeCounts(src)).pull_requests);

    const clean = await freshStores();
    await syncSource({ source: src.asSourceSet(), syncStore: clean.stores.sync, clock });
    expect(await fingerprint(db)).toEqual(await fingerprint(clean.db));
  });

  it('syncs a single stream when asked', async () => {
    const { db, stores } = await freshStores();
    await syncSource({ source: newSource().asSourceSet(), syncStore: stores.sync, clock }, { streams: ['incidents'] });
    const c = await counts(db);
    expect(c.incidents).toBeGreaterThan(300);
    expect(c.deployments).toBe(0);
  });

  it('logs a run per stream with cursors, for the data-sources screen', async () => {
    const { stores } = await freshStores();
    await syncSource({ source: newSource().asSourceSet(), syncStore: stores.sync, clock });
    const runs = await stores.sync.listRuns('fake');
    expect(runs).toHaveLength(5);
    for (const r of runs) {
      expect(r).toMatchObject({ status: 'succeeded', cursorBefore: null });
      expect(r.cursorAfter).toMatch(/^\d+\|/);
      expect(r.upserted).toBeGreaterThan(0);
    }
  });
});
