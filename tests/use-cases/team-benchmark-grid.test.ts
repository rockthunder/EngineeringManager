import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { postgresStores, type Stores } from '../../src/adapters/driven/postgres';
import {
  computeBenchmarkGrid, getBenchmarkGrid, type BenchmarkGrid, type GridCell,
} from '../../src/application/use-cases/benchmark-grid';
import { deriveBenchmarkVersion } from '../../src/domain/benchmarks/version';
import { median } from '../../src/domain/metrics/aggregation';
import { REGISTRY, REGISTRY_BY_ID } from '../../src/domain/metrics/registry';
import type { MetricId } from '../../src/domain/metrics/types';
import { attributeEvents } from '../../src/domain/teams/attribution';
import { dayToInstant, lastNDays } from '../../src/domain/time/day';
import { ANCHOR, clock } from '../support/constants';
import { cloneDatabase, type TestDb } from '../support/postgres';

let db: TestDb;
let stores: Stores;
let grid: BenchmarkGrid;

const deps = () => ({ eventStore: stores.events, configStore: stores.config, clock });

beforeAll(async () => {
  db = await cloneDatabase(inject('pgAdminUrl'), 'seeded');
  stores = postgresStores(db.pool);
  grid = await getBenchmarkGrid(deps(), { windowDays: 30 });
});
afterAll(() => db.drop());

const row = (name: string) => grid.rows.find((r) => r.teamName === name)!;
const cell = (name: string, id: MetricId): GridCell => row(name).cells.find((c) => c.metricId === id)!;
const level = (name: string, id: MetricId) => {
  const g = cell(name, id).grade;
  return g.status === 'graded' ? g.level : g.status;
};
const bandCount = (name: string, band: string) =>
  row(name).cells.filter((c) => c.grade.status === 'graded' && c.grade.band === band).length;

