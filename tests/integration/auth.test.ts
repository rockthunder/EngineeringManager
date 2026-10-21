import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { BasicAuthProvider } from '../../src/adapters/driven/auth-basic/basic-auth-provider';
import { hashPassword } from '../../src/adapters/driven/auth-basic/password';
import { postgresStores, type Stores } from '../../src/adapters/driven/postgres';
import { buildApp } from '../../src/adapters/driving/http/app';
import { SESSION_TTL_MS } from '../../src/application/use-cases/auth';
import { cloneDatabase, type TestDb } from '../support/postgres';
import { clock } from '../support/constants';

let db: TestDb;
let stores: Stores;
let wallNow = 1_800_000_000_000;
let app: FastifyInstance;

beforeAll(async () => {
  db = await cloneDatabase(inject('pgAdminUrl'), 'migrated');
  stores = postgresStores(db.pool);
  await stores.users.upsert('admin', await hashPassword('correct horse'));
  app = buildApp({
    stores,
    auth: new BasicAuthProvider(stores.users),
    clock,
    authClock: { now: () => wallNow },
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.drop();
});

const signIn = (password = 'correct horse', username = 'admin') =>
  app.inject({ method: 'POST', url: '/api/login', payload: { username, password } });

const cookieOf = (res: Awaited<ReturnType<typeof signIn>>) => {
  const c = res.cookies.find((x) => x.name === 'session');
  return c ? { session: c.value } : undefined;
};

describe('basic auth over HTTP', () => {
  it('rejects API calls without a session, but serves /health', async () => {
    expect((await app.inject({ url: '/api/me' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
  });

  it('logs in with the right password and sets a hardened session cookie', async () => {
    const res = await signIn();
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ username: 'admin', role: 'admin' });
    const c = res.cookies.find((x) => x.name === 'session')!;
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(c.maxAge).toBe(SESSION_TTL_MS / 1000);
    const me = await app.inject({ url: '/api/me', cookies: { session: c.value } });
    expect(me.json().user.username).toBe('admin');
  });

  it('rejects a wrong password and an unknown user the same way, setting no cookie', async () => {
    for (const res of [await signIn('nope'), await signIn('correct horse', 'ghost')]) {
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Invalid username or password' });
      expect(res.cookies).toHaveLength(0);
    }
  });

  it('stores only a hash of the password and of the session token', async () => {
    const res = await signIn();
    const token = cookieOf(res)!.session;
    const users = await db.pool.query('SELECT password_hash FROM users');
    expect(users.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(users.rows[0].password_hash).not.toContain('correct horse');
    const sessions = await db.pool.query('SELECT token_hash FROM sessions');
    expect(sessions.rows.map((r) => r.token_hash)).not.toContain(token);
  });

  it('logs out: the token stops working', async () => {
    const cookies = cookieOf(await signIn())!;
    expect((await app.inject({ method: 'POST', url: '/api/logout', cookies })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/me', cookies })).statusCode).toBe(401);
  });

  it('expires sessions after the TTL', async () => {
    const cookies = cookieOf(await signIn())!;
    wallNow += SESSION_TTL_MS - 1000;
    expect((await app.inject({ url: '/api/me', cookies })).statusCode).toBe(200);
    wallNow += 2000;
    expect((await app.inject({ url: '/api/me', cookies })).statusCode).toBe(401);
  });

  it('ignores a forged or empty cookie', async () => {
    expect((await app.inject({ url: '/api/me', cookies: { session: 'forged' } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/me', cookies: { session: '' } })).statusCode).toBe(401);
  });
});

