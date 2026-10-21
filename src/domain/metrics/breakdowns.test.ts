import { describe, expect, it } from 'vitest';
import { DEFS, T0, d, deployment, events, h, incident, item, pr } from '../testing/fixtures';
import { buildContext } from './context';
import { cycleTimeScatter, investmentMix, leadTimeStages, prSizeDistribution } from './breakdowns';

const W = { from: T0, to: T0 + d(30) };
const ctx = (ev: ReturnType<typeof events>) => buildContext(ev, DEFS, W, 30);

describe('leadTimeStages: where does the time go?', () => {
  it('splits shipped changes into coding, pickup, review and deploy, as medians that add up', () => {
    const dep = (id: string, at: number) => deployment({ sourceId: id, at });
    const change = (id: string, o: { coding: number; pickup: number; review: number; wait: number }) => {
      const opened = T0 + h(100);
      const firstReviewAt = opened + h(o.pickup);
      return { id, opened, firstReviewAt, mergedAt: firstReviewAt + h(o.review), o };
    };
    const specs = [
      change('a', { coding: 10, pickup: 2, review: 6, wait: 30 }),
      change('b', { coding: 20, pickup: 4, review: 8, wait: 50 }),
      change('c', { coding: 30, pickup: 6, review: 10, wait: 70 }),
    ];
    const deployments = specs.map((s) => dep(s.id, s.mergedAt + h(s.o.wait)));
    const prs = specs.map((s) =>
      pr({
        firstCommitAt: s.opened - h(s.o.coding), openedAt: s.opened, firstReviewAt: s.firstReviewAt,
        mergedAt: s.mergedAt, deploymentId: s.id,
      }),
    );
    const ev = events({ deployments, pullRequests: prs });
    const stages = leadTimeStages(ev, ctx(ev));
    expect(stages.map((s) => s.stage)).toEqual(['coding', 'pickup', 'review', 'deploy']);
    expect(stages.map((s) => s.medianHours)).toEqual([20, 4, 8, 50]);
    expect(stages.every((s) => s.sampleSize === 3)).toBe(true);
  });

  it('ignores changes that were not shipped to production in the window or lack review times', () => {
    const ev = events({
      deployments: [deployment({ sourceId: 'x', at: T0 + d(40) })],
      pullRequests: [pr({ deploymentId: 'x' }), pr({ deploymentId: null })],
    });
    expect(leadTimeStages(ev, ctx(ev)).every((s) => s.medianHours === null && s.sampleSize === 0)).toBe(true);
  });
});

describe('prSizeDistribution', () => {
  it('counts PRs merged in the window into size buckets', () => {
    const merged = (lines: number) => pr({ openedAt: T0 + h(1), mergedAt: T0 + h(5), linesChanged: lines });
    const ev = events({ pullRequests: [merged(10), merged(60), merged(99), merged(100), merged(300), merged(700), merged(5000)] });
    const dist = prSizeDistribution(ev, ctx(ev));
    expect(dist.map((b) => [b.label, b.count])).toEqual([
      ['under 50', 1], ['50–99', 2], ['100–249', 1], ['250–499', 1], ['500–999', 1], ['1000+', 1],
    ]);
  });
});

describe('cycleTimeScatter', () => {
  it('has one point per item done in the window: the day it finished and its cycle time in days', () => {
    const done = (startH: number, endH: number) =>
      item([['To Do', 0], ['In Progress', h(startH)], ['Done', h(endH)]], { createdAt: T0 });
    const ev = events({ workItems: [done(24, 72), done(24, 24 + 24 * 5), item([['To Do', 0], ['In Progress', h(5)]])] });
    const pts = cycleTimeScatter(ev, ctx(ev));
    expect(pts.map((p) => p.days)).toEqual([2, 5]);
    expect(pts.map((p) => p.day)).toEqual(['2026-09-04', '2026-09-07']);
  });
});

describe('investmentMix', () => {
  it('shares done work by category, covering every category even when empty', () => {
    const done = (type: string) => item([['In Progress', 0], ['Done', h(5)]], { createdAt: T0 + d(1), type });
    const ev = events({ workItems: [done('Story'), done('Story'), done('Bug'), done('Chore')] });
    const mix = investmentMix(ev, ctx(ev));
    expect(mix.map((m) => [m.category, m.count, m.share])).toEqual([
      ['new_capability', 2, 0.5], ['maintenance', 1, 0.25], ['defect', 1, 0.25], ['tech_debt', 0, 0],
    ]);
  });
});

import { bounceTransitions, inFlightByStatus, statusTimes, teamStats } from './breakdowns';