describe('journey: the Director opens the team benchmark for the last 30 days', () => {
  it('shows every team and the org, graded against the bar in force, listed by name', () => {
    expect(grid.endDay).toBe(ANCHOR);
    expect(grid.benchmarkVersion).toBe(2);
    expect(grid.rows.map((r) => r.teamName)).toEqual([
      'Aurora', 'Birch', 'Comet', 'Delta', 'Ember', 'Fjord', 'Garnet', 'Harbour', 'Iris', 'Juniper',
    ]);
    expect(grid.metrics).toHaveLength(18);
    expect(grid.org.cells).toHaveLength(18);
    for (const r of grid.rows) expect(r.cells).toHaveLength(18);
  });

  it('is not a league table: no rank, score or total anywhere, and order ignores grades', () => {
    const keys = JSON.stringify(grid, (_k, v) => v).match(/"(\w+)":/g)!.map((k) => k.replace(/[":]/g, ''));
    expect(keys.filter((k) => /rank|score|total|position|overall/i.test(k.replace('devex_score', '')))).toEqual([]);
    const names = grid.rows.map((r) => r.teamName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('shows Iris as not enough data, with the count, for volume-based metrics', () => {
    for (const id of ['lead_time', 'pr_cycle_time', 'pr_pickup_time', 'pr_size', 'work_item_cycle_time', 'devex_score'] as MetricId[]) {
      const g = cell('Iris', id).grade;
      expect(g, id).toMatchObject({ status: 'insufficient_data' });
      if (g.status === 'insufficient_data') expect(g.sampleSize).toBeLessThan(g.minSample);
    }
    expect(cell('Iris', 'devex_score').grade).toEqual({ status: 'insufficient_data', sampleSize: 2, minSample: 4 });
  });

  it('never grades throughput', () => {
    for (const r of [...grid.rows, { cells: grid.org.cells }]) {
      expect(r.cells.find((c) => c.metricId === 'throughput')!.grade).toEqual({ status: 'not_graded' });
    }
  });

  it('only shows metrics that have a glossary entry, and vice versa', () => {
    const shown = new Set(grid.metrics.map((m) => m.id));
    expect(shown).toEqual(new Set(REGISTRY.map((m) => m.id)));
    for (const id of shown) expect(REGISTRY_BY_ID[id].glossary.definition.length).toBeGreaterThan(10);
  });
});

describe('the dummy teams behave as described', () => {
  it('Aurora is above the bar on most metrics (blue), with a couple one level short so there is always something to talk about', () => {
    expect(bandCount('Aurora', 'above')).toBeGreaterThanOrEqual(8);
    expect(bandCount('Aurora', 'below')).toBe(0);
    expect(bandCount('Aurora', 'near')).toBeGreaterThanOrEqual(1);
    expect(bandCount('Aurora', 'near')).toBeLessThanOrEqual(3);
  });

  it('Birch is steady at the bar (green cells)', () => {
    expect(bandCount('Birch', 'at') + bandCount('Birch', 'above')).toBeGreaterThanOrEqual(9);
    expect(bandCount('Birch', 'below')).toBe(0);
  });

  it('Comet is fast but unstable: deploy frequency above the bar, change failure rate well below it', () => {
    expect(cell('Comet', 'deployment_frequency').grade).toMatchObject({ level: 'elite', band: 'above' });
    expect(cell('Comet', 'change_failure_rate').grade).toMatchObject({ level: 'low', band: 'below' });
  });

  it('Delta is red on the delivery metrics, with a very long lead time', () => {
    expect(level('Delta', 'lead_time')).toBe('low');
    expect(level('Delta', 'pr_size')).toBe('low');
    expect(level('Delta', 'pr_cycle_time')).toBe('low');
    expect(bandCount('Delta', 'below')).toBeGreaterThanOrEqual(6);
  });

  it('Ember is graded on the Platform profile: 0.7 deploys/week is High, not Medium', () => {
    const c = cell('Ember', 'deployment_frequency');
    expect(c.value).toBeGreaterThan(0.5);
    expect(c.value).toBeLessThan(1);
    expect(c.grade).toMatchObject({ level: 'high', band: 'at' });
    expect(cell('Ember', 'failed_deployment_recovery_time').grade).toMatchObject({ level: 'elite' });
  });

  it('Fjord is quick in review but slow to ship: the wait is after merge', () => {
    expect(level('Fjord', 'pr_cycle_time')).toBe('elite');
    expect(['medium', 'low']).toContain(level('Fjord', 'lead_time'));
  });

  it('Garnet is improving and Harbour is sliding, against their own previous period', () => {
    expect(cell('Garnet', 'pr_cycle_time').trend?.judgement).toBe('improving');
    expect(cell('Garnet', 'lead_time').trend?.judgement).toBe('improving');
    expect(cell('Harbour', 'pr_cycle_time').trend?.judgement).toBe('worsening');
    expect(cell('Harbour', 'lead_time').trend?.judgement).toBe('worsening');
  });

  it('Garnet was red a year ago and is green now; Harbour was green then', async () => {
    const early = await getBenchmarkGrid(deps(), { windowDays: 30, endDay: '2025-12-15' });
    const g = (name: string, id: MetricId) => early.rows.find((r) => r.teamName === name)!.cells.find((c) => c.metricId === id)!.grade;
    expect(g('Garnet', 'pr_cycle_time')).toMatchObject({ level: 'low', band: 'below' });
    expect(level('Garnet', 'pr_cycle_time')).toBe('elite');
    expect(g('Harbour', 'pr_cycle_time')).toMatchObject({ level: 'high', band: 'at' });
  });

  it('Harbour has slid to amber after the reorg', () => {
    expect(bandCount('Harbour', 'near')).toBeGreaterThanOrEqual(3);
  });
});

describe('journey: raising the lead-time bar recolours history without fetching anything', () => {
  it('grades history against the version in force at the time, or today’s on request', async () => {
    const before = await getBenchmarkGrid(deps(), { windowDays: 30, endDay: '2026-06-15' });
    expect(before.benchmarkVersion).toBe(1);
    const birchThen = before.rows.find((r) => r.teamName === 'Birch')!.cells.find((c) => c.metricId === 'lead_time')!;
    expect(birchThen.grade).toMatchObject({ level: 'high', bar: 'high', band: 'at', distance: 0 });

    const sameWindowToday = await getBenchmarkGrid(deps(), { windowDays: 30, endDay: '2026-06-15', version: 'today' });
    expect(sameWindowToday.benchmarkVersion).toBe(2);
    const birchRegraded = sameWindowToday.rows.find((r) => r.teamName === 'Birch')!.cells.find((c) => c.metricId === 'lead_time')!;
    expect(birchRegraded.value).toBe(birchThen.value); // same data
    expect(birchRegraded.grade).toMatchObject({ level: 'high', bar: 'elite', band: 'near', distance: -1 });
  });

  it('publishing Bar v3 changes cells with no new sync', async () => {
    const runsBefore = (await stores.sync.listRuns()).length;
    const versions = await stores.config.loadBenchmarkVersions();
    const v3 = deriveBenchmarkVersion(versions[versions.length - 1]!, { bars: { org: { pr_cycle_time: 'elite' } } }, '2026-10-01');
    await stores.config.appendBenchmarkVersion(v3);

    const after = await getBenchmarkGrid(deps(), { windowDays: 30 });
    expect(after.benchmarkVersion).toBe(3);
    expect(cell('Birch', 'pr_cycle_time').grade).toMatchObject({ level: 'high', band: 'at' });
    const birchNow = after.rows.find((r) => r.teamName === 'Birch')!.cells.find((c) => c.metricId === 'pr_cycle_time')!;
    expect(birchNow.grade).toMatchObject({ level: 'high', bar: 'elite', band: 'near', distance: -1 });
    expect((await stores.sync.listRuns()).length).toBe(runsBefore);
  });
});

describe('journey: moving two repos from Harbour to Juniper keeps history', () => {
  it('gives Harbour the earlier events and Juniper only the later ones', async () => {
    const org = await stores.config.loadOrganisation();
    const defs = await stores.config.loadDefinitions();
    const events = await stores.events.loadEvents({
      window: { from: dayToInstant('2025-10-01'), to: dayToInstant('2026-11-01') },
      doneStatuses: ['Done'],
    });
    const by = attributeEvents(events, org.mappings, defs);
    const reorg = dayToInstant('2026-06-23');
    const harbour = by.get('harbour')!;
    const juniper = by.get('juniper')!;

    const billing = (prs: typeof harbour.pullRequests) => prs.filter((p) => p.repo === 'harbour-billing');
    const t = (p: { mergedAt: number | null; openedAt: number }) => p.mergedAt ?? p.openedAt;
    expect(billing(harbour.pullRequests).length).toBeGreaterThan(20);
    expect(billing(harbour.pullRequests).every((p) => t(p) < reorg)).toBe(true);
    expect(billing(juniper.pullRequests).length).toBeGreaterThan(5);
    expect(billing(juniper.pullRequests).every((p) => t(p) >= reorg)).toBe(true);
    expect(juniper.pullRequests.every((p) => t(p) >= reorg)).toBe(true);
    expect(harbour.pullRequests.some((p) => p.repo === 'harbour-core' && t(p) >= reorg)).toBe(true);
  });
});

describe('journey: the org benchmark matches figures computed by hand from pooled seed events', () => {
  const window = lastNDays(ANCHOR, 30);
  const from = new Date(window.from);
  const to = new Date(window.to);

  it('PR cycle time and PR size are medians over every merged PR, not averages of team medians', async () => {
    const r = await db.pool.query(
      `SELECT extract(epoch FROM merged_at - opened_at) / 3600 AS h, lines_changed AS lines
       FROM pull_requests WHERE merged_at >= $1 AND merged_at < $2`, [from, to],
    );
    const handCycle = median(r.rows.map((x) => Number(x.h)))!;
    const handSize = median(r.rows.map((x) => Number(x.lines)))!;
    const org = (id: MetricId) => grid.org.cells.find((c) => c.metricId === id)!;
    expect(org('pr_cycle_time').value).toBeCloseTo(handCycle, 2);
    expect(org('pr_size').value).toBe(handSize);
    expect(org('pr_cycle_time').sampleSize).toBe(r.rows.length);

    const teamMedians = grid.rows.flatMap((t) => {
      const v = t.cells.find((c) => c.metricId === 'pr_cycle_time')!.value;
      return v === null ? [] : [v];
    });
    const meanOfMedians = teamMedians.reduce((a, b) => a + b, 0) / teamMedians.length;
    expect(Math.abs(org('pr_cycle_time').value! - meanOfMedians)).toBeGreaterThan(1);
  });

  it('change failure rate is total failed deploys over total deploys', async () => {
    const r = await db.pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE d.is_rollback OR EXISTS (
                SELECT 1 FROM incidents i WHERE i.deployment_source_id = d.source_id AND i.source = d.source))::int AS failed
       FROM deployments d WHERE d.environment = 'production' AND d.at >= $1 AND d.at < $2`, [from, to],
    );
    const { total, failed } = r.rows[0];
    const org = grid.org.cells.find((c) => c.metricId === 'change_failure_rate')!;
    expect(org.value).toBeCloseTo((failed / total) * 100, 6);
    expect(org.sampleSize).toBe(total);
  });

  it('deployment frequency sums team deploys and is graded per team', async () => {
    const r = await db.pool.query(
      `SELECT count(*)::int AS n FROM deployments WHERE environment = 'production' AND at >= $1 AND at < $2`, [from, to],
    );
    const org = grid.org.cells.find((c) => c.metricId === 'deployment_frequency')!;
    expect(org.value).toBeCloseTo(r.rows[0].n / (30 / 7), 6);
    expect(org.gradedValue).toBeCloseTo(org.value! / 10, 6);
  });
});

describe('golden grid', () => {
  it('matches the reviewed levels and distances (update deliberately if the generator changes)', async () => {
    const lines = grid.rows.map((r) => {
      const cells = r.cells.map((c) => {
        const g = c.grade;
        if (g.status === 'insufficient_data') return `${c.metricId}=n${g.sampleSize}/${g.minSample}`;
        if (g.status === 'not_graded') return `${c.metricId}=-`;
        return `${c.metricId}=${g.level[0]!.toUpperCase()}${g.distance >= 0 ? '+' : ''}${g.distance}`;
      });
      return `${r.teamName.padEnd(8)} ${cells.join(' ')}`;
    });
    await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot('./golden/grid-30d.txt');
  });
});

describe('computeBenchmarkGrid is pure over loaded events', () => {
  it('gives the same answer when called again on the same inputs', async () => {
    const [organisation, definitions, versions] = await Promise.all([
      stores.config.loadOrganisation(), stores.config.loadDefinitions(), stores.config.loadBenchmarkVersions(),
    ]);
    const events = await stores.events.loadEvents({
      window: { from: lastNDays(ANCHOR, 120).from, to: lastNDays(ANCHOR, 1).to },
      doneStatuses: ['Done'],
    });
    const input = { events, organisation, definitions, versions, today: ANCHOR };
    expect(computeBenchmarkGrid(input, { windowDays: 30 })).toEqual(computeBenchmarkGrid(input, { windowDays: 30 }));
  });
});
