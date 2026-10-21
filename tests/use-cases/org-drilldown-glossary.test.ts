import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { getGlossary } from '../../src/application/use-cases/glossary';
import { getOrgBenchmark } from '../../src/application/use-cases/org-benchmark';
import { getTeamBenchmark } from '../../src/application/use-cases/team-benchmark';
import { getTeamDrilldown } from '../../src/application/use-cases/team-drilldown';
import type { DrilldownView, GlossaryView, OrgBenchmarkView } from '../../src/application/views/contract';
import { REGISTRY } from '../../src/domain/metrics/registry';
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

describe('org benchmark', () => {
  let org: OrgBenchmarkView;
  beforeAll(async () => {
    org = await getOrgBenchmark(t.deps, { range: { range: '30' } });
  });

  it('shows the whole-org row and twelve months of org cells, current month to date', () => {
    expect(org.org.cells).toHaveLength(18);
    expect(org.months).toHaveLength(12);
    expect(org.months[0]!.label).toBe('Nov 2025');
    expect(org.months[11]!.label).toBe('Oct 2026 (to date)');
    for (const m of org.months) expect(m.cells).toHaveLength(18);
  });

  it('counts teams at or above the bar per metric, with no team names anywhere', async () => {
    const grid = await getTeamBenchmark(t.deps, { range: { range: '30' } });
    const idx = grid.metrics.findIndex((m) => m.id === 'pr_size');
    const graded = grid.rows.map((r) => r.cells[idx]!).filter((c) => c.status === 'graded');
    const expected = graded.filter((c) => c.distance! >= 0).length;
    const got = org.atOrAbove.find((a) => a.metricId === 'pr_size')!;
    expect(got).toMatchObject({ atOrAbove: expected, graded: graded.length });
    expect(got.text).toBe(`${expected} of ${graded.length} teams at or above the bar`);
    expect(org.atOrAbove.find((a) => a.metricId === 'throughput')).toBeUndefined();
    expect(JSON.stringify(org)).not.toMatch(/Aurora|Birch|Comet|Delta|Ember|Fjord|Garnet|Harbour|Iris|Juniper/);
  });

  it('grades each month against the bar in force then, or today’s bar on request', async () => {
    const june = org.months.find((m) => m.label === 'Jun 2026')!;
    const oct = org.months[11]!;
    const lt = (cells: typeof june.cells) => cells.find((c) => c.metricId === 'lead_time')!;
    expect(lt(june.cells).tooltip).toMatch(/bar is under 7 days \(High\)/);
    expect(lt(oct.cells).tooltip).toMatch(/bar is under 1 day \(Elite\)/);
    const today = await getOrgBenchmark(t.deps, { range: { range: '30' }, version: 'today' });
    expect(lt(today.months.find((m) => m.label === 'Jun 2026')!.cells).tooltip).toMatch(/\(Elite\)/);
    expect(lt(today.months.find((m) => m.label === 'Jun 2026')!.cells).valueText).toBe(lt(june.cells).valueText);
  });
});

describe('team drill-down', () => {
  const drill = (teamId: string, metric?: string) => getTeamDrilldown(t.deps, { teamId, range: { range: '30' }, metric: metric ?? null });
  const biggest = (d: DrilldownView) =>
    [...d.breakdowns.leadTimeStages].sort((a, b) => (b.medianHours ?? 0) - (a.medianHours ?? 0))[0]!.stage;

  it('shows every metric with a trend series and the bar as a line', async () => {
    const d = await drill('birch', 'lead_time');
    expect(d.team).toMatchObject({ name: 'Birch', profile: 'product', headcount: 6 });
    expect(d.focusMetric).toBe('lead_time');
    expect(d.metrics).toHaveLength(18);
    const lt = d.metrics.find((m) => m.header.id === 'lead_time')!;
    expect(lt.series).toHaveLength(12);
    expect(lt.bar).toEqual({ level: 'Elite', value: 24, text: 'under 1 day' });
    expect(lt.counterpart).toEqual({ id: 'deployment_rework_rate', name: 'Deployment rework rate' });
    expect(d.metrics.find((m) => m.header.id === 'throughput')!.bar).toBeNull();
  });

  it('answers "where does the time go": Fjord waits to deploy, Delta spends it coding', async () => {
    expect(biggest(await drill('fjord'))).toBe('deploy');
    expect(biggest(await drill('delta'))).toBe('coding');
    const fjord = await drill('fjord');
    expect(fjord.breakdowns.leadTimeStages.map((s) => s.label)).toEqual(['Coding', 'Waiting for review', 'In review', 'Waiting to deploy']);
  });

  it('includes PR size distribution, cycle-time scatter and investment mix', async () => {
    const d = await drill('delta');
    expect(d.breakdowns.prSize).toHaveLength(6);
    expect(d.breakdowns.prSize.reduce((a, b) => a + b.count, 0)).toBeGreaterThan(0);
    expect(d.breakdowns.cycleTime.length).toBeGreaterThan(3);
    expect(d.breakdowns.cycleTime.every((p) => p.days > 0)).toBe(true);
    expect(d.breakdowns.investment.map((m) => m.label)).toEqual(['New capability', 'Maintenance', 'Defects', 'Tech debt']);
    expect(d.breakdowns.investment.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 6);
  });

  it('shows Juniper’s partial history: series are empty before the team existed', async () => {
    const d = await drill('juniper');
    const pr = d.metrics.find((m) => m.header.id === 'pr_cycle_time')!;
    expect(pr.series.slice(0, 6).every((p) => p.value === null)).toBe(true);
    expect(pr.series[11]!.value).not.toBeNull();
  });

  it('404s for an unknown team over HTTP', async () => {
    const res = await t.app.inject({ url: '/api/teams/nobody', cookies: t.cookies });
    expect(res.statusCode).toBe(404);
  });
});

describe('glossary', () => {
  let g: GlossaryView;
  beforeAll(async () => {
    g = (await t.app.inject({ url: '/api/glossary', cookies: t.cookies })).json<GlossaryView>();
  });

  it('opens with the principles and states the org aggregation rule', () => {
    expect(g.principles.map((p) => p.title)).toContain('Team level only');
    expect(g.aggregationRule).toMatch(/pooled together, not by averaging team results/);
  });

  it('has an entry for every registered metric and nothing else (generated from the registry)', () => {
    expect(g.entries.map((e) => e.id).sort()).toEqual(REGISTRY.map((m) => m.id).sort());
    expect(getGlossary().entries).toHaveLength(18);
  });

  it('states thresholds in words, the aggregation rule with an example, and the counterpart', () => {
    const lt = g.entries.find((e) => e.id === 'lead_time')!;
    expect(lt.thresholds).toEqual({ elite: 'under 1 day', high: 'under 7 days', medium: 'under 30 days', low: 'anything worse' });
    expect(lt.aggregation.example).toMatch(/Pooled median/);
    expect(g.entries.find((e) => e.id === 'throughput')).toMatchObject({ thresholds: null, graded: false });
    expect(g.entries.find((e) => e.id === 'deployment_frequency')!.minSample).toBe('14 days of data');
  });

  it('covers every metric shown on the team benchmark screen', async () => {
    const grid = await getTeamBenchmark(t.deps, { range: { range: '30' } });
    const ids = new Set(g.entries.map((e) => e.id));
    for (const m of grid.metrics) expect(ids.has(m.id)).toBe(true);
  });
});
