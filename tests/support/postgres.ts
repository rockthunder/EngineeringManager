import { randomBytes } from 'node:crypto';
import { createPool, type Pool } from '../../src/adapters/driven/postgres';

export function urlFor(adminUrl: string, database: string): string {
  const u = new URL(adminUrl);
  u.pathname = `/${database}`;
  return u.toString();
}

export interface TestDb {
  readonly url: string;
  readonly pool: Pool;
  drop(): Promise<void>;
}

/** A private copy of a template database ('migrated' = empty schema, 'seeded' = dummy data). */
export async function cloneDatabase(adminUrl: string, template: 'migrated' | 'seeded'): Promise<TestDb> {
  const name = `t_${randomBytes(6).toString('hex')}`;
  const admin = createPool(adminUrl);
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ${template}`);
  await admin.end();
  const url = urlFor(adminUrl, name);
  const pool = createPool(url);
  return {
    url,
    pool,
    async drop() {
      await pool.end();
      const a = createPool(adminUrl);
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}
