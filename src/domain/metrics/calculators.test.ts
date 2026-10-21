import { describe, expect, it } from 'vitest';
import {
  DEFS, T0, d, deployment, events, h, incident, item, pr, response, sprint,
} from '../testing/fixtures';
import type { EventSet } from '../events/types';
import { finalize } from './aggregation';
import { buildContext } from './context';
import { REGISTRY_BY_ID } from './registry';
import type { MetricId } from './types';

const W = { from: T0, to: T0 + d(30) };

function run(id: MetricId, ev: EventSet, coverage = 30, all: EventSet = ev) {
  const ctx = buildContext(all, DEFS, W, coverage);
  const m = REGISTRY_BY_ID[id].measure(ev, ctx);
  return { value: finalize(m), sampleSize: m.sampleSize, m };
}

const inside = (n: number) => T0 + h(n);

describe('deployment_frequency', () => {
  it('counts production deploys in the window per week; sample size is covered days', () => {
    const ev = events({
      deployments: [
        ...Array.from({ length: 6 }, (_, i) => deployment({ at: inside(i * 24 + 1) })),
        deployment({ at: inside(5), environment: 'staging' }),
        deployment({ at: T0 - h(1) }),
        deployment({ at: W.to }),
      ],
    });
    const r = run('deployment_frequency', ev, 28);
    expect(r.value).toBeCloseTo(6 / (28 / 7), 6); // rate is over the days the team was mapped
    expect(r.sampleSize).toBe(28);
  });
});

describe('lead_time', () => {
  it('is first commit to production deploy, in hours, median over changes deployed in window', () => {
    const d1 = deployment({ sourceId: 'd1', at: inside(10) });
    const d2 = deployment({ sourceId: 'd2', at: inside(30) });
    const d3 = deployment({ sourceId: 'd3', at: inside(50) });
    const dStage = deployment({ sourceId: 'ds', at: inside(20), environment: 'staging' });
    const dOut = deployment({ sourceId: 'dout', at: W.to + h(5) });
    const ev = events({
      deployments: [d1, d2, d3, dStage, dOut],
      pullRequests: [
        pr({ firstCommitAt: T0, deploymentId: 'd1' }),
        pr({ firstCommitAt: T0, deploymentId: 'd2' }),
        pr({ firstCommitAt: T0, deploymentId: 'd3' }),
        pr({ firstCommitAt: T0, deploymentId: 'ds' }),
        pr({ firstCommitAt: T0, deploymentId: 'dout' }),
        pr({ firstCommitAt: T0, deploymentId: null }),
      ],
    });
    const r = run('lead_time', ev);
    expect(r.value).toBe(30);
    expect(r.sampleSize).toBe(3);
  });
});

describe('PR metrics (PRs merged in window)', () => {
  const ev = events({
    pullRequests: [
      pr({ openedAt: inside(1), firstReviewAt: inside(2), mergedAt: inside(11), linesChanged: 50 }),
      pr({ openedAt: inside(1), firstReviewAt: inside(4), mergedAt: inside(21), linesChanged: 150 }),
      pr({ openedAt: inside(1), firstReviewAt: inside(6), mergedAt: inside(31), linesChanged: 400 }),
      pr({ openedAt: inside(1), firstReviewAt: null, mergedAt: null, linesChanged: 9999 }),
      pr({ openedAt: T0 - h(100), firstReviewAt: T0 - h(99), mergedAt: T0 - h(50), linesChanged: 9999 }),
    ],
  });

  it('pr_cycle_time: opened → merged, median hours', () => {
    expect(run('pr_cycle_time', ev).value).toBe(20);
    expect(run('pr_cycle_time', ev).sampleSize).toBe(3);
  });
  it('pr_pickup_time: opened → first review, median hours', () => {
    expect(run('pr_pickup_time', ev).value).toBe(3);
  });
  it('pr_size: median lines changed', () => {
    expect(run('pr_size', ev).value).toBe(150);
  });
});

