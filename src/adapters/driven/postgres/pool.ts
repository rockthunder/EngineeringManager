import pg from 'pg';

// DATE columns stay 'YYYY-MM-DD' strings (the domain's Day); never local-time Date objects.
pg.types.setTypeParser(1082, (v: string) => v);
// bigint (counts, ids) as numbers: all ours are far below 2^53.
pg.types.setTypeParser(20, (v: string) => Number(v));

export type Pool = pg.Pool;

export function createPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString });
}

export const ms = (t: number | null): Date | null => (t === null ? null : new Date(t));
export const instant = (d: Date | null): number | null => (d === null ? null : d.getTime());
