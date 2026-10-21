import { describe, expect, it } from 'vitest';
import { DEFS, h, item } from '../testing/fixtures';
import { bouncesOf, statusRank, workflowOrder } from './definitions';

const t = (...a: [string, number][]) => a;

describe('bouncesOf: steps backwards in the workflow', () => {
  it('counts an In Review → In Progress rework loop', () => {
    const w = item(t(['To Do', 0], ['In Progress', h(1)], ['In Review', h(5)], ['In Progress', h(8)], ['In Review', h(10)], ['Done', h(12)]));
    expect(bouncesOf(w, DEFS)).toEqual([{ from: 'In Review', to: 'In Progress', at: w.createdAt + h(8) }]);
  });

  it('counts a QA rejection and a reopened done item', () => {
    const qa = item(t(['In Progress', 0], ['In Review', h(2)], ['Waiting for QA', h(4)], ['In Progress', h(6)], ['Done', h(9)]));
    expect(bouncesOf(qa, DEFS).map((b) => `${b.from}→${b.to}`)).toEqual(['Waiting for QA→In Progress']);
    const reopened = item(t(['In Progress', 0], ['Done', h(4)], ['In Progress', h(6)], ['Done', h(9)]));
    expect(bouncesOf(reopened, DEFS).map((b) => `${b.from}→${b.to}`)).toEqual(['Done→In Progress']);
  });

  it('does not count leaving an impediment: being unblocked is not a step back', () => {
    const blocked = item(t(['In Progress', 0], ['Blocked', h(2)], ['In Progress', h(6)], ['In Review', h(8)], ['Done', h(10)]));
    expect(bouncesOf(blocked, DEFS)).toEqual([]);
  });

  it('counts every step back, and none for a clean forward run', () => {
    const twice = item(t(['In Progress', 0], ['In Review', h(2)], ['In Progress', h(3)], ['In Review', h(4)], ['In Progress', h(5)], ['Done', h(9)]));
    expect(bouncesOf(twice, DEFS)).toHaveLength(2);
    expect(bouncesOf(item(t(['To Do', 0], ['In Progress', h(1)], ['In Review', h(2)], ['Done', h(3)])), DEFS)).toEqual([]);
  });

  it('works from the order of statusClasses when no explicit order is configured', () => {
    const { statusOrder: _o, ...rest } = DEFS;
    void _o;
    const bare = { ...rest, impedimentStatuses: ['Blocked'] };
    expect(workflowOrder(bare)).toEqual(Object.keys(DEFS.statusClasses));
    expect(statusRank(bare, 'In Review')).toBeGreaterThan(statusRank(bare, 'In Progress'));
  });
});
