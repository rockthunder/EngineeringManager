import { buildIndex, contextFor } from '../../domain/metrics/context';
import { bounceTransitions, inFlightByStatus, statusTimes, teamStats } from '../../domain/metrics/breakdowns';
import { EMPTY_EVENTS } from '../../domain/events/types';
import { attributeEvents } from '../../domain/teams/attribution';
import { coverageDays } from '../../domain/teams/mapping';
import { lastNDays, previousWindow, type Day } from '../../domain/time/day';
import type { StatView, TeamInsightsView } from '../views/contract';
import { formatValue } from '../views/format';
import type { GridInput } from './benchmark-grid';

/** A work item sitting in its status for this long without moving counts as "not moved". */
export const STALE_DAYS = 5;

const signed = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(n)}`;

function stat(s: { key: string; label: string; current: number; previous: number }): StatView {
  const diff = s.current - s.previous;
  const pct = s.previous === 0 ? null : Math.round((diff / s.previous) * 100);
  return {
    ...s,
    deltaText: diff === 0 ? 'no change' : `${signed(diff)}${pct === null ? '' : ` (${signed(pct)}%)`}`,
    previousText: `was ${s.previous}`,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
  };
}

const hoursText = (h: number) => formatValue('hours', h);

/**
 * The detail behind a team's metrics: plain counts with their movement, where finished work spent its
 * time by status, where work bounces, and what is sitting in each column now. All computed from raw events.
 */
export function buildTeamInsights(args: {
  input: GridInput;
  teamId: string;
  endDay: Day;
  windowDays: number;
  /** The moment "right now" refers to for work in flight. */
  now: number;
}): TeamInsightsView {
  const { input, teamId, endDay, windowDays } = args;
  const window = lastNDays(endDay, windowDays);
  const prev = previousWindow(window);
  const ev = attributeEvents(input.events, input.organisation.mappings, input.definitions).get(teamId) ?? EMPTY_EVENTS;
  const index = buildIndex(input.events);
  const ctx = contextFor(index, input.definitions, window, coverageDays(input.organisation.mappings, teamId, window));
  const prevCtx = contextFor(index, input.definitions, prev, coverageDays(input.organisation.mappings, teamId, prev));

  const bounce = bounceTransitions(ev, ctx);
  const flight = inFlightByStatus(ev, ctx, args.now, STALE_DAYS);
  return {
    windowDays,
    stats: teamStats(ev, ctx, prevCtx).map(stat),
    statusTimes: statusTimes(ev, ctx).map((s) => ({
      status: s.status, statusClass: s.statusClass, meanHours: s.meanHours, meanText: hoursText(s.meanHours),
      medianText: s.medianWhenVisited === null ? null : hoursText(s.medianWhenVisited), visitedShare: s.visitedShare,
    })),
    bounce: {
      items: bounce.items, bouncedItems: bounce.bouncedItems,
      rate: bounce.items === 0 ? null : bounce.bouncedItems / bounce.items, transitions: bounce.transitions,
    },
    inFlight: {
      staleDays: STALE_DAYS,
      columns: flight.columns.map((c) => ({
        status: c.status, statusClass: c.statusClass, count: c.count,
        medianText: c.medianHours === null ? null : hoursText(c.medianHours), oldestText: hoursText(c.oldestHours), oldestHours: c.oldestHours,
      })),
      notMoved: flight.notMoved.map((n) => ({ ...n, days: n.daysSinceMove, daysText: hoursText(n.daysSinceMove * 24) })),
    },
  };
}
