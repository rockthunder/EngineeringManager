import type { FastifyInstance } from 'fastify';
import { BasicAuthProvider } from '../../src/adapters/driven/auth-basic/basic-auth-provider';
import { hashPassword } from '../../src/adapters/driven/auth-basic/password';
import { postgresStores, type Stores } from '../../src/adapters/driven/postgres';
import { buildApp } from '../../src/adapters/driving/http/app';
import type { ViewDeps } from '../../src/application/use-cases/team-benchmark';
import type { TestDb } from './postgres';
import { clock } from './constants';

export interface TestApp {
  readonly app: FastifyInstance;
  readonly stores: Stores;
  readonly deps: ViewDeps;
  /** Cookies for a signed-in admin. */
  readonly cookies: { session: string };
}

/** The real HTTP app over a database clone, already signed in as admin. */
export async function startApp(db: TestDb): Promise<TestApp> {
  const stores = postgresStores(db.pool);
  await stores.users.upsert('admin', await hashPassword('admin'));
  const app = buildApp({
    stores, auth: new BasicAuthProvider(stores.users), clock, authClock: { now: () => Date.now() },
  });
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'admin', password: 'admin' } });
  const session = res.cookies.find((c) => c.name === 'session')!.value;
  return {
    app, stores, cookies: { session },
    deps: {
      eventStore: stores.events, configStore: stores.config, settingsStore: stores.settings, syncStore: stores.sync, clock,
    },
  };
}

export { postgresStores };
