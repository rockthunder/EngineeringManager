import { beforeAll, describe, expect, it } from 'vitest';
import type { FetchRequest, Page } from '../../../application/ports/source';
import type { SourceRef } from '../../../domain/events/types';
import { dayToInstant, MS_PER_DAY } from '../../../domain/time/day';
import { generateWorld } from './generator';
import { FakeSource } from './fake-source';
import { dummyScenario } from './scenario';
import { snapshotAt } from './snapshot';
import { dummySurveyResponses } from './survey-seed';

const ANCHOR = '2026-10-21';
const SEED = 20261021;

async function drain<T extends SourceRef>(
  fetch: (r: FetchRequest) => Promise<Page<T>>,
  cursor: string | null,
  sinceDay: string,
  pageSize = 400,
): Promise<{ items: T[]; cursor: string | null; pages: number }> {
  const items: T[] = [];
  let pages = 0;
  for (;;) {
    const p = await fetch({ cursor, sinceDay, pageSize });
    items.push(...p.items);
    cursor = p.nextCursor;
    pages++;
    if (!p.hasMore) return { items, cursor, pages };
  }
}

function streams(src: FakeSource) {
  return {
    deployments: (c: string | null, s: string) => drain((r) => src.fetchDeployments(r), c, s),
    pullRequests: (c: string | null, s: string) => drain((r) => src.fetchPullRequests(r), c, s),
    workItems: (c: string | null, s: string) => drain((r) => src.fetchWorkItems(r), c, s),
    sprints: (c: string | null, s: string) => drain((r) => src.fetchSprints(r), c, s),
    incidents: (c: string | null, s: string) => drain((r) => src.fetchIncidents(r), c, s),
  };
}

const byId = <T extends SourceRef>(xs: readonly T[]): Map<string, T> => new Map(xs.map((x) => [x.sourceId, x]));

