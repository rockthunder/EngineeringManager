import type { EventSet, SurveyResponse } from '../../domain/events/types';
import type { Window } from '../../domain/time/day';

export interface EventQuery {
  /** Events whose lifetime overlaps [from, to). */
  readonly window: Window;
  /** Statuses classed as done, so still-open work items are always included. */
  readonly doneStatuses: readonly string[];
}

/** Raw events, read back for computing metrics. Writes go through SyncStore (atomic with the cursor). */
export interface EventStore {
  loadEvents(query: EventQuery): Promise<EventSet>;
  putSurveyResponses(responses: readonly SurveyResponse[]): Promise<void>;
}
