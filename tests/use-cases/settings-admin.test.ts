import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type {
  BenchmarkConfigView, DataSourcesView, GridView, SettingsView, TeamAdminView,
} from '../../src/application/views/contract';
import { cloneDatabase, type TestDb } from '../support/postgres';
import { startApp, type TestApp } from '../support/app';

let db: TestDb;
let t: TestApp;

beforeAll(async () => {
  db = await cloneDatabase(inject('pgAdminUrl'), 'seeded');
  t = await startApp(db);
});
afterAll(async () => {
  await t.app.close();
  await db.drop();
});

const grid = (q = 'range=30') => t.get<GridView>(`/api/benchmark/teams?${q}`);
const cell = (g: GridView, team: string, metric: string) => g.rows.find((r) => r.teamName === team)!.cells.find((c) => c.metricId === metric)!;
const runs = async () => (await t.stores.sync.listRuns()).length;

describe('every admin route needs a session', () => {
  it.each(['/api/admin/settings', '/api/admin/benchmarks', '/api/admin/teams', '/api/admin/data-sources', '/api/admin/users'])('%s', async (url) => {
    expect((await t.app.inject({ url })).statusCode).toBe(401);
  });
});

describe('journey: raising the bar creates a new version and recolours cells without fetching data', () => {
  it('shows the current versions and thresholds in words', async () => {
    const c = await t.get<BenchmarkConfigView>('/api/admin/benchmarks');
    expect(c.inForce).toBe(2);
    expect(c.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(c.versions[1]!.changes).toEqual(['Lead time for changes bar: High → Elite']);
    const lt = c.metrics.find((m) => m.id === 'lead_time')!;
    expect(lt).toMatchObject({ bar: 'elite', direction: 'lower' });
    expect(lt.text['product']).toEqual({ elite: 'under 1 day', high: 'under 7 days', medium: 'under 30 days' });
    expect(c.metrics.find((m) => m.id === 'deployment_frequency')!.overridden).toEqual({ product: false, platform: true });
    expect(c.metrics.find((m) => m.id === 'throughput')).toBeUndefined();
    expect(c.minEffectiveFrom).toBe('2026-07-22');
  });

  it('publishing Bar v3 changes Birch’s PR cycle time from green to amber, with no new sync', async () => {
    const before = grid();
    expect(cell(await before, 'Birch', 'pr_cycle_time')).toMatchObject({ colour: 'green', label: 'At bar' });
    const syncRuns = await runs();

    const res = await t.send<BenchmarkConfigView>('POST', '/api/admin/benchmarks/versions', {
      change: { bars: { org: { pr_cycle_time: 'elite' } } }, effectiveFrom: '2026-10-21',
    });
    expect(res.status).toBe(200);
    expect(res.body.latest).toEqual({ number: 3, effectiveFrom: '2026-10-21' });
    expect(res.body.versions[2]!.changes).toEqual(['PR cycle time bar: High → Elite']);

    const after = await grid();
    expect(after.benchmarkVersion).toBe(3);
    expect(cell(after, 'Birch', 'pr_cycle_time')).toMatchObject({ colour: 'amber', label: 'Near bar', distance: -1 });
    expect(cell(after, 'Aurora', 'pr_cycle_time')).toMatchObject({ colour: 'green', label: 'At bar' }); // Elite is now exactly the bar
    expect(await runs()).toBe(syncRuns); // nothing was fetched
  });

  it('keeps old history graded against the bar in force then, until today’s bar is asked for', async () => {
    const june = await grid('range=custom&from=2026-06-01&to=2026-06-30');
    expect(june.benchmarkVersion).toBe(1);
    expect(cell(june, 'Birch', 'pr_cycle_time').label).toBe('At bar');
    const regraded = await grid('range=custom&from=2026-06-01&to=2026-06-30&version=today');
    expect(regraded.benchmarkVersion).toBe(3);
    expect(cell(regraded, 'Birch', 'pr_cycle_time').label).toBe('Near bar');
  });

  it('edits thresholds per profile: loosening Platform deploy frequency changes Ember', async () => {
    const res = await t.send<BenchmarkConfigView>('POST', '/api/admin/benchmarks/versions', {
      change: { thresholds: { platform: { deployment_frequency: { elite: 0.6, high: 0.3, medium: 0.1 } } } }, effectiveFrom: '2026-10-22',
    });
    expect(res.status).toBe(200);
    expect(res.body.latest.number).toBe(4);
    expect(res.body.inForce).toBe(3); // dated tomorrow: not in force yet
    expect(res.body.versions[3]!.changes.join()).toMatch(/Deployment frequency thresholds \(platform\)/);
    expect((await grid()).benchmarkVersion).toBe(3);
  });

  it('refuses bad changes with a reason: wrong order, same date, nothing changed, unknown metric', async () => {
    const post = (change: unknown, effectiveFrom?: string) =>
      t.send<{ error: string }>('POST', '/api/admin/benchmarks/versions', { change, ...(effectiveFrom ? { effectiveFrom } : {}) });
    expect((await post({ thresholds: { product: { lead_time: { elite: 100, high: 10, medium: 500 } } } }, '2026-11-01')).body.error).toMatch(/Elite must be better than High/);
    expect((await post({ bars: { org: { lead_time: 'high' } } }, '2026-10-22')).body.error).toMatch(/after 2026-10-22/);
    expect((await post({ bars: { org: { lead_time: 'elite' } } }, '2026-11-01')).body.error).toMatch(/Nothing changed/);
    expect((await post({ bars: { org: { throughput: 'high' } } }, '2026-11-01')).body.error).toMatch(/not graded/);
    expect((await post({ bars: { org: { lead_time: 'high' } } }, 'soon')).status).toBe(400);
    expect((await t.get<BenchmarkConfigView>('/api/admin/benchmarks')).latest.number).toBe(4);
  });
});

describe('journey: a reorg moves repos between teams with an effective date', () => {
  it('moves harbour-core to Juniper from 1 September: Harbour keeps its history, Juniper gets the later events', async () => {
    const beforeMove = await grid('range=custom&from=2026-08-01&to=2026-08-31');
    const harbourBefore = cell(beforeMove, 'Harbour', 'pr_cycle_time').sampleSize;
    const juniperBefore = cell(beforeMove, 'Juniper', 'pr_cycle_time').sampleSize;
    const septBefore = await grid('range=custom&from=2026-09-01&to=2026-09-30');
    const juniperSeptBefore = cell(septBefore, 'Juniper', 'pr_cycle_time').sampleSize;
    const harbourSeptBefore = cell(septBefore, 'Harbour', 'pr_cycle_time').sampleSize;

    const res = await t.send<TeamAdminView>('POST', '/api/admin/mappings', {
      kind: 'repo', ref: 'harbour-core', toTeam: 'juniper', effectiveFrom: '2026-09-01',
    });
    expect(res.status).toBe(200);
    const history = res.body.teams.flatMap((x) => x.mappings.filter((m) => m.ref === 'harbour-core').map((m) => [x.id, m.effectiveFrom, m.effectiveTo]));
    expect(history).toEqual([['harbour', '2025-10-21', '2026-09-01'], ['juniper', '2026-09-01', null]]);
    expect(res.body.refs.repo.find((r) => r.ref === 'harbour-core')).toMatchObject({ owner: 'Juniper', ownerId: 'juniper' });

    const afterAug = await grid('range=custom&from=2026-08-01&to=2026-08-31');
    expect(cell(afterAug, 'Harbour', 'pr_cycle_time').sampleSize).toBe(harbourBefore); // history stays
    expect(cell(afterAug, 'Juniper', 'pr_cycle_time').sampleSize).toBe(juniperBefore);
    const afterSept = await grid('range=custom&from=2026-09-01&to=2026-09-30');
    expect(cell(afterSept, 'Juniper', 'pr_cycle_time').sampleSize).toBeGreaterThan(juniperSeptBefore);
    expect(cell(afterSept, 'Harbour', 'pr_cycle_time').sampleSize).toBeLessThan(harbourSeptBefore);
  });

  it('explains why a bad move is refused', async () => {
    const bad = (body: object) => t.send<{ error: string }>('POST', '/api/admin/mappings', body);
    expect((await bad({ kind: 'repo', ref: 'harbour-core', toTeam: 'juniper', effectiveFrom: '2026-10-01' })).body.error).toMatch(/already with that team/);
    expect((await bad({ kind: 'repo', ref: 'harbour-core', toTeam: 'birch', effectiveFrom: '2026-08-01' })).body.error).toMatch(/later mapping/);
    expect((await bad({ kind: 'repo', ref: 'harbour-web', toTeam: 'nobody', effectiveFrom: '2026-10-01' })).body.error).toMatch(/No team/);
  });
});

describe('journey: teams, groups and archiving', () => {
  it('creates a team and a group, and assigns a profile', async () => {
    const g = await t.send<TeamAdminView>('POST', '/api/admin/groups', { name: 'East' });
    expect(g.body.groups.map((x) => x.id)).toContain('east');
    const res = await t.send<TeamAdminView>('POST', '/api/admin/teams', { name: 'Kestrel', profileId: 'platform', groupId: 'east', headcount: 4 });
    expect(res.status).toBe(200);
    expect(res.body.teams.find((x) => x.id === 'kestrel')).toMatchObject({ profile: 'platform', groupName: 'East', archived: false });
    const bad = await t.send<{ error: string }>('POST', '/api/admin/teams', { name: 'Kestrel', profileId: 'platform', groupId: 'east', headcount: 4 });
    expect(bad.status).toBe(400);
    const moved = await t.send<TeamAdminView>('PUT', '/api/admin/teams/kestrel', { profileId: 'product', headcount: 5 });
    expect(moved.body.teams.find((x) => x.id === 'kestrel')).toMatchObject({ profile: 'product', headcount: 5 });
  });

  it('archiving hides the team from grids but keeps its history and the org totals', async () => {
    const before = await grid();
    const orgBefore = before.org.cells.find((c) => c.metricId === 'pr_cycle_time')!.value;
    await t.send('PUT', '/api/admin/teams/delta', { archived: true });
    const after = await grid();
    expect(after.rows.map((r) => r.teamName)).not.toContain('Delta');
    expect(after.org.cells.find((c) => c.metricId === 'pr_cycle_time')!.value).toBe(orgBefore); // pooled events unchanged
    const drill = await t.app.inject({ url: '/api/teams/delta', cookies: t.cookies });
    expect(drill.statusCode).toBe(200); // history still viewable
    expect(drill.json().team.archived).toBe(true);
    await t.send('PUT', '/api/admin/teams/delta', { archived: false });
    expect((await grid()).rows.map((r) => r.teamName)).toContain('Delta');
  });
});

describe('journey: time windows and screen defaults', () => {
  it('changing a screen’s default range in Settings changes what it opens on', async () => {
    expect((await grid('')).range).toBe('30');
    const res = await t.send<SettingsView>('PUT', '/api/admin/settings', { screenDefaults: { 'team-benchmark': '90' } });
    expect(res.body.screenDefaults).toEqual({ 'team-benchmark': '90' });
    const opened = await grid('');
    expect(opened.range).toBe('90');
    expect(opened.metrics.every((m) => m.windowDays === 90)).toBe(true);
    const org = await t.get<{ range: string }>('/api/benchmark/org');
    expect(org.range).toBe('30'); // other screens keep the global default
    await t.send('PUT', '/api/admin/settings', { screenDefaults: {}, defaultRange: '14' });
    expect((await grid('')).range).toBe('14');
    await t.send('PUT', '/api/admin/settings', { defaultRange: '30' });
  });

  it('keeps the survey minimum at 3 or more, and edits colours', async () => {
    expect((await t.send<{ error: string }>('PUT', '/api/admin/settings', { surveyMinResponses: 2 })).body.error).toMatch(/never below 3/);
    const ok = await t.send<SettingsView>('PUT', '/api/admin/settings', { surveyMinResponses: 5, colours: { blue: '#112233' } });
    expect(ok.body).toMatchObject({ surveyMinResponses: 5 });
    expect(ok.body.colours['blue']).toBe('#112233');
    expect(ok.body.colours['green']).toBe('#2e9e5b');
    expect((await grid()).colours['blue']).toBe('#112233');
    await t.send('PUT', '/api/admin/settings', { surveyMinResponses: 4, colours: { blue: '#2f6fed' } });
  });
});

describe('journey: data sources, definitions and Run now', () => {
  it('shows per-stream status and the poll schedule', async () => {
    const d = await t.get<DataSourcesView>('/api/admin/data-sources');
    expect(d).toMatchObject({ simulated: true, watermarkDay: '2026-10-21', pollEveryHours: 6, backfillDays: 365 });
    expect(d.sources[0]!.streams.map((s) => s.stream)).toEqual(['deployments', 'pull_requests', 'work_items', 'sprints', 'incidents']);
    expect(d.sources[0]!.streams.every((s) => s.status === 'succeeded' && s.cursor !== null)).toBe(true);
  });

  it('Run now emits the next simulated day: data-as-of and "today" move forward, only new events arrive', async () => {
    const before = await t.get<DataSourcesView>('/api/admin/data-sources');
    const res = await t.send<DataSourcesView>('POST', '/api/admin/sync/run', {});
    expect(res.status).toBe(200);
    expect(res.body.watermarkDay).toBe('2026-10-22');
    expect(res.body.today).toBe('2026-10-22');
    expect(res.body.dataAsOf! > before.dataAsOf!).toBe(true);
    expect(res.body.recentRuns.slice(0, 5).every((r) => r.mode === 'incremental' && r.status === 'succeeded')).toBe(true);
    expect((await grid()).endDay).toBe('2026-10-22');
  });

  it('changing which environment counts as production recomputes immediately, with no new sync', async () => {
    const before = await grid();
    expect(cell(before, 'Birch', 'deployment_frequency').value).toBeGreaterThan(1);
    const syncRuns = await runs();
    const defs = (await t.get<DataSourcesView>('/api/admin/data-sources')).definitions;
    const res = await t.send<DataSourcesView>('PUT', '/api/admin/data-sources/definitions', { ...defs, productionEnvironment: 'staging' });
    expect(res.status).toBe(200);
    expect(cell(await grid(), 'Birch', 'deployment_frequency').value).toBe(0);
    expect(await runs()).toBe(syncRuns);
    await t.send('PUT', '/api/admin/data-sources/definitions', defs);
    expect(cell(await grid(), 'Birch', 'deployment_frequency').value).toBeGreaterThan(1);
  });

  it('validates definitions', async () => {
    const defs = (await t.get<DataSourcesView>('/api/admin/data-sources')).definitions;
    const bad = (d: object) => t.send<{ error: string }>('PUT', '/api/admin/data-sources/definitions', d);
    expect((await bad({ ...defs, productionEnvironment: ' ' })).status).toBe(400);
    expect((await bad({ ...defs, statusClasses: { 'To Do': 'todo' } })).body.error).toMatch(/done/);
    expect((await bad({ ...defs, statusClasses: { Done: 'finished' } })).body.error).toMatch(/not todo, active, waiting or done/);
  });
});

describe('users', () => {
  it('lists the single admin and changes the password only with the current one', async () => {
    expect((await t.get<{ users: { username: string }[] }>('/api/admin/users')).users).toEqual([{ username: 'admin', role: 'admin' }]);
    expect((await t.send('POST', '/api/admin/account/password', { current: 'wrong', next: 'longenough1' })).status).toBe(403);
    expect((await t.send('POST', '/api/admin/account/password', { current: 'admin', next: 'short' })).status).toBe(400);
    expect((await t.send('POST', '/api/admin/account/password', { current: 'admin', next: 'longenough1' })).status).toBe(200);
    const relog = await t.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'admin', password: 'longenough1' } });
    expect(relog.statusCode).toBe(200);
    expect((await t.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'admin', password: 'admin' } })).statusCode).toBe(401);
  });
});
