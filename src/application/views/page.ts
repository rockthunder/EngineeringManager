import type { SyncStore } from '../ports/sync-store';
import type { AppSettings } from '../settings';
import type { PageContext, RangeKey } from './contract';

/** "Data as of": when the last successful poll finished. */
export async function dataAsOf(sync: SyncStore): Promise<string | null> {
  const runs = await sync.listRuns();
  const done = runs.filter((r) => r.status === 'succeeded' && r.finishedAt !== null);
  const last = done.reduce<number | null>((m, r) => (m === null || r.finishedAt! > m ? r.finishedAt : m), null);
  return last === null ? null : new Date(last).toISOString();
}

export function pageContext(
  grid: { endDay: string; benchmarkVersion: number; benchmarkEffectiveFrom: string },
  settings: AppSettings,
  asOf: string | null,
  range: RangeKey,
): PageContext {
  return {
    endDay: grid.endDay,
    benchmarkVersion: grid.benchmarkVersion,
    benchmarkEffectiveFrom: grid.benchmarkEffectiveFrom,
    dataAsOf: asOf,
    colourMode: settings.colourMode,
    colours: settings.colours,
    range,
  };
}

