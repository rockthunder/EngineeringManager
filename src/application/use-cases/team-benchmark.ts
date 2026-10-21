import { instantToDay } from '../../domain/time/day';
import type { Clock } from '../ports/clock';
import type { ConfigStore } from '../ports/config-store';
import type { EventStore } from '../ports/event-store';
import type { SettingsStore } from '../ports/settings-store';
import type { SyncStore } from '../ports/sync-store';
import { resolveRange, type RangeInput } from '../range';
import { loadSettings, rangeFor } from '../settings';
import type { GridView } from '../views/contract';
import { cellView } from '../views/grid-view';
import { dataAsOf, pageContext } from '../views/page';
import { getBenchmarkGrid } from './benchmark-grid';

export interface ViewDeps {
  readonly eventStore: EventStore;
  readonly configStore: ConfigStore;
  readonly settingsStore: SettingsStore;
  readonly syncStore: SyncStore;
  readonly clock: Clock;
}

export interface TeamBenchmarkRequest {
  /** Omitted = the screen's default from Settings. */
  readonly range?: RangeInput;
  readonly compare?: boolean;
  readonly version?: 'in_force' | 'today';
  readonly groupId?: string | null;
  readonly profileId?: string | null;
}

/** The Director's grid: teams × metrics against the bar, with the org row at the foot. */
export async function getTeamBenchmark(deps: ViewDeps, req: TeamBenchmarkRequest = {}): Promise<GridView> {
  const settings = await loadSettings(deps.settingsStore);
  const today = instantToDay(deps.clock.now());
  const range = req.range ?? { range: rangeFor(settings, 'team-benchmark') };
  const { endDay, windowDays } = resolveRange(range, today);

  const [grid, org, asOf] = await Promise.all([
    getBenchmarkGrid(deps, {
      endDay, compare: req.compare ?? true, version: req.version ?? 'in_force',
      ...(windowDays === undefined ? {} : { windowDays }),
    }),
    deps.configStore.loadOrganisation(),
    dataAsOf(deps.syncStore),
  ]);

  const rows = grid.rows.filter(
    (r) => (!req.groupId || r.groupId === req.groupId) && (!req.profileId || r.profileId === req.profileId),
  );
  return {
    ...pageContext(grid, settings, asOf, range.range),
    metrics: grid.metrics,
    rows: rows.map((r) => ({
      teamId: r.teamId, teamName: r.teamName, profile: r.profileId, groupId: r.groupId,
      cells: r.cells.map((c) => cellView(c, settings)),
    })),
    org: { cells: grid.org.cells.map((c) => cellView(c, settings)) },
    groups: org.groups.map((g) => ({ id: g.id, name: g.name })),
    profiles: org.profiles.map((p) => ({ id: p.id, name: p.name })),
    filters: { groupId: req.groupId ?? null, profileId: req.profileId ?? null },
  };
}
