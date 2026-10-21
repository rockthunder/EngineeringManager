import { createPool, postgresStores } from '../src/adapters/driven/postgres';
import { fixedClock } from '../src/adapters/driven/system-clock/system-clock';
import { getBenchmarkGrid } from '../src/application/use-cases/benchmark-grid';
import { dayToInstant, MS_PER_DAY } from '../src/domain/time/day';
import { DATABASE_URL } from './migrate';
import { formatGrid } from './format-grid';

// Usage: npm run grid [-- --as-of 2026-10-21] [-- --days 30|default]   (default = each metric's own window)
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const pool = createPool(DATABASE_URL);
const stores = postgresStores(pool);
const runs = await stores.sync.listRuns();
const last = runs[runs.length - 1];
const asOf = arg('as-of') ?? (last ? new Date(last.startedAt).toISOString().slice(0, 10) : undefined);
if (!asOf) {
  console.error('No data yet. Run: npm run seed');
  process.exit(1);
}
const clock = fixedClock(dayToInstant(asOf) + MS_PER_DAY / 2);
const grid = await getBenchmarkGrid({ eventStore: stores.events, configStore: stores.config, clock }, { ...(arg('days') === 'default' ? {} : { windowDays: Number(arg('days') ?? 30) }) });
console.log(formatGrid(grid));
await pool.end();
