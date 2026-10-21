import { dayToInstant, inWindow, MS_PER_DAY, type Instant, type Window } from '../time/day';
import type { Mapping, MappingKind, TeamId } from './types';

function range(m: Mapping): Window {
  return {
    from: dayToInstant(m.effectiveFrom),
    to: m.effectiveTo === null ? Number.POSITIVE_INFINITY : dayToInstant(m.effectiveTo),
  };
}

/** The team an event belongs to: whoever the ref was mapped to at the event's time. */
export function resolveTeam(
  mappings: readonly Mapping[],
  kind: MappingKind,
  ref: string,
  at: Instant,
): TeamId | null {
  for (const m of mappings) {
    if (m.kind === kind && m.ref === ref && inWindow(at, range(m))) return m.teamId;
  }
  return null;
}

/** Pairs of mappings for the same ref whose ranges overlap. A reorg must hand over, not duplicate. */
export function findMappingOverlaps(mappings: readonly Mapping[]): [Mapping, Mapping][] {
  const out: [Mapping, Mapping][] = [];
  for (let i = 0; i < mappings.length; i++) {
    for (let j = i + 1; j < mappings.length; j++) {
      const a = mappings[i]!;
      const b = mappings[j]!;
      if (a.kind !== b.kind || a.ref !== b.ref) continue;
      const ra = range(a);
      const rb = range(b);
      if (ra.from < rb.to && rb.from < ra.to) out.push([a, b]);
    }
  }
  return out;
}

/** Days of `window` during which the team had at least one mapping in force. */
export function coverageDays(mappings: readonly Mapping[], teamId: TeamId, window: Window): number {
  const ranges = mappings
    .filter((m) => m.teamId === teamId)
    .map(range)
    .map((r) => ({ from: Math.max(r.from, window.from), to: Math.min(r.to, window.to) }))
    .filter((r) => r.from < r.to)
    .sort((a, b) => a.from - b.from);
  let covered = 0;
  let cursor = window.from;
  for (const r of ranges) {
    const from = Math.max(r.from, cursor);
    if (r.to > from) {
      covered += r.to - from;
      cursor = r.to;
    }
  }
  return Math.round(covered / MS_PER_DAY);
}
