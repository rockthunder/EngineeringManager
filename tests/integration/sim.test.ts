import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { SimWorld } from '../../src/adapters/driven/fake-source/sim';
import { postgresStores, type Stores } from '../../src/adapters/driven/postgres';
import { getBenchmarkGrid } from '../../src/application/use-cases/benchmark-grid';
import { runSyncNow } from '../../src/application/use-cases/run-sync-now';
import { dayToInstant } from '../../src/domain/time/day';
import { cloneDatabase, type TestDb } from '../support/postgres';

const REAL_NOW = dayToInstant('2026-10-21') + 9 * 3_600_000;

let db: TestDb;
let stores: Stores;
let world: SimWorld;

beforeAll(async () => {
  db = await cloneDatabase(inject('pgAdminUrl'), 'migrated');
  stores = postgresStores(db.pool);
  world = await SimWorld.boot(stores, REAL_NOW);
});
afterAll(() => db.drop());

describe('simulated world', () => {
  it('seeds an empty database on first boot and anchors "today" at noon of the anchor day', async () => {
    expect((await stores.config.loadOrganisation()).teams).toHaveLength(10);
    expect(world.watermarkDay).toBe('2026-10-21');
    expect(world.clock.now()).toBe(dayToInstant('2026-10-21') + 12 * 3_600_000);
  });

  it('"Run now" reveals one more day, moves the clock and data-as-of with it, and syncs only the new day', async () => {
    const before = (await stores.sync.listRuns()).length;
    const results = await runSyncNow({
      source: world.source.asSourceSet(), syncStore: stores.sync, clock: world.clock, advance: () => world.advance(),
    });
    expect(world.watermarkDay).toBe('2026-10-22');
    expect(results.every((r) => r.mode === 'incremental')).toBe(true);
    const fetched = results.reduce((a, r) => a + r.fetched, 0);
    expect(fetched).toBeGreaterThan(0);
    expect(fetched).toBeLessThan(150);
    expect((await stores.sync.listRuns()).length).toBe(before + 5);

    const grid = await getBenchmarkGrid({ eventStore: stores.events, configStore: stores.config, clock: world.clock }, { windowDays: 30 });
    expect(grid.endDay).toBe('2026-10-22');
  });

  it('survives a restart: the world resumes where it was instead of rewinding', async () => {
    const again = await SimWorld.boot(stores, REAL_NOW + 5 * 86_400_000);
    expect(again.watermarkDay).toBe('2026-10-22');
    expect(again.source.watermark).toBe('2026-10-22');
    // The restarted source serves nothing new: the database already has everything up to that day.
    const results = await runSyncNow({ source: again.source.asSourceSet(), syncStore: stores.sync, clock: again.clock });
    expect(results.every((r) => r.fetched === 0)).toBe(true);
  });
});
