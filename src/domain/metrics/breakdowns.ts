import { completedAt, investmentCategory, startedAt, type InvestmentCategory } from '../events/definitions';
import type { EventSet } from '../events/types';
import { instantToDay, MS_PER_DAY, MS_PER_HOUR, type Day } from '../time/day';
import { median } from './aggregation';
import { doneInWindow, shippedChanges } from './calculators';
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
