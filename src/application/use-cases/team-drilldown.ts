import { barText } from '../views/format';
import { instantToDay, lastNDays } from '../../domain/time/day';
import { cycleTimeScatter, investmentMix, leadTimeStages, prSizeDistribution } from '../../domain/metrics/breakdowns';
import { buildIndex, contextFor } from '../../domain/metrics/context';
import { REGISTRY, REGISTRY_BY_ID } from '../../domain/metrics/registry';
import type { MetricId } from '../../domain/metrics/types';
import { attributeEvents } from '../../domain/teams/attribution';
import { coverageDays } from '../../domain/teams/mapping';
import { EMPTY_EVENTS } from '../../domain/events/types';
import { NotFoundError } from '../errors';
import { resolveRange, type RangeInput } from '../range';
import { loadSettings, rangeFor } from '../settings';
import type { DrilldownMetric, DrilldownView } from '../views/contract';
import { cellView } from '../views/grid-view';
import { dataAsOf, pageContext } from '../views/page';
import { computeBenchmarkGrid, loadGridInput } from './benchmark-grid';
import { computeMonthly, monthEnds, monthlyRangeDays } from './monthly';
import { monthLabel } from './org-benchmark';
import type { ViewDeps } from './team-benchmark';

export interface DrilldownRequest {
  readonly teamId: string;
  readonly range?: RangeInput;
  readonly version?: 'in_force' | 'today';
  readonly metric?: string | null;
}

const STAGE_LABELS = { coding: 'Coding', pickup: 'Waiting for review', review: 'In review', deploy: 'Waiting to deploy' } as const;
const CATEGORY_LABELS = {
  new_capability: 'New capability', maintenance: 'Maintenance', defect: 'Defects', tech_debt: 'Tech debt',
} as const;

function hoursText(h: number | null): string {
  if (h === null) return 'no data';
  return h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`;
}

/** Where does this team's time go? Every metric with trend and bar line, plus the breakdowns behind lead time and flow. */
export async function getTeamDrilldown(deps: ViewDeps, req: DrilldownRequest): Promise<DrilldownView> {
  const settings = await loadSettings(deps.settingsStore);
  const today = instantToDay(deps.clock.now());
  const range = req.range ?? { range: rangeFor(settings, 'team-drilldown') };
  const { endDay, windowDays } = resolveRange(range, today);
  const version = req.version ?? 'in_force';

  const months = monthEnds(today, 12);
  const from = lastNDays(today, monthlyRangeDays(today, months) + 60).from;
  const [base, asOf] = await Promise.all([
    loadGridInput(deps, { from, to: lastNDays(today, 1).to }),
    dataAsOf(deps.syncStore),
  ]);
  const team = base.organisation.teams.find((t) => t.id === req.teamId);
  if (!team) throw new NotFoundError(`No team ${req.teamId}`);
  const input = { ...base, today };

  const current = computeBenchmarkGrid(input, { endDay, compare: true, version, includeArchived: true, ...(windowDays === undefined ? {} : { windowDays }) });
  const row = current.rows.find((r) => r.teamId === team.id)!;
  const monthly = computeMonthly(input, months, version, true);

  const metrics: DrilldownMetric[] = REGISTRY.map((def, i) => {
    const cell = row.cells[i]!;
    const header = current.metrics[i]!;
    const counterpart = def.counterpart ? { id: def.counterpart, name: REGISTRY_BY_ID[def.counterpart as MetricId].name } : null;
    const series = monthly.map((m) => {
      const c = cellView(m.grid.rows.find((r) => r.teamId === team.id)!.cells[i]!, settings);
      return { endDay: m.endDay, label: monthLabel(m.endDay, today), value: c.status === 'insufficient_data' ? null : c.value, colour: c.colour, text: c.valueText };
    });
    const bar = cell.thresholds && def.graded
      ? { level: cell.bar, value: cell.bar === 'low' ? NaN : cell.thresholds[cell.bar], text: barText(def, cell.thresholds, cell.bar) }
      : null;
    return {
      header, cell: cellView(cell, settings), counterpart, series,
      bar: bar && !Number.isNaN(bar.value) ? { ...bar, level: bar.level[0]!.toUpperCase() + bar.level.slice(1) } : null,
    };
  });

  const days = windowDays ?? 30;
  const window = lastNDays(endDay, days);
  const ev = attributeEvents(base.events, base.organisation.mappings, base.definitions).get(team.id) ?? EMPTY_EVENTS;
  const ctx = contextFor(buildIndex(base.events), base.definitions, window, coverageDays(base.organisation.mappings, team.id, window));

  return {
    ...pageContext(current, settings, asOf, range.range),
    team: { id: team.id, name: team.name, profile: team.profileId, groupId: team.groupId, headcount: team.headcount, archived: team.archived },
    focusMetric: req.metric ?? null,
    windowDays: days,
    metrics,
    breakdowns: {
      leadTimeStages: leadTimeStages(ev, ctx).map((s) => ({
        stage: s.stage, label: STAGE_LABELS[s.stage], medianHours: s.medianHours, text: hoursText(s.medianHours), sampleSize: s.sampleSize,
      })),
      prSize: prSizeDistribution(ev, ctx),
      cycleTime: cycleTimeScatter(ev, ctx),
      investment: investmentMix(ev, ctx).map((m) => ({ ...m, label: CATEGORY_LABELS[m.category] })),
    },
  };
}
