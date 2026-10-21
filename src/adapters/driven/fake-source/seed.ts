import type { Clock } from '../../../application/ports/clock';
import type { ConfigStore } from '../../../application/ports/config-store';
import type { EventStore } from '../../../application/ports/event-store';
import type { SurveyStore } from '../../../application/ports/survey-store';
import type { SyncStore } from '../../../application/ports/sync-store';
import { CORE_SURVEY } from '../../../domain/surveys/survey';
import { addDays } from '../../../domain/time/day';
import type { IdGenerator } from '../../../application/ports/ids';
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
  stores: { config: ConfigStore; events: EventStore; sync: SyncStore; surveys: SurveyStore },
  source: FakeSource,
  clock: Clock,
  ids: IdGenerator,
): Promise<SyncResult[]> {
  const sc = source.scenario;
  await stores.config.saveOrganisation(sc.organisation);
  await stores.config.saveDefinitions(sc.definitions);
  for (const v of sc.benchmarkVersions) await stores.config.appendBenchmarkVersion(v);
  const responses = dummySurveyResponses(source.options.seed, sc);
  await stores.surveys.saveSurvey(CORE_SURVEY);
  for (const campaignId of [...new Set(responses.map((r) => r.campaignId))].sort()) {
    const opens = campaignId.replace('devex-', '');
    const teamIds = [...new Set(responses.filter((r) => r.campaignId === campaignId).map((r) => r.teamId))].sort();
    await stores.surveys.saveCampaign({
      id: campaignId, surveyId: CORE_SURVEY.id, name: `DevEx survey, opened ${opens}`, opens, closes: addDays(opens, 13), status: 'closed', teamIds,
    });
    await stores.surveys.setTokens(campaignId, Object.fromEntries(teamIds.map((t) => [t, ids.token()])));
  }
  await stores.events.putSurveyResponses(responses);
  return syncSource({ source: source.asSourceSet(), syncStore: stores.sync, clock });
}
