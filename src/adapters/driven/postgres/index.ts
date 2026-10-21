import type { ConfigStore } from '../../../application/ports/config-store';
import type { EventStore } from '../../../application/ports/event-store';
import type { AuthUser, SessionStore } from '../../../application/ports/auth';
import type { SettingsStore } from '../../../application/ports/settings-store';
import type { SurveyStore } from '../../../application/ports/survey-store';
import type { SyncStore } from '../../../application/ports/sync-store';
import { PostgresSessionStore, PostgresSettingsStore, PostgresUserStore } from './auth-store';
import { PostgresConfigStore } from './config-store';
import { PostgresEventStore } from './event-store';
import { createPool, type Pool } from './pool';
import { PostgresSurveyStore } from './survey-store';
import { PostgresSyncStore } from './sync-store';

export interface Stores {
  readonly pool: Pool;
  readonly events: EventStore;
  readonly config: ConfigStore;
  readonly sync: SyncStore;
  readonly settings: SettingsStore;
  readonly users: PostgresUserStore;
  readonly sessions: SessionStore;
  readonly surveys: SurveyStore;
}

export function postgresStores(pool: Pool): Stores {
  return {
    pool,
    events: new PostgresEventStore(pool),
    config: new PostgresConfigStore(pool),
    sync: new PostgresSyncStore(pool),
    settings: new PostgresSettingsStore(pool),
    users: new PostgresUserStore(pool),
    sessions: new PostgresSessionStore(pool),
    surveys: new PostgresSurveyStore(pool),
  };
}

export type { AuthUser };
export { createPool, type Pool };
export { migrate } from './migrate';
