import type { FastifyInstance } from 'fastify';
import { BasicAuthProvider } from '../../src/adapters/driven/auth-basic/basic-auth-provider';
import { hashPassword } from '../../src/adapters/driven/auth-basic/password';
import { SimWorld } from '../../src/adapters/driven/fake-source/sim';
import { postgresStores, type Stores } from '../../src/adapters/driven/postgres';
import { buildApp } from '../../src/adapters/driving/http/app';
import type { ViewDeps } from '../../src/application/use-cases/team-benchmark';
import { dayToInstant } from '../../src/domain/time/day';
import { ANCHOR } from './constants';
import type { TestDb } from './postgres';

export interface TestApp {
  readonly app: FastifyInstance;
  readonly stores: Stores;
  readonly deps: ViewDeps;
  readonly sim: SimWorld;
  /** Cookies for a signed-in admin. */
  readonly cookies: { session: string };
  get<T>(url: string): Promise<T>;
  send<T>(method: 'POST' | 'PUT', url: string, payload: unknown): Promise<{ status: number; body: T }>;
}

/** The real HTTP app over a database clone, signed in as admin, with the simulated world behind "Run now". */
export async function startApp(db: TestDb): Promise<TestApp> {
  const stores = postgresStores(db.pool);
  await stores.users.upsert('admin', await hashPassword('admin'));
  const sim = await SimWorld.boot(stores, dayToInstant(ANCHOR) + 9 * 3_600_000);
  const auth = new BasicAuthProvider(stores.users);
  const app = buildApp({
    stores, auth, clock: sim.clock, authClock: { now: () => Date.now() },
    sync: { source: sim.source.asSourceSet(), advance: () => sim.advance(), watermarkDay: () => sim.watermarkDay },
  });
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'admin', password: 'admin' } });
  const cookies = { session: res.cookies.find((c) => c.name === 'session')!.value };
  return {
    app, stores, sim, cookies,
    deps: {
      eventStore: stores.events, configStore: stores.config, settingsStore: stores.settings, syncStore: stores.sync, clock: sim.clock,
    },
    async get<T>(url: string) {
      const r = await app.inject({ url, cookies });
      if (r.statusCode !== 200) throw new Error(`${url} → ${r.statusCode} ${r.body}`);
      return r.json<T>();
    },
    async send<T>(method: 'POST' | 'PUT', url: string, payload: unknown) {
      const r = await app.inject({ method, url, cookies, payload: payload as object });
      return { status: r.statusCode, body: r.json<T>() };
    },
  };
}
