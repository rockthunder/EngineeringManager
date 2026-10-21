import { SimWorld } from '../src/adapters/driven/fake-source/sim';
import { createPool, migrate, postgresStores } from '../src/adapters/driven/postgres';
import { systemClock } from '../src/adapters/driven/system-clock/system-clock';
import { DATABASE_URL } from './migrate';

const pool = createPool(DATABASE_URL);
await migrate(pool);
const stores = postgresStores(pool);

if ((await stores.config.loadOrganisation()).teams.length > 0) {
  console.log('Already seeded. To start over: docker compose down -v && npm run dev');
} else {
  const world = await SimWorld.boot(stores, systemClock.now());
  for (const r of await stores.sync.listRuns()) {
    console.log(`${r.stream.padEnd(14)} upserted ${String(r.upserted).padStart(5)}`);
  }
  console.log(`Seeded 12 months of dummy data ending ${world.watermarkDay}.`);
}
await pool.end();
