import type { SourceDefinitions, StatusClass } from '../../domain/events/definitions';
import { ALL_STREAMS } from '../ports/source';
import { instantToDay } from '../../domain/time/day';
import { ValidationError } from '../errors';
import type { Clock } from '../ports/clock';
import type { ConfigStore } from '../ports/config-store';
import type { SettingsStore } from '../ports/settings-store';
import type { SyncStore } from '../ports/sync-store';
import { loadSettings } from '../settings';
import type { DataSourcesView, StreamStatus } from '../views/contract';
import { dataAsOf } from '../views/page';

interface Deps {
  readonly configStore: ConfigStore;
  readonly settingsStore: SettingsStore;
  readonly syncStore: SyncStore;
  readonly clock: Clock;
}

export interface SimInfo {
  readonly simulated: boolean;
  readonly watermarkDay: string | null;
}

export async function getDataSources(deps: Deps, sim: SimInfo, sourceName = 'fake'): Promise<DataSourcesView> {
  const [runs, settings, definitions, asOf] = await Promise.all([
    deps.syncStore.listRuns(sourceName),
    loadSettings(deps.settingsStore),
    deps.configStore.loadDefinitions(),
    dataAsOf(deps.syncStore),
  ]);
  const streams: StreamStatus[] = ALL_STREAMS.map((stream) => {
    const mine = runs.filter((r) => r.stream === stream);
    const last = mine[mine.length - 1];
    const cursor = [...mine].reverse().find((r) => r.cursorAfter !== null)?.cursorAfter ?? null;
    return {
      stream,
      status: last ? last.status : 'never',
      lastRunAt: last ? new Date(last.finishedAt ?? last.startedAt).toISOString() : null,
      upserted: last?.upserted ?? 0,
      error: last?.error ?? null,
      cursor,
    };
  });
  return {
    today: instantToDay(deps.clock.now()),
    dataAsOf: asOf,
    simulated: sim.simulated,
    watermarkDay: sim.watermarkDay,
    pollEveryHours: settings.pollEveryHours,
    backfillDays: settings.backfillDays,
    sources: [{ name: sourceName, label: sim.simulated ? 'Dummy data (fake source)' : sourceName, streams }],
    recentRuns: runs.slice(-10).reverse().map((r) => ({
      id: r.id, stream: r.stream, status: r.status, startedAt: new Date(r.startedAt).toISOString(), upserted: r.upserted, error: r.error,
      mode: r.cursorBefore === null ? 'backfill' : 'incremental',
    })),
    definitions,
  };
}

const CLASSES: readonly StatusClass[] = ['todo', 'active', 'waiting', 'done'];
const CATEGORIES = ['new_capability', 'maintenance', 'defect', 'tech_debt'] as const;

/** Definitions that need setting up per source; metrics recompute from raw events, so changes show immediately. */
export async function updateDefinitions(deps: Deps, defs: SourceDefinitions): Promise<void> {
  if (!defs.productionEnvironment?.trim()) throw new ValidationError('Name the environment that counts as production');
  if (!defs.foundInProductionLabel?.trim() || !defs.hotfixLabel?.trim()) throw new ValidationError('Labels cannot be empty');
  for (const [status, cls] of Object.entries(defs.statusClasses)) {
    if (!CLASSES.includes(cls)) throw new ValidationError(`${status}: ${String(cls)} is not todo, active, waiting or done`);
  }
  if (!Object.values(defs.statusClasses).includes('done')) throw new ValidationError('At least one status must be classed as done');
  for (const c of [...Object.values(defs.issueTypeCategories), ...Object.values(defs.categoryLabels)]) {
    if (!(CATEGORIES as readonly string[]).includes(c)) throw new ValidationError(`Unknown category: ${c}`);
  }
  await deps.configStore.saveDefinitions(defs);
}
