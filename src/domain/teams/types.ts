import type { Day } from '../time/day';

export type TeamId = string;
export type ProfileId = 'product' | 'platform';
export type MappingKind = 'repo' | 'board' | 'service';

export interface Profile {
  readonly id: ProfileId;
  readonly name: string;
}

export interface Group {
  readonly id: string;
  readonly name: string;
}

export interface Team {
  readonly id: TeamId;
  readonly name: string;
  readonly profileId: ProfileId;
  readonly groupId: string;
  readonly headcount: number;
  readonly archived: boolean;
}

/** Team ↔ repo/board/service over [effectiveFrom, effectiveTo). `effectiveTo` null = open-ended. */
export interface Mapping {
  readonly teamId: TeamId;
  readonly kind: MappingKind;
  readonly ref: string;
  readonly effectiveFrom: Day;
  readonly effectiveTo: Day | null;
}
