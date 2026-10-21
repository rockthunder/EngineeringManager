import {
  completedAt,
  investmentCategory,
  startedAt,
  statusClass,
  statusClassAt,
  type SourceDefinitions,
} from '../events/definitions';
import type { Deployment, EventSet, PullRequest, WorkItem } from '../events/types';
import { dayToInstant, inWindow, MS_PER_DAY, MS_PER_HOUR } from '../time/day';
import type { Measurement, MetricContext } from './types';

const prodDeploys = (ev: EventSet, ctx: MetricContext): Deployment[] =>
  ev.deployments.filter(
    (x) => x.environment === ctx.definitions.productionEnvironment && inWindow(x.at, ctx.window),
  );

const mergedInWindow = (ev: EventSet, ctx: MetricContext) =>
  ev.pullRequests.filter((p) => p.mergedAt !== null && inWindow(p.mergedAt, ctx.window));

export const doneInWindow = (ev: EventSet, ctx: MetricContext): WorkItem[] =>
  ev.workItems.filter((w) => {
    const c = completedAt(w, ctx.definitions);
    return c !== null && inWindow(c, ctx.window);
  });

const samples = (values: number[]): Measurement => ({ kind: 'samples', values, sampleSize: values.length });
const percent = (num: number, den: number, sampleSize = den): Measurement => ({
  kind: 'ratio', num, den, scale: 100, sampleSize,
});

/** Production deploys of PRs, i.e. "changes", with the deployment that shipped them. */
export function shippedChanges(ev: EventSet, ctx: MetricContext) {
  const out: { pr: PullRequest; firstCommitAt: number; deployedAt: number }[] = [];
  for (const p of ev.pullRequests) {
    if (p.deploymentId === null) continue;
    const dep = ctx.deploymentsById.get(p.deploymentId);
    if (!dep || dep.environment !== ctx.definitions.productionEnvironment) continue;
    if (!inWindow(dep.at, ctx.window)) continue;
    out.push({ pr: p, firstCommitAt: p.firstCommitAt, deployedAt: dep.at });
  }
  return out;
}

export const deploymentFrequency = (ev: EventSet, ctx: MetricContext): Measurement => ({
  kind: 'rate',
  count: prodDeploys(ev, ctx).length,
  days: ctx.coverageDays,
  teams: 1,
  sampleSize: ctx.coverageDays,
});

export const leadTime = (ev: EventSet, ctx: MetricContext): Measurement =>
  samples(shippedChanges(ev, ctx).map((c) => (c.deployedAt - c.firstCommitAt) / MS_PER_HOUR));

export const prCycleTime = (ev: EventSet, ctx: MetricContext): Measurement =>
  samples(mergedInWindow(ev, ctx).map((p) => (p.mergedAt! - p.openedAt) / MS_PER_HOUR));

export const prPickupTime = (ev: EventSet, ctx: MetricContext): Measurement =>
  samples(
    mergedInWindow(ev, ctx)
      .filter((p) => p.firstReviewAt !== null)
      .map((p) => (p.firstReviewAt! - p.openedAt) / MS_PER_HOUR),
  );

export const prSize = (ev: EventSet, ctx: MetricContext): Measurement =>
  samples(mergedInWindow(ev, ctx).map((p) => p.linesChanged));

/** Done items that have a start, with start and finish instants. */
function finishedItems(ev: EventSet, ctx: MetricContext) {
  const out: { item: WorkItem; start: number; end: number }[] = [];
  for (const w of doneInWindow(ev, ctx)) {
    const start = startedAt(w, ctx.definitions);
    if (start !== null) out.push({ item: w, start, end: completedAt(w, ctx.definitions)! });
  }
  return out;
}

export const workItemCycleTime = (ev: EventSet, ctx: MetricContext): Measurement =>
  samples(finishedItems(ev, ctx).map((f) => (f.end - f.start) / MS_PER_DAY));

function activeTime(item: WorkItem, defs: SourceDefinitions, start: number, end: number): number {
  let active = 0;
  const trs = item.transitions;
  for (let i = 0; i < trs.length; i++) {
    const cur = trs[i]!;
    const from = Math.max(cur.at, start);
    const to = Math.min(trs[i + 1]?.at ?? end, end);
    if (statusClass(defs, cur.to) === 'active' && to > from) active += to - from;
  }
  return active;
}

export const flowEfficiency = (ev: EventSet, ctx: MetricContext): Measurement => {
  const items = finishedItems(ev, ctx);
  let num = 0;
  let den = 0;
  for (const f of items) {
    num += activeTime(f.item, ctx.definitions, f.start, f.end);
    den += f.end - f.start;
  }
  return percent(num, den, items.length);
};

