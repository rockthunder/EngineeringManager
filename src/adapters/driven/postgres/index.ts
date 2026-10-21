import type { ConfigStore } from '../../../application/ports/config-store';
import type { EventStore } from '../../../application/ports/event-store';
import type { SyncStore } from '../../../application/ports/sync-store';
import { PostgresConfigStore } from './config-store';
import { PostgresEventStore } from './event-store';
import { createPool, type Pool } from './pool';
import { PostgresSyncStore } from './sync-store';

export interface Stores {
  readonly pool: Pool;
  readonly events: EventStore;
  readonly config: ConfigStore;
  readonly sync: SyncStore;
}

export function postgresStores(pool: Pool): Stores {
  return {
    pool,
    events: new PostgresEventStore(pool),
    config: new PostgresConfigStore(pool),
    sync: new PostgresSyncStore(pool),
  };
}

export { createPool, type Pool };
export { migrate } from './migrate';
