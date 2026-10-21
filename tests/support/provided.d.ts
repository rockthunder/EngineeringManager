import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URI of the Testcontainers Postgres server (admin database). */
    pgAdminUrl: string;
  }
}