describe('FakeSource', () => {
  let a: FakeSource;
  beforeAll(() => {
    a = new FakeSource({ seed: SEED, anchorDay: ANCHOR });
  });

  it('is deterministic for a seed and differs for another', async () => {
    const b = new FakeSource({ seed: SEED, anchorDay: ANCHOR });
    const c = new FakeSource({ seed: SEED + 1, anchorDay: ANCHOR });
    const since = a.scenario.historyStart;
    const [ra, rb, rc] = await Promise.all([
      streams(a).pullRequests(null, since),
      streams(b).pullRequests(null, since),
      streams(c).pullRequests(null, since),
    ]);
    expect(ra.items.length).toBeGreaterThan(1000);
    expect(rb.items).toEqual(ra.items);
    expect(rc.items).not.toEqual(ra.items);
  });

  it('generates 12 months for ten teams’ worth of repos and boards', () => {
    expect(a.scenario.organisation.teams.map((t) => t.name)).toEqual([
      'Aurora', 'Birch', 'Comet', 'Delta', 'Ember', 'Fjord', 'Garnet', 'Harbour', 'Iris', 'Juniper',
    ]);
    expect(a.scenario.historyStart).toBe('2025-10-21');
  });

  it('pages cover every item exactly once, in a stable order', async () => {
    const since = a.scenario.historyStart;
    const all = await streams(a).workItems(null, since);
    expect(all.pages).toBeGreaterThan(2);
    expect(new Set(all.items.map((x) => x.sourceId)).size).toBe(all.items.length);
    const sorted = [...all.items].sort((p, q) => p.updatedAt - q.updatedAt || (p.sourceId < q.sourceId ? -1 : 1));
    expect(all.items).toEqual(sorted);
  });

  it('shows nothing from the future: no timestamp after the watermark day', async () => {
    const limit = dayToInstant(ANCHOR) + MS_PER_DAY;
    const s = streams(a);
    const deps = (await s.deployments(null, a.scenario.historyStart)).items;
    const prs = (await s.pullRequests(null, a.scenario.historyStart)).items;
    const items = (await s.workItems(null, a.scenario.historyStart)).items;
    expect(deps.every((d) => d.at < limit)).toBe(true);
    expect(prs.every((p) => p.openedAt < limit && (p.mergedAt ?? 0) < limit)).toBe(true);
    expect(items.every((w) => w.transitions.every((t) => t.at < limit))).toBe(true);
    const depIds = new Set(deps.map((d) => d.sourceId));
    expect(prs.every((p) => p.deploymentId === null || depIds.has(p.deploymentId))).toBe(true);
  });

  it('simulateNextDay + incremental sync equals a fresh bulk read a day later', async () => {
    const inc = new FakeSource({ seed: SEED, anchorDay: ANCHOR });
    const since = inc.scenario.historyStart;
    const s = streams(inc);
    const first = {
      deployments: await s.deployments(null, since),
      pullRequests: await s.pullRequests(null, since),
      workItems: await s.workItems(null, since),
      sprints: await s.sprints(null, since),
      incidents: await s.incidents(null, since),
    };
    inc.simulateNextDay();
    const delta = {
      deployments: await s.deployments(first.deployments.cursor, since),
      pullRequests: await s.pullRequests(first.pullRequests.cursor, since),
      workItems: await s.workItems(first.workItems.cursor, since),
      sprints: await s.sprints(first.sprints.cursor, since),
      incidents: await s.incidents(first.incidents.cursor, since),
    };

    const bulk = new FakeSource({ seed: SEED, anchorDay: ANCHOR });
    bulk.simulateNextDay();
    const fresh = streams(bulk);
    for (const key of ['deployments', 'pullRequests', 'workItems', 'sprints', 'incidents'] as const) {
      const merged = new Map<string, SourceRef>([...byId<SourceRef>(first[key].items), ...byId<SourceRef>(delta[key].items)]);
      const expected = byId<SourceRef>((await fresh[key](null, since)).items);
      expect(merged, key).toEqual(expected);
    }
    // And the delta is small: one day's worth of change, not a re-send.
    expect(delta.pullRequests.items.length).toBeLessThan(first.pullRequests.items.length / 20);
  });

  it('extending the horizon never changes earlier entities', () => {
    const sc = dummyScenario(ANCHOR);
    const cfg = { seed: SEED, startDay: sc.historyStart, plan: sc.plan };
    const short = generateWorld({ ...cfg, endDay: '2026-09-01' });
    const long = generateWorld({ ...cfg, endDay: '2026-10-01' });
    const edge = dayToInstant('2026-09-01');
    const longPrs = byId(long.pullRequests);
    const early = short.pullRequests.filter((p) => p.openedAt < edge - 30 * MS_PER_DAY);
    expect(early.length).toBeGreaterThan(500);
    for (const p of early) expect(longPrs.get(p.sourceId)).toEqual(p);
    const longItems = byId(long.workItems);
    for (const w of short.workItems.filter((x) => x.createdAt < edge - 30 * MS_PER_DAY)) {
      expect(longItems.get(w.sourceId)).toEqual(w);
    }
  });

  it('keeps generating events for repos that change owner, so history is the mapping’s job', async () => {
    const prs = (await streams(a).pullRequests(null, a.scenario.historyStart)).items;
    const billing = prs.filter((p) => p.repo === 'harbour-billing').map((p) => p.openedAt);
    const reorg = dayToInstant(a.scenario.reorgDay);
    expect(billing.some((t) => t < reorg)).toBe(true);
    expect(billing.some((t) => t >= reorg)).toBe(true);
  });

  it('has the intended volumes: Iris is tiny, Comet deploys constantly, Delta weekly', async () => {
    const since = a.scenario.historyStart;
    const deps = (await streams(a).deployments(null, since)).items;
    const prs = (await streams(a).pullRequests(null, since)).items;
    const last30 = dayToInstant(ANCHOR) - 29 * MS_PER_DAY;
    const depCount = (repo: string) => deps.filter((d) => d.repo === repo && d.at >= last30).length;
    const prCount = (repo: string) => prs.filter((p) => p.repo === repo && p.openedAt >= last30).length;
    expect(prCount('iris-tool')).toBeLessThan(10);
    expect(depCount('comet-core') + depCount('comet-edge')).toBeGreaterThan(60);
    expect(depCount('delta-monolith')).toBeLessThanOrEqual(8);
    expect(depCount('delta-monolith')).toBeGreaterThanOrEqual(3);
  });

  it('uses whole-millisecond instants everywhere (what a database can hold exactly)', async () => {
    const since = a.scenario.historyStart;
    const s = streams(a);
    const all = [
      ...(await s.deployments(null, since)).items,
      ...(await s.pullRequests(null, since)).items,
      ...(await s.workItems(null, since)).items,
      ...(await s.sprints(null, since)).items,
      ...(await s.incidents(null, since)).items,
    ];
    const numbers: number[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'number') numbers.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(all);
    expect(numbers.filter((n) => !Number.isInteger(n))).toEqual([]);
  });

  it('puts no person-identifying field in any event', async () => {
    const since = a.scenario.historyStart;
    const s = streams(a);
    const samples = [
      (await s.deployments(null, since)).items[0],
      (await s.pullRequests(null, since)).items[0],
      (await s.workItems(null, since)).items[0],
      (await s.sprints(null, since)).items[0],
      (await s.incidents(null, since)).items[0],
    ];
    const json = JSON.stringify(samples);
    expect(json).not.toMatch(/author|assignee|reviewer|email|committer|reporter/i);
  });
});

describe('snapshotAt', () => {
  it('reveals a sprint’s completions only as they happen', () => {
    const sc = dummyScenario(ANCHOR);
    const world = generateWorld({ seed: SEED, startDay: sc.historyStart, endDay: '2026-03-01', plan: sc.plan });
    const sprint = world.sprints.find((s) => s.completions.length >= 2)!;
    const doneTimes = sprint.completions.map((c) => c.doneAt).sort((x, y) => x - y);
    const midDay = new Date(doneTimes[0]!).toISOString().slice(0, 10);
    const early = snapshotAt(world, midDay).sprints.find((s) => s.sourceId === sprint.sourceId)!;
    const later = snapshotAt(world, '2026-03-01').sprints.find((s) => s.sourceId === sprint.sourceId)!;
    expect(early.completedItemIds.length).toBeLessThan(later.completedItemIds.length);
    expect(later.committedItemIds).toEqual(early.committedItemIds);
  });
});

describe('dummy survey responses', () => {
  it('are anonymous, quarterly, and leave Iris below the minimum', () => {
    const sc = dummyScenario(ANCHOR);
    const rs = dummySurveyResponses(SEED, sc);
    const latest = rs.filter((r) => r.campaignId === 'devex-2026-09-21');
    const count = (team: string) => latest.filter((r) => r.teamId === team).length;
    expect(count('iris')).toBe(2);
    expect(count('aurora')).toBeGreaterThanOrEqual(4);
    expect(new Set(rs.map((r) => r.campaignId)).size).toBe(4);
    expect(JSON.stringify(rs[0])).not.toMatch(/email|name|ip|agent/i);
    expect(rs.some((r) => r.teamId === 'juniper' && r.campaignId === 'devex-2025-12-25')).toBe(false);
  });
});
