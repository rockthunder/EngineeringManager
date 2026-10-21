import { describe, expect, it } from 'vitest';
import { dayToInstant } from '../time/day';
import { DEFS, deployment, events, h, incident, item, pr, response, sprint } from '../testing/fixtures';
import { attributeEvents } from './attribution';
import type { Mapping } from './types';

const reorg = '2026-06-23';
const before = dayToInstant('2026-06-10');
const after = dayToInstant('2026-07-10');

const mappings: Mapping[] = [
  { teamId: 'harbour', kind: 'repo', ref: 'billing', effectiveFrom: '2025-10-01', effectiveTo: reorg },
  { teamId: 'juniper', kind: 'repo', ref: 'billing', effectiveFrom: reorg, effectiveTo: null },
  { teamId: 'harbour', kind: 'board', ref: 'hb', effectiveFrom: '2025-10-01', effectiveTo: null },
  { teamId: 'harbour', kind: 'service', ref: 'svc', effectiveFrom: '2025-10-01', effectiveTo: null },
];

describe('attributeEvents', () => {
  it('gives each event to the team mapped to its repo at the event’s time (reorg keeps history)', () => {
    const oldDep = deployment({ sourceId: 'd1', repo: 'billing', at: before });
    const newDep = deployment({ sourceId: 'd2', repo: 'billing', at: after });
    const out = attributeEvents(events({ deployments: [oldDep, newDep] }), mappings, DEFS);
    expect(out.get('harbour')?.deployments.map((x) => x.sourceId)).toEqual(['d1']);
    expect(out.get('juniper')?.deployments.map((x) => x.sourceId)).toEqual(['d2']);
  });

  it('attributes a PR by merge time, falling back to opened time when unmerged', () => {
    const merged = pr({ sourceId: 'p1', repo: 'billing', openedAt: before, mergedAt: after });
    const open = pr({ sourceId: 'p2', repo: 'billing', openedAt: before, mergedAt: null, firstReviewAt: null });
    const out = attributeEvents(events({ pullRequests: [merged, open] }), mappings, DEFS);
    expect(out.get('juniper')?.pullRequests.map((x) => x.sourceId)).toEqual(['p1']);
    expect(out.get('harbour')?.pullRequests.map((x) => x.sourceId)).toEqual(['p2']);
  });

  it('attributes work items by board at completion time, else creation time', () => {
    const done = item([['In Progress', h(1)], ['Done', h(5)]], { sourceId: 'w1', board: 'hb', createdAt: before });
    const out = attributeEvents(events({ workItems: [done] }), mappings, DEFS);
    expect(out.get('harbour')?.workItems).toHaveLength(1);
  });

  it('attributes incidents by service and sprints by board at end time', () => {
    const inc = incident({ sourceId: 'i1', service: 'svc', startedAt: after });
    const sp = sprint({ sourceId: 's1', board: 'hb', endAt: after });
    const out = attributeEvents(events({ incidents: [inc], sprints: [sp] }), mappings, DEFS);
    expect(out.get('harbour')?.incidents).toHaveLength(1);
    expect(out.get('harbour')?.sprints).toHaveLength(1);
  });

  it('drops unmapped events and routes survey responses by their team', () => {
    const stray = deployment({ repo: 'mystery', at: after });
    const r = response({ teamId: 'harbour' });
    const out = attributeEvents(events({ deployments: [stray], surveyResponses: [r] }), mappings, DEFS);
    expect([...out.values()].flatMap((e) => e.deployments)).toEqual([]);
    expect(out.get('harbour')?.surveyResponses).toEqual([r]);
  });
});
