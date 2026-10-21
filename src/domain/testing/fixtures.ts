import type { SourceDefinitions } from '../events/definitions';
import type {
  Deployment,
  EventSet,
  Incident,
  PullRequest,
  Sprint,
  SurveyResponse,
  WorkItem,
} from '../events/types';
import { EMPTY_EVENTS } from '../events/types';
import { dayToInstant, MS_PER_DAY, MS_PER_HOUR } from '../time/day';

/** Hand-built fixtures for unit tests. Times are hours/days offsets from T0. */
export const T0 = dayToInstant('2026-09-01');
export const h = (n: number) => n * MS_PER_HOUR;
export const d = (n: number) => n * MS_PER_DAY;

export const DEFS: SourceDefinitions = {
  productionEnvironment: 'production',
  statusOrder: ['To Do', 'In Progress', 'Blocked', 'In Review', 'Waiting for QA', 'Done'],
  impedimentStatuses: ['Blocked'],
  statusClasses: {
    'To Do': 'todo',
    'In Progress': 'active',
    'In Review': 'active',
    Blocked: 'waiting',
    'Waiting for QA': 'waiting',
    Done: 'done',
  },
  foundInProductionLabel: 'found-in-prod',
  hotfixLabel: 'hotfix',
  issueTypeCategories: { Story: 'new_capability', Bug: 'defect', Chore: 'maintenance', 'Tech debt': 'tech_debt' },
  categoryLabels: {},
};

let n = 0;
const id = (p: string) => `${p}-${++n}`;

export function deployment(o: Partial<Deployment> = {}): Deployment {
  const sourceId = o.sourceId ?? id('dep');
  return {
    source: 'test', sourceId, updatedAt: o.at ?? T0, repo: 'repo-a', environment: 'production', at: T0,
    commitShas: [], isRework: false, isRollback: false, ...o,
  };
}

export function pr(o: Partial<PullRequest> = {}): PullRequest {
  const openedAt = o.openedAt ?? T0;
  return {
    source: 'test', sourceId: o.sourceId ?? id('pr'), updatedAt: o.mergedAt ?? openedAt, repo: 'repo-a',
    firstCommitAt: openedAt - h(4), openedAt, firstReviewAt: openedAt + h(2), mergedAt: openedAt + h(10),
    linesChanged: 100, deploymentId: null, ...o,
  };
}

/** Item with transitions given as [status, hoursAfterCreated] pairs. */
export function item(
  transitions: readonly (readonly [string, number])[],
  o: Partial<WorkItem> = {},
): WorkItem {
  const createdAt = o.createdAt ?? T0;
  let prev: string | null = null;
  const trs = transitions.map(([to, at]) => {
    const t = { from: prev, to, at: createdAt + at };
    prev = to;
    return t;
  });
  const last = trs[trs.length - 1];
  return {
    source: 'test', sourceId: o.sourceId ?? id('wi'), updatedAt: last?.at ?? createdAt, key: id('K'), type: 'Story',
    labels: [], board: 'board-a', createdAt, foundInProduction: false, sprintMemberships: [], transitions: trs, ...o,
  };
}

export function sprint(o: Partial<Sprint> = {}): Sprint {
  return {
    source: 'test', sourceId: o.sourceId ?? id('sp'), updatedAt: T0 + d(14), board: 'board-a', startAt: T0,
    endAt: T0 + d(14), committedItemIds: [], completedItemIds: [], ...o,
  };
}

export function incident(o: Partial<Incident> = {}): Incident {
  return {
    source: 'test', sourceId: o.sourceId ?? id('inc'), updatedAt: o.restoredAt ?? o.startedAt ?? T0,
    service: 'svc-a', startedAt: T0, restoredAt: T0 + h(2), deploymentId: null, ...o,
  };
}

export function response(o: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    id: o.id ?? id('resp'), campaignId: 'c1', teamId: 'team-a', submittedDay: '2026-09-01',
    scoreAnswers: [4, 4, 4, 4, 4, 4, 4], otherAnswers: {}, ...o,
  };
}

export function events(o: Partial<EventSet> = {}): EventSet {
  return { ...EMPTY_EVENTS, ...o };
}
