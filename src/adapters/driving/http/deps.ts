import type { AuthProvider, AuthUser } from '../../../application/ports/auth';
import type { Clock } from '../../../application/ports/clock';
import type { IdGenerator } from '../../../application/ports/ids';
import type { SourceSet } from '../../../application/ports/source';
import type { Stores } from '../../driven/postgres';

/** Everything the routes need, injected by the composition root (main.ts) or by tests. */
export interface AppDeps {
  readonly stores: Stores;
  readonly auth: AuthProvider;
  /** The data clock: "today" for windows and trends (simulated for the dummy world). */
  readonly clock: Clock;
  /** Wall-clock time, for session expiry. */
  readonly authClock: Clock;
  /** The source behind "Run now"; `advance` reveals the next simulated day for the fake source. */
  readonly sync?: {
    readonly source: SourceSet;
    readonly advance?: () => Promise<void>;
    /** For the dummy world: the simulated watermark day. */
    readonly watermarkDay?: () => string;
  };
  /** Defaults to crypto-random ids and tokens. */
  readonly ids?: IdGenerator;
  readonly secureCookies?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
