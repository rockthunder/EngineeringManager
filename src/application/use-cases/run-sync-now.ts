import { syncSource, type SyncDeps, type SyncResult } from './sync-source';

export interface RunNowDeps extends SyncDeps {
  /** For simulated sources: reveal the next day of events before polling. */
  readonly advance?: () => Promise<void>;
}

/** The "Run now" button: poll the source immediately (for the fake source, one more simulated day). */
export async function runSyncNow(deps: RunNowDeps): Promise<SyncResult[]> {
  await deps.advance?.();
  return syncSource(deps);
}
