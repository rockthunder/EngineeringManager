import type { Instant } from '../time/day';
import type { WorkItem } from './types';

export type StatusClass = 'todo' | 'active' | 'waiting' | 'done';
export type InvestmentCategory = 'new_capability' | 'maintenance' | 'defect' | 'tech_debt';

/** Per-source conventions. Held in Settings later; pre-filled for the dummy data. */
export interface SourceDefinitions {
  readonly productionEnvironment: string;
  /** Workflow order, earliest first. A move to an earlier status is a step back. Falls back to the order of `statusClasses`. */
  readonly statusOrder?: readonly string[];
  /** Statuses that are impediments (e.g. Blocked): leaving one is an unblock, not a bounce. */
  readonly impedimentStatuses?: readonly string[];
  readonly statusClasses: Readonly<Record<string, StatusClass>>;
  readonly foundInProductionLabel: string;
  readonly hotfixLabel: string;
  /** Issue type → category; a label in `categoryLabels` overrides the type. */
  readonly issueTypeCategories: Readonly<Record<string, InvestmentCategory>>;
  readonly categoryLabels: Readonly<Record<string, InvestmentCategory>>;
}

export function statusClass(defs: SourceDefinitions, status: string): StatusClass {
  return defs.statusClasses[status] ?? 'todo';
}

/** When work started: first move into an active status. */
export function startedAt(item: WorkItem, defs: SourceDefinitions): Instant | null {
  for (const t of item.transitions) if (statusClass(defs, t.to) === 'active') return t.at;
  return null;
}

/** When work finished: the time of the final transition, if it ended in a done status. */
export function completedAt(item: WorkItem, defs: SourceDefinitions): Instant | null {
  const last = item.transitions[item.transitions.length - 1];
  return last && statusClass(defs, last.to) === 'done' ? last.at : null;
}

/** Status class of the item at instant `t` (state after all transitions strictly before `t`). */
export function statusClassAt(item: WorkItem, defs: SourceDefinitions, t: Instant): StatusClass {
  let cls: StatusClass = 'todo';
  for (const tr of item.transitions) {
    if (tr.at >= t) break;
    cls = statusClass(defs, tr.to);
  }
  return cls;
}

export function investmentCategory(item: WorkItem, defs: SourceDefinitions): InvestmentCategory {
  for (const label of item.labels) {
    const c = defs.categoryLabels[label];
    if (c) return c;
  }
  return defs.issueTypeCategories[item.type] ?? 'maintenance';
}

export function workflowOrder(defs: SourceDefinitions): readonly string[] {
  return defs.statusOrder ?? Object.keys(defs.statusClasses);
}

export function statusRank(defs: SourceDefinitions, status: string): number {
  const i = workflowOrder(defs).indexOf(status);
  return i < 0 ? 0 : i;
}

export interface Bounce {
  readonly from: string;
  readonly to: string;
  readonly at: Instant;
}

/**
 * A bounce is a step backwards in the workflow (In Review → In Progress, Waiting for QA → In
 * Progress, or reopening a done item). Leaving an impediment status such as Blocked is not one.
 */
export function bouncesOf(item: WorkItem, defs: SourceDefinitions): Bounce[] {
  const impediments = new Set(defs.impedimentStatuses ?? []);
  const out: Bounce[] = [];
  for (const t of item.transitions) {
    if (t.from === null || impediments.has(t.from)) continue;
    if (statusRank(defs, t.to) < statusRank(defs, t.from)) out.push({ from: t.from, to: t.to, at: t.at });
  }
  return out;
}
