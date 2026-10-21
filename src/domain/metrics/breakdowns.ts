import {
  bouncesOf, completedAt, investmentCategory, startedAt, statusClass, statusClassAt, workflowOrder,
  type InvestmentCategory, type StatusClass,
} from '../events/definitions';
import type { EventSet } from '../events/types';
import { instantToDay, MS_PER_DAY, MS_PER_HOUR, type Day } from '../time/day';
import { median } from './aggregation';
import { doneInWindow, shippedChanges } from './calculators';
import { inWindow } from '../time/day';
import type { MetricContext } from './types';

export type LeadTimeStage = 'coding' | 'pickup' | 'review' | 'deploy';

export interface StageBreakdown {
  readonly stage: LeadTimeStage;
  readonly medianHours: number | null;
  readonly sampleSize: number;
}

/**
 * Where lead time goes: first commit → opened (coding), → first review (pickup),
 * → merged (review), → in production (deploy). Medians over changes shipped in the window.
 */
export function leadTimeStages(ev: EventSet, ctx: MetricContext): StageBreakdown[] {
  const parts: Record<LeadTimeStage, number[]> = { coding: [], pickup: [], review: [], deploy: [] };
  for (const c of shippedChanges(ev, ctx)) {
    const p = c.pr;
    if (p.firstReviewAt === null || p.mergedAt === null) continue;
    parts.coding.push((p.openedAt - p.firstCommitAt) / MS_PER_HOUR);
    parts.pickup.push((p.firstReviewAt - p.openedAt) / MS_PER_HOUR);
    parts.review.push((p.mergedAt - p.firstReviewAt) / MS_PER_HOUR);
    parts.deploy.push((c.deployedAt - p.mergedAt) / MS_PER_HOUR);
  }
  return (['coding', 'pickup', 'review', 'deploy'] as const).map((stage) => ({
    stage, medianHours: median(parts[stage]), sampleSize: parts[stage].length,
  }));
}

const SIZE_BUCKETS: readonly { label: string; max: number }[] = [
  { label: 'under 50', max: 50 },
  { label: '50–99', max: 100 },
  { label: '100–249', max: 250 },
  { label: '250–499', max: 500 },
  { label: '500–999', max: 1000 },
  { label: '1000+', max: Infinity },
];

export function prSizeDistribution(ev: EventSet, ctx: MetricContext): { label: string; count: number }[] {
  const counts = SIZE_BUCKETS.map(() => 0);
  for (const p of ev.pullRequests) {
    if (p.mergedAt === null || p.mergedAt < ctx.window.from || p.mergedAt >= ctx.window.to) continue;
    counts[SIZE_BUCKETS.findIndex((b) => p.linesChanged < b.max)]!++;
  }
  return SIZE_BUCKETS.map((b, i) => ({ label: b.label, count: counts[i]! }));
}

export function cycleTimeScatter(ev: EventSet, ctx: MetricContext): { day: Day; days: number }[] {
  const out: { day: Day; days: number }[] = [];
  for (const w of doneInWindow(ev, ctx)) {
    const start = startedAt(w, ctx.definitions);
    const end = completedAt(w, ctx.definitions);
    if (start !== null && end !== null) out.push({ day: instantToDay(end), days: (end - start) / MS_PER_DAY });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.days - b.days));
}

const CATEGORIES: readonly InvestmentCategory[] = ['new_capability', 'maintenance', 'defect', 'tech_debt'];

export function investmentMix(ev: EventSet, ctx: MetricContext): { category: InvestmentCategory; count: number; share: number }[] {
  const done = doneInWindow(ev, ctx);
  return CATEGORIES.map((category) => {
    const count = done.filter((w) => investmentCategory(w, ctx.definitions) === category).length;
    return { category, count, share: done.length === 0 ? 0 : count / done.length };
  });
}

export interface StatusTime {
  readonly status: string;
  readonly statusClass: StatusClass;
  /** Mean hours per finished item, so the rows add up to the mean cycle (including queueing in To Do). */
  readonly meanHours: number;
  /** Typical hours when an item does spend time here. */
  readonly medianWhenVisited: number | null;
  /** Share of finished items that were ever in this status. */
  readonly visitedShare: number;
  readonly items: number;
}

/** Time per workflow status for items done in the window, in workflow order. Done itself is not shown. */
export function statusTimes(ev: EventSet, ctx: MetricContext): StatusTime[] {
  const done = doneInWindow(ev, ctx);
  const order = workflowOrder(ctx.definitions).filter((s) => statusClass(ctx.definitions, s) !== 'done');
  const perItem = done.map((w) => {
    const hours = new Map<string, number>();
    let status = order[0] ?? 'To Do';
    let cursor = w.createdAt;
    for (const t of w.transitions) {
      if (statusClass(ctx.definitions, status) !== 'done') hours.set(status, (hours.get(status) ?? 0) + (t.at - cursor) / MS_PER_HOUR);
      status = t.to;
      cursor = t.at;
    }
    return hours;
  });
  return order
    .map((status) => {
      const visits = perItem.map((m) => m.get(status) ?? 0).filter((v) => v > 0);
      const total = visits.reduce((a, b) => a + b, 0);
      return {
        status, statusClass: statusClass(ctx.definitions, status),
        meanHours: done.length === 0 ? 0 : total / done.length,
        medianWhenVisited: median(visits),
        visitedShare: done.length === 0 ? 0 : visits.length / done.length,
        items: visits.length,
      };
    })
    .filter((r) => r.items > 0);
}