const AGEING_DAYS = 14;

export const ageingWip = (ev: EventSet, ctx: MetricContext): Measurement => {
  const at = ctx.window.to;
  let inProgress = 0;
  let aged = 0;
  for (const w of ev.workItems) {
    if (w.createdAt >= at) continue;
    const cls = statusClassAt(w, ctx.definitions, at);
    if (cls !== 'active' && cls !== 'waiting') continue;
    inProgress++;
    const start = startedAt(w, ctx.definitions);
    if (start !== null && start < at && at - start > AGEING_DAYS * MS_PER_DAY) aged++;
  }
  return percent(aged, inProgress);
};

export const planPredictability = (ev: EventSet, ctx: MetricContext): Measurement => {
  const sprints = ev.sprints.filter((s) => inWindow(s.endAt, ctx.window));
  let committed = 0;
  let completed = 0;
  for (const s of sprints) {
    const done = new Set(s.completedItemIds);
    committed += s.committedItemIds.length;
    completed += s.committedItemIds.filter((id) => done.has(id)).length;
  }
  return percent(completed, committed, sprints.length);
};

export const throughput = (ev: EventSet, ctx: MetricContext): Measurement => {
  const count = doneInWindow(ev, ctx).length;
  return { kind: 'rate', count, days: ctx.coverageDays, teams: 1, sampleSize: count };
};

export const changeFailureRate = (ev: EventSet, ctx: MetricContext): Measurement => {
  const deploys = prodDeploys(ev, ctx);
  const failed = deploys.filter((x) => x.isRollback || ctx.deploymentsWithIncident.has(x.sourceId)).length;
  return percent(failed, deploys.length);
};

export const deploymentReworkRate = (ev: EventSet, ctx: MetricContext): Measurement => {
  const deploys = prodDeploys(ev, ctx);
  return percent(deploys.filter((x) => x.isRework).length, deploys.length);
};

export const recoveryTime = (ev: EventSet, ctx: MetricContext): Measurement =>
  samples(
    ev.incidents
      .filter((i) => i.restoredAt !== null && inWindow(i.restoredAt, ctx.window))
      .map((i) => (i.restoredAt! - i.startedAt) / MS_PER_HOUR),
  );

export const escapedDefects = (ev: EventSet, ctx: MetricContext): Measurement => {
  const changes = shippedChanges(ev, ctx).length;
  const bugs = ev.workItems.filter(
    (w) => w.type === 'Bug' && w.foundInProduction && inWindow(w.createdAt, ctx.window),
  ).length;
  return { kind: 'ratio', num: bugs, den: changes, scale: 100, sampleSize: changes };
};

export const newCapabilityShare = (ev: EventSet, ctx: MetricContext): Measurement => {
  const done = doneInWindow(ev, ctx);
  const n = done.filter((w) => investmentCategory(w, ctx.definitions) === 'new_capability').length;
  return percent(n, done.length);
};

export const unplannedWork = (ev: EventSet, ctx: MetricContext): Measurement => {
  const done = doneInWindow(ev, ctx);
  const unplanned = done.filter((w) =>
    w.sprintMemberships.some((m) => {
      const s = ctx.sprintsById.get(m.sprintId);
      return s !== undefined && m.addedAt > s.startAt;
    }),
  ).length;
  return percent(unplanned, done.length);
};

/**
 * Responses from the team's latest campaign as of the window end (greatest last-submission
 * day; ties by id), so the previous period compares against the previous campaign.
 */
export const devexScore = (ev: EventSet, ctx: MetricContext): Measurement => {
  const lastDay = new Map<string, string>();
  const known = ev.surveyResponses.filter((r) => dayToInstant(r.submittedDay) < ctx.window.to);
  for (const r of known) {
    const prev = lastDay.get(r.campaignId);
    if (prev === undefined || r.submittedDay > prev) lastDay.set(r.campaignId, r.submittedDay);
  }
  let latest: string | null = null;
  for (const [id, day] of lastDay) {
    if (latest === null) latest = id;
    else {
      const cur = lastDay.get(latest)!;
      if (day > cur || (day === cur && id > latest)) latest = id;
    }
  }
  const scores = known
    .filter((r) => r.campaignId === latest && r.scoreAnswers.length > 0)
    .map((r) => ((r.scoreAnswers.reduce((a, b) => a + b, 0) / r.scoreAnswers.length - 1) / 4) * 100);
  return { kind: 'mean', sum: scores.reduce((a, b) => a + b, 0), count: scores.length, sampleSize: scores.length };
};
