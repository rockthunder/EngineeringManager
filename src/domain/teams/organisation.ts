import type { Group, Mapping, Profile, Team } from './types';

/** Teams, groups, profiles and their effective-dated mappings: the config that interprets raw events. */
export interface Organisation {
  readonly profiles: readonly Profile[];
  readonly groups: readonly Group[];
  readonly teams: readonly Team[];
  readonly mappings: readonly Mapping[];
}
