import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { migrate, postgresStores, type Stores } from '../../src/adapters/driven/postgres';
import { dummyScenario } from '../../src/adapters/driven/fake-source/scenario';
import { defaultBenchmarkVersion } from '../../src/domain/benchmarks/defaults';
import { dayToInstant } from '../../src/domain/time/day';
import { deployment, incident, item, pr, response, sprint, T0 } from '../../src/domain/testing/fixtures';
import type { EventSet } from '../../src/domain/events/types';
import { ANCHOR } from '../support/constants';
import { cloneDatabase, type TestDb } from '../support/postgres';

const WINDOW = { from: dayToInstant('2026-01-01'), to: dayToInstant('2027-01-01') };
const DONE = ['Done'];

let db: TestDb;
let stores: Stores;

beforeAll(async () => {
  db = await cloneDatabase(inject('pgAdminUrl'), 'migrated');
  stores = postgresStores(db.pool);
  await stores.config.saveOrganisation(dummyScenario(ANCHOR).organisation);
});
afterAll(() => db.drop());

const load = (window = WINDOW): Promise<EventSet> => stores.events.loadEvents({ window, doneStatuses: DONE });
const run = async (stream: string) => stores.sync.startRun('test', stream as never, 1, null);

describe('migrations', () => {
  it('are idempotent', async () => {
    expect(await migrate(db.pool)).toEqual([]);
  });

  it('create no person-identifying columns anywhere', async () => {
    const r = await db.pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name ~* '(author|assignee|reviewer|committer|email|user_?name|ip_?address|user_?agent|reporter|person)'`,
    );
    expect(r.rows).toEqual([]);
  });

  it('keep survey submission time to the day (a date, not a timestamp)', async () => {
    const r = await db.pool.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'survey_responses' AND column_name = 'submitted_day'`,
    );
    expect(r.rows[0].data_type).toBe('date');
  });
});