export interface BounceSummary {
  /** Items done in the window. */
  readonly items: number;
  /** Of those, how many stepped backwards at least once. */
  readonly bouncedItems: number;
  readonly transitions: readonly { from: string; to: string; count: number }[];
}

/** Where tickets bounce: step-backs by from → to over items done in the window. */
export function bounceTransitions(ev: EventSet, ctx: MetricContext): BounceSummary {
  const done = doneInWindow(ev, ctx);
  const counts = new Map<string, { from: string; to: string; count: number }>();
  let bounced = 0;
  for (const w of done) {
    const bs = bouncesOf(w, ctx.definitions);
    if (bs.length > 0) bounced++;
    for (const b of bs) {
      const k = `${b.from}\u0000${b.to}`;
      const cur = counts.get(k) ?? { from: b.from, to: b.to, count: 0 };
      counts.set(k, { ...cur, count: cur.count + 1 });
    }
  }
  return {
    items: done.length,
    bouncedItems: bounced,
    transitions: [...counts.values()].sort((a, b) => b.count - a.count || (a.from + a.to < b.from + b.to ? -1 : 1)),
  };
}

export interface InFlight {
  readonly columns: readonly { status: string; statusClass: StatusClass; count: number; medianHours: number | null; oldestHours: number }[];
  /** In-progress items that have sat in their current status for at least `staleDays`, longest first. */
  readonly notMoved: readonly { key: string; type: string; status: string; daysSinceMove: number }[];
}

/** What is in each column right now and how long it has been there. To Do (the backlog) and Done are left out. */
export function inFlightByStatus(ev: EventSet, ctx: MetricContext, now: number, staleDays: number): InFlight {
  const rows: { key: string; type: string; status: string; hours: number }[] = [];
  for (const w of ev.workItems) {
    if (w.createdAt >= now) continue;
    const cls = statusClassAt(w, ctx.definitions, now);
    if (cls !== 'active' && cls !== 'waiting') continue;
    const last = [...w.transitions].filter((t) => t.at < now).pop();
    if (!last) continue;
    rows.push({ key: w.key, type: w.type, status: last.to, hours: (now - last.at) / MS_PER_HOUR });
  }
  const columns = workflowOrder(ctx.definitions)
    .filter((s) => ['active', 'waiting'].includes(statusClass(ctx.definitions, s)))
    .map((status) => {
      const here = rows.filter((r) => r.status === status);
      return {
        status, statusClass: statusClass(ctx.definitions, status), count: here.length,
        medianHours: median(here.map((r) => r.hours)), oldestHours: here.reduce((m, r) => Math.max(m, r.hours), 0),
      };
    })
    .filter((c) => c.count > 0);
  return {
    columns,
    notMoved: rows
      .filter((r) => r.hours >= staleDays * 24)
      .sort((a, b) => b.hours - a.hours)
      .map((r) => ({ key: r.key, type: r.type, status: r.status, daysSinceMove: r.hours / 24 })),
  };
}

export interface TeamStat {
  readonly key: string;
  readonly label: string;
  readonly current: number;
  readonly previous: number;
}

/** The plain numbers behind a team's metrics, for this window and the previous one. */
export function teamStats(ev: EventSet, cur: MetricContext, prev: MetricContext): TeamStat[] {
  const count = (ctx: MetricContext) => {
    const done = doneInWindow(ev, ctx);
    const wip = ev.workItems.filter((w) => w.createdAt < ctx.window.to && ['active', 'waiting'].includes(statusClassAt(w, ctx.definitions, ctx.window.to))).length;
    return {
      deployments: ev.deployments.filter((x) => x.environment === ctx.definitions.productionEnvironment && inWindow(x.at, ctx.window)).length,
      prs_merged: ev.pullRequests.filter((p) => p.mergedAt !== null && inWindow(p.mergedAt, ctx.window)).length,
      items_done: done.length,
      wip,
      incidents: ev.incidents.filter((i) => inWindow(i.startedAt, ctx.window)).length,
      bounced_items: done.filter((w) => bouncesOf(w, ctx.definitions).length > 0).length,
    };
  };
  const c = count(cur);
  const p = count(prev);
  const labels: Record<keyof typeof c, string> = {
    deployments: 'Production deploys', prs_merged: 'PRs merged', items_done: 'Work items done',
    wip: 'In progress (end of period)', incidents: 'Incidents', bounced_items: 'Items that bounced',
  };
  return (Object.keys(labels) as (keyof typeof c)[]).map((key) => ({ key, label: labels[key], current: c[key], previous: p[key] }));
}
