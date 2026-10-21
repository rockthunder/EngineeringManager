import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { FakeSource } from '../../src/adapters/driven/fake-source/fake-source';
import { DEFAULT_SEED, seedDummyData } from '../../src/adapters/driven/fake-source/seed';
import { createPool, migrate, postgresStores } from '../../src/adapters/driven/postgres';
import { ANCHOR, clock } from './constants';
import { urlFor } from './postgres';

/**
 * One Postgres container per test project. 'migrated' is an empty schema; for the use-case
 * project 'seeded' also holds 12 months of dummy data, loaded once through syncSource and then
 * cloned per test file.
 */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:16').start();
  const adminUrl = container.getConnectionUri();

  const admin = createPool(adminUrl);
  await admin.query('CREATE DATABASE migrated');
  const migrated = createPool(urlFor(adminUrl, 'migrated'));
  await migrate(migrated);
  await migrated.end();

  if (project.name === 'use-cases') {
    await admin.query('CREATE DATABASE seeded TEMPLATE migrated');
    const pool = createPool(urlFor(adminUrl, 'seeded'));
    await seedDummyData(postgresStores(pool), new FakeSource({ seed: DEFAULT_SEED, anchorDay: ANCHOR }), clock);
    await pool.end();
  }
  await admin.end();

  project.provide('pgAdminUrl', adminUrl);
  return async () => {
    await container.stop();
  };
}