describe('statusTimes: time spent in each workflow status', () => {
  const done = (steps: [string, number][], createdAt = T0 + d(1)) => item([['To Do', 0], ...steps], { createdAt });
  const ev = events({
    workItems: [
      done([['In Progress', h(24)], ['In Review', h(48)], ['Done', h(72)]]), // To Do 24, IP 24, Review 24
      done([['In Progress', h(12)], ['Blocked', h(36)], ['In Progress', h(60)], ['In Review', h(84)], ['Done', h(108)]]), // ToDo 12, IP 24+24, Blocked 24, Review 24
      item([['To Do', 0], ['In Progress', h(5)]], { createdAt: T0 + d(1) }), // not done: ignored
    ],
  });
  const rows = statusTimes(ev, buildContext(ev, DEFS, W, 30));
  const by = (s: string) => rows.find((r) => r.status === s)!;

  it('lists statuses in workflow order, excluding Done', () => {
    expect(rows.map((r) => r.status)).toEqual(['To Do', 'In Progress', 'Blocked', 'In Review']);
  });

  it('reports mean time per finished item (so the bar adds up) and the typical time when an item visits', () => {
    expect(by('To Do')).toMatchObject({ meanHours: 18, medianWhenVisited: 18, visitedShare: 1, items: 2 });
    expect(by('In Progress')).toMatchObject({ meanHours: 36, medianWhenVisited: 36 });
    expect(by('Blocked')).toMatchObject({ meanHours: 12, medianWhenVisited: 24, visitedShare: 0.5 });
    expect(by('In Review').meanHours).toBe(24);
    expect(rows.reduce((a, r) => a + r.meanHours, 0)).toBe((72 + 108) / 2);
  });

  it('carries the status class so queues and waits can be told from work', () => {
    expect(by('To Do').statusClass).toBe('todo');
    expect(by('Blocked').statusClass).toBe('waiting');
    expect(by('In Progress').statusClass).toBe('active');
  });
});

describe('bounceTransitions: where do tickets bounce?', () => {
  it('counts step-backs by from → to over items done in the window, with the share of items that bounced', () => {
    const done = (steps: [string, number][]) => item([['In Progress', 0], ...steps], { createdAt: T0 + d(1) });
    const ev = events({
      workItems: [
        done([['In Review', h(2)], ['In Progress', h(3)], ['In Review', h(4)], ['Done', h(6)]]),
        done([['In Review', h(2)], ['In Progress', h(3)], ['In Review', h(4)], ['In Progress', h(5)], ['Done', h(8)]]),
        done([['In Review', h(2)], ['Waiting for QA', h(3)], ['In Progress', h(4)], ['Done', h(8)]]),
        done([['In Review', h(2)], ['Done', h(5)]]),
      ],
    });
    const out = bounceTransitions(ev, ctx(ev));
    expect(out.items).toBe(4);
    expect(out.bouncedItems).toBe(3);
    expect(out.transitions).toEqual([
      { from: 'In Review', to: 'In Progress', count: 3 },
      { from: 'Waiting for QA', to: 'In Progress', count: 1 },
    ]);
  });
});

describe('inFlightByStatus: what is sitting in each column right now', () => {
  it('counts items per status with how long they have been there, and flags ones that have not moved', () => {
    const now = T0 + d(20);
    const ev = events({
      workItems: [
        item([['In Progress', 0]], { createdAt: now - d(10) }),
        item([['In Progress', 0], ['In Review', d(7)]], { createdAt: now - d(9) }),
        item([['In Progress', 0], ['Blocked', d(1)]], { createdAt: now - d(12) }),
        item([['In Progress', 0], ['Done', h(5)]], { createdAt: now - d(15) }),
      ],
    });
    const c = buildContext(ev, DEFS, { from: T0, to: now }, 30);
    const out = inFlightByStatus(ev, c, now, 5);
    expect(out.columns.map((x) => [x.status, x.count])).toEqual([['In Progress', 1], ['Blocked', 1], ['In Review', 1]]);
    expect(out.columns.find((x) => x.status === 'In Progress')!.oldestHours).toBe(10 * 24);
    expect(out.notMoved.map((x) => [x.status, Math.round(x.daysSinceMove)])).toEqual([['Blocked', 11], ['In Progress', 10]]);
    expect(out.notMoved.some((x) => x.status === 'In Review')).toBe(false); // moved 2 days ago
  });
});

describe('teamStats: the plain numbers and how they moved', () => {
  it('counts activity in the window and the previous window of the same length', () => {
    const prev = { from: T0 - d(30), to: T0 };
    const ev = events({
      deployments: [deployment({ at: T0 + h(5) }), deployment({ at: T0 + h(9) }), deployment({ at: T0 - h(5) }), deployment({ at: T0 + h(7), environment: 'staging' })],
      pullRequests: [pr({ openedAt: T0 + h(1), mergedAt: T0 + h(4) }), pr({ openedAt: T0 - d(2), mergedAt: T0 - d(1) }), pr({ openedAt: T0 - d(3), mergedAt: T0 - d(2) })],
      incidents: [incident({ startedAt: T0 + h(3) })],
    });
    const stats = teamStats(ev, ctx(ev), buildContext(ev, DEFS, prev, 30));
    const s = (k: string) => stats.find((x) => x.key === k)!;
    expect(s('deployments')).toMatchObject({ current: 2, previous: 1 });
    expect(s('prs_merged')).toMatchObject({ current: 1, previous: 2 });
    expect(s('incidents')).toMatchObject({ current: 1, previous: 0 });
  });
});
