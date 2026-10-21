import { BasicAuthProvider } from './adapters/driven/auth-basic/basic-auth-provider';
import { hashPassword } from './adapters/driven/auth-basic/password';
import { SimWorld } from './adapters/driven/fake-source/sim';
import { createPool, migrate, postgresStores } from './adapters/driven/postgres';
import { systemClock } from './adapters/driven/system-clock/system-clock';
import { buildApp } from './adapters/driving/http/app';

const port = Number(process.env['PORT'] ?? 3000);
const databaseUrl = process.env['DATABASE_URL'] ?? 'postgres://dashboard:dashboard@localhost:5433/dashboard';

const pool = createPool(databaseUrl);
await migrate(pool);
const stores = postgresStores(pool);

// Dummy-data build: one admin, created on first boot. Change ADMIN_PASSWORD outside local use.
if ((await stores.users.count()) === 0) {
  await stores.users.upsert('admin', await hashPassword(process.env['ADMIN_PASSWORD'] ?? 'admin'));
}

const sim = await SimWorld.boot(stores, systemClock.now());
const app = buildApp({
  stores,
  auth: new BasicAuthProvider(stores.users),
  clock: sim.clock,
  authClock: systemClock,
  sync: { source: sim.source.asSourceSet(), advance: () => sim.advance(), watermarkDay: () => sim.watermarkDay },
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`api listening on :${port} (dummy world at ${sim.watermarkDay})`);
