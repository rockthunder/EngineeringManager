import type { BenchmarkVersion } from '../../domain/benchmarks/version';
import type { SourceDefinitions } from '../../domain/events/definitions';
import type { Organisation } from '../../domain/teams/organisation';

export interface ConfigStore {
  loadOrganisation(): Promise<Organisation>;
  saveOrganisation(org: Organisation): Promise<void>;
  loadDefinitions(): Promise<SourceDefinitions>;
  saveDefinitions(defs: SourceDefinitions): Promise<void>;
  /** All versions, oldest first. */
  loadBenchmarkVersions(): Promise<readonly BenchmarkVersion[]>;
  /** Versions are immutable: this only appends. */
  appendBenchmarkVersion(version: BenchmarkVersion): Promise<void>;
}
