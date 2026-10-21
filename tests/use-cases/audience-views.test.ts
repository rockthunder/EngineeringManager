import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type {
  EmDirectorView, EmTlView, ExecsView, MbrView, TlTeamView,
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

const get = async <T>(url: string): Promise<T> => {
  const res = await t.app.inject({ url, cookies: t.cookies });
  expect(res.statusCode, url).toBe(200);
  return res.json<T>();
};

describe('Eng MBR', () => {
  it('shows the five DORA metrics, new capability share and DevEx, each with month and quarter movement and 12 months of trend', async () => {
    const v = await get<MbrView>('/api/views/eng-mbr');
    expect(v.metrics.map((m) => m.metricId)).toEqual([
      'deployment_frequency', 'lead_time', 'change_failure_rate', 'failed_deployment_recovery_time',
      'deployment_rework_rate', 'new_capability_share', 'devex_score',
    ]);
    for (const m of v.metrics) {
      expect(m.series, m.metricId).toHaveLength(12);
      expect(m.monthOnMonth, m.metricId).not.toBeNull();
      expect(m.quarterOnQuarter, m.metricId).not.toBeNull();
    }
    expect(v.benchmarkVersion).toBe(2);
  });
});

describe('Director to Execs', () => {
  it('has six headline metrics, each vs last quarter, with how many teams are at the bar (a count)', async () => {
    const v = await get<ExecsView>('/api/views/director-execs');
    expect(v.headlines.map((h) => h.metricId)).toEqual([
      'deployment_frequency', 'lead_time', 'change_failure_rate', 'failed_deployment_recovery_time', 'new_capability_share', 'devex_score',
    ]);
    for (const h of v.headlines) {
      expect(h.cell.trend, h.metricId).not.toBeNull();
      expect(h.atOrAbove!.text).toMatch(/^\d+ of \d+ teams at or above the bar$/);
    }
    expect(JSON.stringify(v)).not.toMatch(/Aurora|Delta|Harbour/);
  });
});

describe('EM to Director', () => {
  it('filters the grid to the EM’s group with trend against each team’s own baseline', async () => {
    const v = await get<EmDirectorView>('/api/views/em-director?group=central');
    expect(v.selectedGroup).toBe('central');
    expect(v.rows.map((r) => r.teamName)).toEqual(['Delta', 'Ember', 'Fjord']);
    expect(v.rows[0]!.cells.some((c) => c.trend !== null)).toBe(true);
  });

  it('defaults to the first group and 404s for an unknown one', async () => {
    expect((await get<EmDirectorView>('/api/views/em-director')).selectedGroup).toBe('central');
    expect((await t.app.inject({ url: '/api/views/em-director?group=nope', cookies: t.cookies })).statusCode).toBe(404);
  });
});

describe('EM to TL', () => {
  it('frames the team as furthest from bar and most improved', async () => {
    const delta = await get<EmTlView>('/api/views/em-tl?team=delta');
    expect(delta.team.name).toBe('Delta');
    expect(delta.furthestFromBar).toHaveLength(3);
    expect(delta.furthestFromBar[0]!.cell.distance).toBeLessThanOrEqual(delta.furthestFromBar[2]!.cell.distance!);
    expect(delta.furthestFromBar[0]!.name).toBe('Lead time for changes');

    const garnet = await get<EmTlView>('/api/views/em-tl?team=garnet');
    expect(garnet.mostImproved.length).toBeGreaterThan(0);
    expect(garnet.mostImproved.every((m) => m.cell.trend!.judgement === 'improving')).toBe(true);
    expect(garnet.teams).toHaveLength(10);
  });

  it('shows no furthest-from-bar items for a team that is above the bar everywhere', async () => {
    const aurora = await get<EmTlView>('/api/views/em-tl?team=aurora');
    expect(aurora.furthestFromBar.every((f) => f.cell.distance! < 0)).toBe(true);
  });
});

describe('TL to Team', () => {
  it('lists what is stuck right now against bar lines', async () => {
    const v = await get<TlTeamView>('/api/views/tl-team?team=delta');
    expect(v.team.name).toBe('Delta');
    expect(v.ageing.thresholdDays).toBe(14);
    expect(v.ageing.items.length).toBeGreaterThan(0);
    expect(v.ageing.items.every((i, k, a) => k === 0 || a[k - 1]!.ageDays >= i.ageDays)).toBe(true);
    expect(v.ageing.items[0]).toMatchObject({ aged: true });
    expect(v.ageing.bar).toMatch(/under 20% .*\(High\)|under 20%/);
    expect(v.waitingForReview.bar).toBe('under 8 h (High)');
    expect(v.prSizes.bar).toBe('under 250 lines (High)');
    expect(v.prSizes.prs.length).toBeGreaterThan(0);
    expect(v.prSizes.prs.every((p) => p.overBar === (p.lines >= 250))).toBe(true);
    expect(v.sprint).toMatchObject({ committed: expect.any(Number) });
    expect(v.sprint!.daysLeft).toBeGreaterThanOrEqual(0);
  });

  it('has no grades or colours at all: lists and bar lines only', async () => {
    const v = await get<TlTeamView>('/api/views/tl-team?team=birch');
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/"colour"|"grade"|"band"/);
  });

  it('item keys and PR ids carry no person: only keys, repos and numbers', async () => {
    const v = await get<TlTeamView>('/api/views/tl-team?team=comet');
    expect(JSON.stringify(v)).not.toMatch(/author|assignee|reviewer|email/i);
  });

  it('rejects an unknown view name', async () => {
    expect((await t.app.inject({ url: '/api/views/nope', cookies: t.cookies })).statusCode).toBe(404);
  });
});