describe('work item metrics', () => {
  const t = (...a: [string, number][]) => a;
  const ev = events({
    workItems: [
      item(t(['To Do', 0], ['In Progress', h(24)], ['Done', h(24) + d(2)]), { createdAt: T0 }),
      item(t(['To Do', 0], ['In Progress', h(24)], ['Done', h(24) + d(4)]), { createdAt: T0 }),
      item(t(['To Do', 0], ['In Progress', h(24)], ['Done', h(24) + d(6)]), { createdAt: T0 }),
      item(t(['To Do', 0], ['In Progress', h(24)]), { createdAt: T0 }), // not done
    ],
  });

  it('work_item_cycle_time: In Progress → Done, median days', () => {
    const r = run('work_item_cycle_time', ev);
    expect(r.value).toBe(4);
    expect(r.sampleSize).toBe(3);
  });

  it('flow_efficiency: active time over cycle time, pooled across items', () => {
    const a = item(
      t(['In Progress', 0], ['Blocked', h(24)], ['In Progress', h(48)], ['Done', h(72)]),
      { createdAt: T0 + d(1) },
    ); // 48 active / 72
    const b = item(t(['In Progress', 0], ['Done', h(24)]), { createdAt: T0 + d(1) }); // 24 / 24
    const r = run('flow_efficiency', events({ workItems: [a, b] }));
    expect(r.value).toBeCloseTo(75, 6); // mean of ratios would be 83.3
    expect(r.sampleSize).toBe(2);
  });

  it('throughput: items done per week, not graded', () => {
    const r = run('throughput', ev);
    expect(r.value).toBeCloseTo(3 / (30 / 7), 6);
    expect(REGISTRY_BY_ID.throughput.graded).toBe(false);
  });

  it('ageing_wip: % of items in progress at window end older than 14 days', () => {
    const aged = item(t(['In Progress', 0]), { createdAt: T0 + d(10) }); // 20 days old at window end
    const fresh = item(t(['In Progress', 0]), { createdAt: T0 + d(25) }); // 5 days
    const doneBefore = item(t(['In Progress', 0], ['Done', d(1)]), { createdAt: T0 + d(2) });
    const doneAfter = item(t(['In Progress', 0], ['Done', d(40)]), { createdAt: T0 + d(5) }); // still open at T
    const waiting = item(t(['In Progress', 0], ['Blocked', d(1)]), { createdAt: T0 + d(28) }); // 2 days
    const r = run('ageing_wip', events({ workItems: [aged, fresh, doneBefore, doneAfter, waiting] }));
    expect(r.value).toBeCloseTo((2 / 4) * 100, 6);
    expect(r.sampleSize).toBe(4);
  });

  it('new_capability_share: % of done items on new capability; labels override type', () => {
    const done = (type: string, labels: string[] = []) =>
      item(t(['In Progress', 0], ['Done', h(5)]), { createdAt: T0 + d(1), type, labels });
    const ev2 = events({ workItems: [done('Story'), done('Story'), done('Bug'), done('Chore')] });
    expect(run('new_capability_share', ev2).value).toBe(50);
    const defs2 = { ...DEFS, categoryLabels: { 'tech-debt': 'tech_debt' as const } };
    const ctx = buildContext(ev2, defs2, W, 30);
    const labelled = events({ workItems: [done('Story', ['tech-debt']), done('Story')] });
    expect(finalize(REGISTRY_BY_ID.new_capability_share.measure(labelled, ctx))).toBe(50);
  });

  it('unplanned_work: % of done items added to a sprint after it started', () => {
    const s = sprint({ sourceId: 'S1', startAt: T0 + d(1), endAt: T0 + d(15) });
    const done = (memberships: { sprintId: string; addedAt: number }[]) =>
      item(t(['In Progress', 0], ['Done', h(5)]), { createdAt: T0 + d(2), sprintMemberships: memberships });
    const ev3 = events({
      sprints: [s],
      workItems: [
        done([{ sprintId: 'S1', addedAt: T0 }]),
        done([{ sprintId: 'S1', addedAt: T0 + d(3) }]),
        done([]),
      ],
    });
    const r = run('unplanned_work', ev3);
    expect(r.value).toBeCloseTo(100 / 3, 6);
    expect(r.sampleSize).toBe(3);
  });
});

describe('plan_predictability', () => {
  it('is completed ÷ committed across sprints ending in window; completions outside the commitment do not count', () => {
    const a = sprint({ committedItemIds: ['1', '2', '3', '4'], completedItemIds: ['1', '2', '3', '9'], endAt: T0 + d(10) });
    const b = sprint({ committedItemIds: ['5', '6'], completedItemIds: ['5', '6'], endAt: T0 + d(20) });
    const out = sprint({ committedItemIds: ['7'], completedItemIds: [], endAt: T0 + d(40) });
    const r = run('plan_predictability', events({ sprints: [a, b, out] }));
    expect(r.value).toBeCloseTo((5 / 6) * 100, 6);
    expect(r.sampleSize).toBe(2);
  });
});

