import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { updateSettings } from '../../src/application/settings';
import { getTeamBenchmark } from '../../src/application/use-cases/team-benchmark';
import type { CellView, GridView } from '../../src/application/views/contract';
import { cloneDatabase, type TestDb } from '../support/postgres';
import { startApp, type TestApp } from '../support/app';

let db: TestDb;
let t: TestApp;
let view: GridView;

beforeAll(async () => {
  db = await cloneDatabase(inject('pgAdminUrl'), 'seeded');
  t = await startApp(db);
  view = await getTeamBenchmark(t.deps, { range: { range: '30' } });
});
afterAll(async () => {
  await t.app.close();
  await db.drop();
});

const cell = (team: string, metric: string): CellView =>
  view.rows.find((r) => r.teamName === team)!.cells.find((c) => c.metricId === metric)!;

describe('team benchmark view (display-ready JSON)', () => {
  it('opens on the default window from settings and says which bar version it used', () => {
    expect(view).toMatchObject({ endDay: '2026-10-21', benchmarkVersion: 2, benchmarkEffectiveFrom: '2026-07-21', range: '30' });
    expect(view.dataAsOf).toMatch(/^2026-10-21T/);
    expect(view.rows).toHaveLength(10);
    expect(view.metrics).toHaveLength(18);
  });

  it('explains each grade in words: hover text names the gap and the bar', () => {
    const c = cell('Birch', 'lead_time');
    expect(c).toMatchObject({ levelName: 'High', label: 'Near bar', colour: 'amber', distance: -1, status: 'graded' });
    expect(c.tooltip).toMatch(/^Lead time for changes \d+(\.\d)? days, High \(1 level below the bar\); bar is under 1 day \(Elite\)$/);
  });

  it('shows the label as text as well as the colour', () => {
    expect(cell('Aurora', 'pr_size')).toMatchObject({ colour: 'blue', label: 'Above bar' });
    expect(cell('Birch', 'pr_size')).toMatchObject({ colour: 'green', label: 'At bar' });
    expect(cell('Delta', 'pr_size')).toMatchObject({ colour: 'red', label: 'Below bar' });
  });

  it('greys out small samples, with the count, rather than grading', () => {
    expect(cell('Iris', 'pr_cycle_time')).toMatchObject({
      colour: 'grey', label: 'Not enough data', status: 'insufficient_data', sampleSize: 7, minSample: 10, levelName: null,
    });
    expect(cell('Iris', 'pr_cycle_time').tooltip).toBe('PR cycle time: not enough data (7 of 10 PRs needed)');
  });

  it('shows throughput as context, uncoloured', () => {
    expect(cell('Aurora', 'throughput')).toMatchObject({ colour: 'none', status: 'not_graded', label: 'Context only' });
  });

  it('describes the trend in terms of improving or worsening, not up or down', () => {
    const t1 = cell('Garnet', 'pr_cycle_time').trend!;
    expect(t1.judgement).toBe('improving');
    expect(t1.text).toMatch(/^Improving: down \d+% on the previous period$/);
    expect(cell('Harbour', 'pr_cycle_time').trend!.text).toMatch(/^Worsening: up/);
  });

  it('filters rows by group and profile, but the org row stays whole-org', async () => {
    const south = await getTeamBenchmark(t.deps, { range: { range: '30' }, groupId: 'south' });
    expect(south.rows.map((r) => r.teamName)).toEqual(['Garnet', 'Harbour', 'Iris', 'Juniper']);
    expect(south.org.cells[0]!.value).toBe(view.org.cells[0]!.value);
    const platform = await getTeamBenchmark(t.deps, { range: { range: '30' }, profileId: 'platform' });
    expect(platform.rows.map((r) => r.teamName)).toEqual(['Ember']);
  });

  it('supports quarter-to-date, custom and per-metric windows', async () => {
    const qtd = await getTeamBenchmark(t.deps, { range: { range: 'qtd' } });
    expect(qtd.metrics.every((m) => m.windowDays === 21)).toBe(true);
    const custom = await getTeamBenchmark(t.deps, { range: { range: 'custom', from: '2026-09-01', to: '2026-09-30' } });
    expect(custom.endDay).toBe('2026-09-30');
    expect(custom.benchmarkVersion).toBe(2);
    const own = await getTeamBenchmark(t.deps, { range: { range: 'metric' } });
    expect(new Set(own.metrics.map((m) => m.windowDays))).toEqual(new Set([30, 60, 90]));
  });

  it('colours by level, with Elite fixed as blue, when settings say so', async () => {
    await updateSettings(t.stores.settings, { colourMode: 'level' });
    const byLevel = await getTeamBenchmark(t.deps, { range: { range: '30' } });
    const c = byLevel.rows.find((r) => r.teamName === 'Birch')!.cells.find((x) => x.metricId === 'lead_time')!;
    expect(c).toMatchObject({ colour: 'green', label: 'High' }); // High is green whatever the bar
    const a = byLevel.rows.find((r) => r.teamName === 'Aurora')!.cells.find((x) => x.metricId === 'lead_time')!;
    expect(a).toMatchObject({ colour: 'blue', label: 'Elite' });
    await updateSettings(t.stores.settings, { colourMode: 'distance' });
  });

  it('each team’s default range follows Settings per screen', async () => {
    await updateSettings(t.stores.settings, { screenDefaults: { 'team-benchmark': '90' } });
    const v = await getTeamBenchmark(t.deps);
    expect(v.range).toBe('90');
    expect(v.metrics.every((m) => m.windowDays === 90)).toBe(true);
    await updateSettings(t.stores.settings, { screenDefaults: {} });
  });
});

describe('GET /api/benchmark/teams', () => {
  it('requires a session', async () => {
    expect((await t.app.inject({ url: '/api/benchmark/teams' })).statusCode).toBe(401);
  });

  it('returns the view as JSON and honours query parameters', async () => {
    const res = await t.app.inject({
      url: '/api/benchmark/teams?range=14&group=north&compare=0', cookies: t.cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<GridView>();
    expect(body.range).toBe('14');
    expect(body.rows.map((r) => r.teamName)).toEqual(['Aurora', 'Birch', 'Comet']);
    expect(body.rows[0]!.cells.every((c) => c.trend === null)).toBe(true);
  });

  it('rejects an unknown range with a 400', async () => {
    const res = await t.app.inject({ url: '/api/benchmark/teams?range=45', cookies: t.cookies });
    expect(res.statusCode).toBe(400);
  });
});
