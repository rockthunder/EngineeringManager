import { createPool, migrate } from '../src/adapters/driven/postgres';

export const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgres://dashboard:dashboard@localhost:5433/dashboard';

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = createPool(DATABASE_URL);
  const applied = await migrate(pool);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date');
  await pool.end();
}