describe('event repositories', () => {
  it('round-trips every event type', async () => {
    const d = deployment({ sourceId: 'rt-d', at: T0 + 5_000, commitShas: ['a', 'b'], isRework: true });
    const p = pr({ sourceId: 'rt-p', deploymentId: 'rt-d', mergedAt: T0 + 10_000, firstReviewAt: null });
    const w = item([['To Do', 0], ['In Progress', 1000], ['Done', 5000]], {
      sourceId: 'rt-w', labels: ['x', 'y'], foundInProduction: true,
      sprintMemberships: [{ sprintId: 'S1', addedAt: T0 + 100 }],
    });
    const s = sprint({ sourceId: 'rt-s', committedItemIds: ['rt-w'], completedItemIds: [] });
    const i = incident({ sourceId: 'rt-i', deploymentId: 'rt-d', restoredAt: null });
    const run1 = await run('deployments');
    await stores.sync.commitPage(run1, { stream: 'deployments', items: [d] }, 'c');
    await stores.sync.commitPage(run1, { stream: 'pull_requests', items: [p] }, 'c');
    await stores.sync.commitPage(run1, { stream: 'work_items', items: [w] }, 'c');
    await stores.sync.commitPage(run1, { stream: 'sprints', items: [s] }, 'c');
    await stores.sync.commitPage(run1, { stream: 'incidents', items: [i] }, 'c');

    const ev = await load();
    expect(ev.deployments.find((x) => x.sourceId === 'rt-d')).toEqual(d);
    expect(ev.pullRequests.find((x) => x.sourceId === 'rt-p')).toEqual(p);
    expect(ev.workItems.find((x) => x.sourceId === 'rt-w')).toEqual(w);
    expect(ev.sprints.find((x) => x.sourceId === 'rt-s')).toEqual(s);
    expect(ev.incidents.find((x) => x.sourceId === 'rt-i')).toEqual(i);
  });

  it('upserts by source id: writing twice leaves one row', async () => {
    const d = deployment({ sourceId: 'dup-d' });
    const r = await run('deployments');
    await stores.sync.commitPage(r, { stream: 'deployments', items: [d] }, 'c');
    await stores.sync.commitPage(r, { stream: 'deployments', items: [d, d] }, 'c');
    const rows = await db.pool.query(`SELECT count(*)::int AS n FROM deployments WHERE source_id = 'dup-d'`);
    expect(rows.rows[0].n).toBe(1);
  });

  it('takes newer data and ignores stale re-sends', async () => {
    const base = pr({ sourceId: 'ver-p', mergedAt: null, firstReviewAt: null, updatedAt: T0 + 1000 });
    const newer = { ...base, mergedAt: T0 + 5000, updatedAt: T0 + 5000, deploymentId: 'x' };
    const r = await run('pull_requests');
    await stores.sync.commitPage(r, { stream: 'pull_requests', items: [base] }, 'c');
    await stores.sync.commitPage(r, { stream: 'pull_requests', items: [newer] }, 'c');
    expect((await load()).pullRequests.find((x) => x.sourceId === 'ver-p')).toEqual(newer);
    const written = await stores.sync.commitPage(r, { stream: 'pull_requests', items: [base] }, 'c');
    expect(written).toBe(0);
    expect((await load()).pullRequests.find((x) => x.sourceId === 'ver-p')).toEqual(newer);
  });

  it('replaces a work item’s transitions and sprint memberships wholesale', async () => {
    const v1 = item([['To Do', 0], ['In Progress', 100]], {
      sourceId: 'rep-w', updatedAt: T0 + 100, sprintMemberships: [{ sprintId: 'A', addedAt: T0 }],
    });
    const v2 = item([['To Do', 0], ['In Progress', 100], ['Blocked', 200], ['Done', 300]], {
      sourceId: 'rep-w', updatedAt: T0 + 300, sprintMemberships: [{ sprintId: 'B', addedAt: T0 + 50 }],
    });
    const r = await run('work_items');
    await stores.sync.commitPage(r, { stream: 'work_items', items: [v1] }, 'c');
    await stores.sync.commitPage(r, { stream: 'work_items', items: [v2] }, 'c');
    const got = (await load()).workItems.find((x) => x.sourceId === 'rep-w')!;
    expect(got.transitions.map((t) => t.to)).toEqual(['To Do', 'In Progress', 'Blocked', 'Done']);
    expect(got.sprintMemberships.map((m) => m.sprintId)).toEqual(['B']);
  });

  it('loads still-open work items however old, but skips long-finished ones', async () => {
    const old = (end: string | null, id: string) =>
      item([['To Do', 0], ['In Progress', 10], ...(end ? [[end, 20] as const] : [])], {
        sourceId: id, createdAt: dayToInstant('2025-01-01'),
      });
    const r = await run('work_items');
    await stores.sync.commitPage(r, { stream: 'work_items', items: [old(null, 'old-open'), old('Done', 'old-done')] }, 'c');
    const ids = (await load()).workItems.map((w) => w.sourceId);
    expect(ids).toContain('old-open');
    expect(ids).not.toContain('old-done');
  });

  it('keeps a PR in range when its deployment lands in the range, even if it merged earlier', async () => {
    const dep = deployment({ sourceId: 'late-d', at: dayToInstant('2026-06-10') });
    const early = pr({
      sourceId: 'late-p', openedAt: dayToInstant('2026-05-01'), mergedAt: dayToInstant('2026-05-02'), deploymentId: 'late-d',
    });
    const r = await run('pull_requests');
    await stores.sync.commitPage(r, { stream: 'deployments', items: [dep] }, 'c');
    await stores.sync.commitPage(r, { stream: 'pull_requests', items: [early] }, 'c');
    const june = { from: dayToInstant('2026-06-01'), to: dayToInstant('2026-07-01') };
    expect((await load(june)).pullRequests.map((p) => p.sourceId)).toContain('late-p');
  });

  it('stores and returns anonymous survey responses', async () => {
    const rs = [response({ id: 'sv-1', teamId: 'aurora' }), response({ id: 'sv-2', teamId: 'aurora', scoreAnswers: [1, 2, 3] })];
    await stores.events.putSurveyResponses(rs);
    await stores.events.putSurveyResponses(rs); // idempotent
    const got = (await load()).surveyResponses.filter((r) => r.id.startsWith('sv-'));
    expect(got).toEqual(rs);
  });
});

