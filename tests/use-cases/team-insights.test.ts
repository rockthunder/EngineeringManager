import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type {
  DrilldownView, EmTlView, GridView, OrgBenchmarkView, TlTeamView,
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

const drill = (team: string) => t.get<DrilldownView>(`/api/teams/${team}?range=30`);

describe('team stats: the plain numbers, with how they moved', () => {
  it('shows current and previous counts with a delta', async () => {
    const d = await drill('birch');
    expect(d.insights.stats.map((s) => s.key)).toEqual(['deployments', 'prs_merged', 'items_done', 'wip', 'incidents', 'bounced_items']);
    for (const s of d.insights.stats) {
      expect(s.deltaText, s.key).toMatch(/^(no change|[+−]\d+( \([+−]\d+%\))?)$/);
      expect(s.previousText).toBe(`was ${s.previous}`);
    }
    const deploys = d.insights.stats[0]!;
    expect(deploys.current).toBeGreaterThan(5);
    expect(deploys.direction).toBe(deploys.current > deploys.previous ? 'up' : deploys.current < deploys.previous ? 'down' : 'flat');
  });
});

describe('time in each workflow status', () => {
  it('lists statuses in workflow order with the mean time per finished item and the typical time when visited', async () => {
    const d = await drill('delta');
    const names = d.insights.statusTimes.map((s) => s.status);
    expect(names[0]).toBe('To Do');
    expect(names).toEqual(['To Do', 'In Progress', 'Blocked', 'In Review', 'Waiting for QA'].filter((n) => names.includes(n)));
    expect(d.insights.statusTimes.find((s) => s.status === 'In Progress')).toMatchObject({ statusClass: 'active' });
    expect(d.insights.statusTimes.every((s) => s.meanText.length > 0 && s.visitedShare > 0 && s.visitedShare <= 1)).toBe(true);
  });

  it('shows more waiting in a slow team than a fast one', async () => {
    const waiting = (d: DrilldownView) => d.insights.statusTimes.filter((s) => s.statusClass === 'waiting').reduce((a, s) => a + s.meanHours, 0);
    expect(waiting(await drill('delta'))).toBeGreaterThan(waiting(await drill('aurora')));
  });
});

describe('ticket bounce', () => {
  it('shows the bounce rate and where tickets bounce', async () => {
    const delta = await drill('delta');
    expect(delta.insights.bounce.rate).toBeGreaterThan(0.15);
    expect(delta.insights.bounce.transitions[0]).toMatchObject({ to: 'In Progress' });
    expect(['In Review', 'Waiting for QA']).toContain(delta.insights.bounce.transitions[0]!.from);
    const aurora = await drill('aurora');
    expect(aurora.insights.bounce.rate ?? 0).toBeLessThan(0.1);
  });

  it('is a graded metric in the grid and the glossary, with the bounce rate as its value', async () => {
    const grid = await t.get<GridView>('/api/benchmark/teams?range=30');
    const delta = grid.rows.find((r) => r.teamName === 'Delta')!.cells.find((c) => c.metricId === 'ticket_bounce_rate')!;
    expect(delta).toMatchObject({ status: 'graded', colour: 'red' });
    const glossary = await t.get<{ entries: { id: string; thresholds: { elite: string } | null }[] }>('/api/glossary');
    expect(glossary.entries.find((e) => e.id === 'ticket_bounce_rate')!.thresholds!.elite).toBe('5% or less');
  });
});

describe('what is in each column right now, and what has not moved', () => {
  it('counts items per status with their age, and lists those that have not moved', async () => {
    const d = await drill('delta');
    const f = d.insights.inFlight;
    expect(f.staleDays).toBe(5);
    expect(f.columns.length).toBeGreaterThan(1);
    expect(f.columns.every((c) => c.count > 0 && c.oldestHours >= 0)).toBe(true);
    expect(f.notMoved.length).toBeGreaterThan(0);
    expect(f.notMoved.every((n) => n.days >= 5)).toBe(true);
    expect(f.notMoved.every((n, i, a) => i === 0 || a[i - 1]!.days >= n.days)).toBe(true);
  });

  it('TL to Team lists not-moved tickets and shows time in the current status', async () => {
    const v = await t.get<TlTeamView>('/api/views/tl-team?team=delta');
    expect(v.insights.inFlight.notMoved.length).toBeGreaterThan(0);
    expect(v.ageing.items.every((i) => i.daysInStatus >= 0 && i.daysInStatus <= i.ageDays + 0.01)).toBe(true);
  });
});

describe('EM to TL', () => {
  it('has furthest-from-bar data for every team, and the team’s headline metrics colour coded with deltas', async () => {
    for (const team of ['aurora', 'birch', 'comet', 'delta', 'ember', 'fjord', 'garnet', 'harbour', 'juniper']) {
      const v = await t.get<EmTlView>(`/api/views/em-tl?team=${team}`);
      expect(v.furthestFromBar.length, team).toBeGreaterThan(0);
      expect(v.furthestFromBar.every((f) => f.cell.distance! < 0), team).toBe(true);
    }
    const v = await t.get<EmTlView>('/api/views/em-tl?team=garnet');
    expect(v.headline).toHaveLength(18);
    expect(v.headline.find((h) => h.header.id === 'pr_cycle_time')!.cell.trend!.deltaText).toMatch(/^[−+]\d+%$/);
    expect(v.insights.stats).toHaveLength(6);
    expect(v.atTheBar.every((a) => a.cell.distance === 0)).toBe(true);
  });
});

describe('deltas on every table where they make sense', () => {
  it('grid cells carry the movement and what it was', async () => {
    const grid = await t.get<GridView>('/api/benchmark/teams?range=30');
    const c = grid.rows.find((r) => r.teamName === 'Garnet')!.cells.find((x) => x.metricId === 'pr_cycle_time')!;
    expect(c.trend).toMatchObject({ judgement: 'improving' });
    expect(c.trend!.deltaText).toMatch(/^−\d+%$/);
    expect(c.trend!.previousText).toMatch(/^was /);
    const rate = grid.rows.find((r) => r.teamName === 'Garnet')!.cells.find((x) => x.metricId === 'change_failure_rate')!;
    expect(rate.trend!.deltaText).toMatch(/pts$/);
  });

  it('the org by-month table shows each month against the month before, and teams-at-bar counts show what they were', async () => {
    const org = await t.get<OrgBenchmarkView>('/api/benchmark/org?range=30');
    expect(org.months[0]!.cells[0]!.trend).toBeNull();
    expect(org.months[5]!.cells.some((c) => c.trend?.deltaText)).toBe(true);
    const a = org.atOrAbove.find((x) => x.metricId === 'pr_size')!;
    expect(typeof a.previousAtOrAbove).toBe('number');
  });

  it('drill-down metric cards carry deltas', async () => {
    const d = await drill('garnet');
    expect(d.metrics.find((m) => m.header.id === 'pr_cycle_time')!.cell.trend!.deltaText).toMatch(/^−\d+%$/);
  });
});
