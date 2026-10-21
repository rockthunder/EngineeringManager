import type { Clock } from '../../../application/ports/clock';
import type { ConfigStore } from '../../../application/ports/config-store';
import type { EventStore } from '../../../application/ports/event-store';
import type { SyncStore } from '../../../application/ports/sync-store';
import { syncSource, type SyncResult } from '../../../application/use-cases/sync-source';
import type { FakeSource } from './fake-source';
import { dummySurveyResponses } from './survey-seed';

export const DEFAULT_SEED = 20261021;

/**
 * Load the dummy organisation, definitions, benchmark versions (Bar v1, then Bar v2 three months
 * ago) and survey responses, then backfill 12 months of events through the normal sync path.
 * For an empty database only.
 */
export async function seedDummyData(
  stores: { config: ConfigStore; events: EventStore; sync: SyncStore },
  source: FakeSource,
  clock: Clock,
): Promise<SyncResult[]> {
  const sc = source.scenario;
  await stores.config.saveOrganisation(sc.organisation);
  await stores.config.saveDefinitions(sc.definitions);
  for (const v of sc.benchmarkVersions) await stores.config.appendBenchmarkVersion(v);
  await stores.events.putSurveyResponses(dummySurveyResponses(source.options.seed, sc));
  return syncSource({ source: source.asSourceSet(), syncStore: stores.sync, clock });
}