describe('configuration', () => {
  it('round-trips the organisation with effective-dated mappings', async () => {
    const org = await stores.config.loadOrganisation();
    const sc = dummyScenario(ANCHOR).organisation;
    expect(org.teams).toEqual(sc.teams);
    expect(org.mappings).toHaveLength(sc.mappings.length);
    expect(org.mappings.filter((m) => m.ref === 'harbour-billing').map((m) => [m.teamId, m.effectiveFrom, m.effectiveTo])).toEqual([
      ['harbour', '2025-10-21', '2026-06-23'],
      ['juniper', '2026-06-23', null],
    ]);
  });

  it('refuses overlapping mappings for the same repo', async () => {
    const org = await stores.config.loadOrganisation();
    const bad = { ...org, mappings: [...org.mappings, { teamId: 'aurora', kind: 'repo' as const, ref: 'harbour-core', effectiveFrom: '2026-01-01', effectiveTo: null }] };
    await expect(stores.config.saveOrganisation(bad)).rejects.toThrow(/mapping_no_overlap/);
    expect((await stores.config.loadOrganisation()).mappings).toHaveLength(org.mappings.length); // rolled back
  });

  it('stores benchmark versions append-only and refuses to change them', async () => {
    const v1 = defaultBenchmarkVersion('2025-10-21');
    await stores.config.appendBenchmarkVersion(v1);
    expect((await stores.config.loadBenchmarkVersions()).map((v) => v.number)).toEqual([1]);
    await expect(db.pool.query(`UPDATE benchmark_versions SET payload = '{}' WHERE number = 1`)).rejects.toThrow(/immutable/);
    await expect(db.pool.query('DELETE FROM benchmark_versions')).rejects.toThrow(/immutable/);
    expect((await stores.config.loadBenchmarkVersions())[0]).toEqual(v1);
  });

  it('keeps definitions versioned and returns the latest', async () => {
    const defs = dummyScenario(ANCHOR).definitions;
    await stores.config.saveDefinitions(defs);
    await stores.config.saveDefinitions({ ...defs, productionEnvironment: 'prod' });
    expect((await stores.config.loadDefinitions()).productionEnvironment).toBe('prod');
  });
});

describe('sync bookkeeping', () => {
  it('commits events and cursor atomically: a failing page leaves both untouched', async () => {
    const r = await stores.sync.startRun('atomic', 'deployments', 1, null);
    const good = deployment({ sourceId: 'atom-ok' });
    const bad = { ...deployment({ sourceId: 'atom-bad' }), repo: null as unknown as string };
    await expect(stores.sync.commitPage(r, { stream: 'deployments', items: [good, bad] }, 'cursor-1')).rejects.toThrow();
    expect(await stores.sync.lastCursor('atomic', 'deployments')).toBeNull();
    const n = await db.pool.query(`SELECT count(*)::int AS n FROM deployments WHERE source_id = 'atom-ok'`);
    expect(n.rows[0].n).toBe(0);
  });

  it('remembers the cursor of the last committed page', async () => {
    const r = await stores.sync.startRun('cur', 'incidents', 1, null);
    await stores.sync.commitPage(r, { stream: 'incidents', items: [incident({ sourceId: 'cur-1' })] }, 'p1');
    await stores.sync.commitPage(r, { stream: 'incidents', items: [incident({ sourceId: 'cur-2' })] }, 'p2');
    await stores.sync.finishRun(r, 2, null);
    expect(await stores.sync.lastCursor('cur', 'incidents')).toBe('p2');
    const [rec] = await stores.sync.listRuns('cur');
    expect(rec).toMatchObject({ status: 'succeeded', cursorBefore: null, cursorAfter: 'p2', upserted: 2 });
  });
});

