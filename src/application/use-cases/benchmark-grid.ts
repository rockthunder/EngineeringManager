import { gradeMetric, type Grade } from '../../domain/benchmarks/grading';
import { trendOf, type Trend } from '../../domain/benchmarks/trend';
import { barFor, thresholdsFor, versionInForce, type BenchmarkVersion } from '../../domain/benchmarks/version';
import type { Level } from '../../domain/benchmarks/levels';
import type { SourceDefinitions } from '../../domain/events/definitions';
import { EMPTY_EVENTS, type EventSet } from '../../domain/events/types';
import { finalize, pool, valueForGrading } from '../../domain/metrics/aggregation';
import { buildIndex, contextFor } from '../../domain/metrics/context';
import { REGISTRY } from '../../domain/metrics/registry';
import type { Measurement, MetricGroup, MetricId, Thresholds } from '../../domain/metrics/types';
import { attributeEvents } from '../../domain/teams/attribution';
import { coverageDays } from '../../domain/teams/mapping';
import type { Organisation } from '../../domain/teams/organisation';
import type { ProfileId } from '../../domain/teams/types';
import { instantToDay, lastNDays, previousWindow, type Day, type Window } from '../../domain/time/day';
import type { Clock } from '../ports/clock';
import type { ConfigStore } from '../ports/config-store';
import type { EventStore } from '../ports/event-store';

export interface GridCell {
  readonly metricId: MetricId;
  /** Display value (the org deployment frequency is the sum across teams). */
  readonly value: number | null;
  /** The value actually compared to thresholds. */
  readonly gradedValue: number | null;
  readonly sampleSize: number;
  readonly grade: Grade;
  /** Thresholds and bar this cell was graded against (for explaining the grade). */
  readonly thresholds: Thresholds | null;
  readonly bar: Level;
  /** Against the previous period of the same length; null if comparison wasn't requested. */
  readonly trend: Trend | null;
}

export interface GridRow {
  readonly teamId: string;
  readonly teamName: string;
  readonly profileId: ProfileId;
  readonly groupId: string;
  readonly cells: readonly GridCell[];
}

export interface BenchmarkGrid {
  readonly endDay: Day;
  readonly benchmarkVersion: number;
  readonly benchmarkEffectiveFrom: Day;
  readonly metrics: readonly { id: MetricId; name: string; unitLabel: string; windowDays: number; graded: boolean; group: MetricGroup }[];
  /** Sorted by team name only: never by grade or score. */
  readonly rows: readonly GridRow[];
  readonly org: { readonly cells: readonly GridCell[] };
}

export interface GridRequest {
  /** Last day of the window, default today. */
  readonly endDay?: Day;
  /** One window for every metric; default is each metric's own default window. */
  readonly windowDays?: number;
  readonly compare?: boolean;
  /** Grade against the version in force at `endDay` (default) or today's. */
  readonly version?: 'in_force' | 'today';
}

export interface GridInput {
  readonly events: EventSet;
  readonly organisation: Organisation;
  readonly definitions: SourceDefinitions;
  readonly versions: readonly BenchmarkVersion[];
  readonly today: Day;
}

/** Pure grid computation from already-loaded raw events: nothing is persisted or fetched. */
export function computeBenchmarkGrid(input: GridInput, req: GridRequest = {}): BenchmarkGrid {
  const { events, organisation, definitions, versions, today } = input;
  const endDay = req.endDay ?? today;
  const compare = req.compare ?? true;
  const lookupDay = req.version === 'today' ? today : endDay;
  const version = versionInForce(versions, lookupDay) ?? versions[0];
  if (!version) throw new Error('No benchmark version configured');

  const index = buildIndex(events);
  const attributed = attributeEvents(events, organisation.mappings, definitions);
  const teams = [...organisation.teams].sort((a, b) => a.name.localeCompare(b.name));

  const teamCells = new Map<string, GridCell[]>(teams.map((t) => [t.id, []]));
  const orgCells: GridCell[] = [];
  const metrics = REGISTRY.map((def) => {
    const windowDays = req.windowDays ?? def.defaultWindowDays;
    const window = lastNDays(endDay, windowDays);
    const prev = previousWindow(window);

    const measure = (w: typeof window) =>
      teams.map((t) => {
        const ev = attributed.get(t.id) ?? EMPTY_EVENTS;
        return def.measure(ev, contextFor(index, definitions, w, coverageDays(organisation.mappings, t.id, w)));
      });
    const cur = measure(window);
    const old = compare ? measure(prev) : [];

    const cell = (m: Measurement, o: Measurement | undefined, profile: ProfileId, isOrg: boolean): GridCell => {
      const agg = isOrg ? def.aggregation : {};
      const gradedValue = valueForGrading(agg, m);
      return {
        metricId: def.id,
        value: finalize(m),
        gradedValue,
        sampleSize: m.sampleSize,
        grade: gradeMetric(def, gradedValue, m.sampleSize, version, profile),
        thresholds: thresholdsFor(version, profile, def.id),
        bar: barFor(version, profile, def.id),
        trend: o
          ? trendOf(def, { value: gradedValue, sampleSize: m.sampleSize }, { value: valueForGrading(agg, o), sampleSize: o.sampleSize })
          : null,
      };
    };

    teams.forEach((t, i) => teamCells.get(t.id)!.push(cell(cur[i]!, old[i], t.profileId, false)));
    orgCells.push(
      cell(pool(def.minSample.noun, cur), compare ? pool(def.minSample.noun, old) : undefined, 'product', true),
    );
    return { id: def.id, name: def.name, unitLabel: def.unitLabel, windowDays, graded: def.graded, group: def.group };
  });

  return {
    endDay,
    benchmarkVersion: version.number,
    benchmarkEffectiveFrom: version.effectiveFrom,
    metrics,
    rows: teams.map((t) => ({
      teamId: t.id, teamName: t.name, profileId: t.profileId, groupId: t.groupId, cells: teamCells.get(t.id)!,
    })),
    org: { cells: orgCells },
  };
}

export interface GridDeps {
  readonly eventStore: EventStore;
  readonly configStore: ConfigStore;
  readonly clock: Clock;
}

/** Load raw events (covering `window`) and config: everything computeBenchmarkGrid needs. */
export async function loadGridInput(deps: GridDeps, window: Window): Promise<Omit<GridInput, 'today'>> {
  const [organisation, definitions, versions] = await Promise.all([
    deps.configStore.loadOrganisation(),
    deps.configStore.loadDefinitions(),
    deps.configStore.loadBenchmarkVersions(),
  ]);
  const doneStatuses = Object.entries(definitions.statusClasses)
    .filter(([, c]) => c === 'done')
    .map(([s]) => s);
  const events = await deps.eventStore.loadEvents({ window, doneStatuses });
  return { events, organisation, definitions, versions };
}

/** Load raw events and config, then compute the grid on read. */
export async function getBenchmarkGrid(deps: GridDeps, req: GridRequest = {}): Promise<BenchmarkGrid> {
  const today = instantToDay(deps.clock.now());
  const endDay = req.endDay ?? today;
  const longest = Math.max(req.windowDays ?? 0, ...REGISTRY.map((m) => m.defaultWindowDays));
  const from = lastNDays(endDay, longest * (req.compare === false ? 1 : 2)).from;
  const input = await loadGridInput(deps, { from, to: lastNDays(endDay, 1).to });
  return computeBenchmarkGrid({ ...input, today }, req);
}
