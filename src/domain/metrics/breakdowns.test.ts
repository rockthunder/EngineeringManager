import { describe, expect, it } from 'vitest';
import { DEFS, T0, d, deployment, events, h, item, pr } from '../testing/fixtures';
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
