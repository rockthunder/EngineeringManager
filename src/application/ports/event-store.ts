import type { EventSet, SurveyResponse } from '../../domain/events/types';
import type { Window } from '../../domain/time/day';

export interface EventQuery {
  /** Events whose lifetime overlaps [from, to). */
  readonly window: Window;
  /** Statuses classed as done, so still-open work items are always included. */
  readonly doneStatuses: readonly string[];
}

/** Raw events, read back for computing metrics. Writes go through SyncStore (atomic with the cursor). */
export interface KnownRefs {
  readonly repo: readonly string[];
  readonly board: readonly string[];
  readonly service: readonly string[];
}

export interface EventStore {
  /** Every repo, board and service seen in the data, so it can be mapped to a team. */
  distinctRefs(): Promise<KnownRefs>;
  loadEvents(query: EventQuery): Promise<EventSet>;
  putSurveyResponses(responses: readonly SurveyResponse[]): Promise<void>;
}