describe('stability and quality', () => {
  const prodDeploys = (n: number, o: Parameters<typeof deployment>[0] = {}) =>
    Array.from({ length: n }, (_, i) => deployment({ at: inside(i + 1), ...o }));

  it('change_failure_rate: deploys with an incident or rollback ÷ all production deploys', () => {
    const dep = [
      deployment({ sourceId: 'x1', at: inside(1), isRollback: true }),
      deployment({ sourceId: 'x2', at: inside(2) }),
      deployment({ sourceId: 'x3', at: inside(3), isRollback: true }),
      deployment({ sourceId: 'stg', at: inside(4), environment: 'staging', isRollback: true }),
      ...Array.from({ length: 7 }, (_, i) => deployment({ sourceId: `ok${i}`, at: inside(10 + i) })),
    ];
    const inc = [incident({ deploymentId: 'x2' }), incident({ deploymentId: 'x3' })];
    const ev = events({ deployments: dep, incidents: inc });
    const r = run('change_failure_rate', ev);
    expect(r.value).toBe(30);
    expect(r.sampleSize).toBe(10);
  });

  it('change_failure_rate sees an incident even when it belongs to a different team’s set', () => {
    const dep = deployment({ sourceId: 'x', at: inside(1) });
    const teamEvents = events({ deployments: [dep] });
    const all = events({ deployments: [dep], incidents: [incident({ deploymentId: 'x' })] });
    expect(run('change_failure_rate', teamEvents, 30, all).value).toBe(100);
  });

  it('deployment_rework_rate: rework deploys ÷ production deploys', () => {
    const ev = events({ deployments: [...prodDeploys(8), ...prodDeploys(2, { isRework: true })] });
    expect(run('deployment_rework_rate', ev).value).toBe(20);
  });

  it('failed_deployment_recovery_time: median hours from start to restore, restored in window', () => {
    const ev = events({
      incidents: [
        incident({ startedAt: inside(1), restoredAt: inside(2) }),
        incident({ startedAt: inside(1), restoredAt: inside(4) }),
        incident({ startedAt: inside(1), restoredAt: inside(6) }),
        incident({ startedAt: inside(1), restoredAt: null }),
      ],
    });
    const r = run('failed_deployment_recovery_time', ev);
    expect(r.value).toBe(3);
    expect(r.sampleSize).toBe(3);
  });

  it('escaped_defects: production bugs per 100 changes shipped', () => {
    const deps = [1, 2, 3, 4].map((i) => deployment({ sourceId: `e${i}`, at: inside(i) }));
    const ev = events({
      deployments: deps,
      pullRequests: deps.map((x) => pr({ deploymentId: x.sourceId })),
      workItems: [
        item([['To Do', 0]], { type: 'Bug', foundInProduction: true, createdAt: inside(5) }),
        item([['To Do', 0]], { type: 'Bug', foundInProduction: false, createdAt: inside(5) }),
        item([['To Do', 0]], { type: 'Story', foundInProduction: true, createdAt: inside(5) }),
        item([['To Do', 0]], { type: 'Bug', foundInProduction: true, createdAt: T0 - d(3) }),
      ],
    });
    const r = run('escaped_defects', ev);
    expect(r.value).toBe(25);
    expect(r.sampleSize).toBe(4);
  });
});

describe('devex_score', () => {
  it('scales 1–5 to 0–100 per response and averages over the latest campaign only', () => {
    const old = Array.from({ length: 5 }, () =>
      response({ campaignId: 'c1', submittedDay: '2026-03-01', scoreAnswers: [1, 1, 1] }),
    );
    const latest = [
      response({ campaignId: 'c2', submittedDay: '2026-09-01', scoreAnswers: [4, 4, 4] }), // 75
      response({ campaignId: 'c2', submittedDay: '2026-09-02', scoreAnswers: [5, 5, 5] }), // 100
    ];
    const r = run('devex_score', events({ surveyResponses: [...old, ...latest] }));
    expect(r.value).toBe(87.5);
    expect(r.sampleSize).toBe(2);
  });
});

describe('devex_score as of a date', () => {
  it('ignores campaigns submitted after the window end, so trends compare successive campaigns', () => {
    const c1 = [response({ campaignId: 'c1', submittedDay: '2026-08-10', scoreAnswers: [3, 3, 3] })]; // 50
    const c2 = [response({ campaignId: 'c2', submittedDay: '2026-09-10', scoreAnswers: [5, 5, 5] })]; // 100
    const ev = events({ surveyResponses: [...c1, ...c2] });
    const early = { from: T0 - d(30), to: T0 + d(5) }; // ends 2026-09-06
    const ctx = buildContext(ev, DEFS, early, 30);
    expect(finalize(REGISTRY_BY_ID.devex_score.measure(ev, ctx))).toBe(50);
    expect(run('devex_score', ev).value).toBe(100);
  });
});

describe('empty input', () => {
  it('yields no value and a zero sample (days-based metrics report coverage)', () => {
    for (const id of Object.keys(REGISTRY_BY_ID) as MetricId[]) {
      const r = run(id, events(), 0);
      expect(r.value, id).toBeNull();
      expect(r.sampleSize, id).toBe(0);
    }
  });
});
