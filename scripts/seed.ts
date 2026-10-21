import { DEFAULT_SEED, seedDummyData } from '../src/adapters/driven/fake-source/seed';
import { FakeSource } from '../src/adapters/driven/fake-source/fake-source';
import { createPool, migrate, postgresStores } from '../src/adapters/driven/postgres';
import { systemClock } from '../src/adapters/driven/system-clock/system-clock';
import { instantToDay } from '../src/domain/time/day';
import { DATABASE_URL } from './migrate';

const pool = createPool(DATABASE_URL);
await migrate(pool);
const stores = postgresStores(pool);

if ((await stores.config.loadOrganisation()).teams.length > 0) {
  console.log('Already seeded. To start over: docker compose down -v && npm run dev');
} else {
  const anchorDay = instantToDay(systemClock.now());
  const source = new FakeSource({ seed: DEFAULT_SEED, anchorDay });
  const results = await seedDummyData(stores, source, systemClock);
  for (const r of results) console.log(`${r.stream.padEnd(14)} ${r.mode}  fetched ${r.fetched}  upserted ${r.upserted}  pages ${r.pages}`);
  console.log(`Seeded 12 months of dummy data ending ${anchorDay}.`);
}
await pool.end();
