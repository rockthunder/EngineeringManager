/** A UTC calendar day, 'YYYY-MM-DD'. */
export type Day = string & { readonly __brand?: 'Day' };

/** Epoch milliseconds, UTC. */
export type Instant = number;
