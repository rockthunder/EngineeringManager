import type { Day, Instant } from '../time/day';

/**
 * Raw events as stored. Team-only rule: nothing here identifies a person, and nothing
 * carries a team (team is derived from effective-dated mappings at read time).
 */
export interface SourceRef {
  readonly source: string;
  readonly sourceId: string;
  /** When the source last changed this record; upserts never regress this. */
  readonly updatedAt: Instant;
}

export interface Deployment extends SourceRef {
  readonly repo: string;
  readonly environment: string;
  readonly at: Instant;
  readonly commitShas: readonly string[];
  /** Unplanned fix to production (hotfix). */
  readonly isRework: boolean;
  readonly isRollback: boolean;
}

export interface PullRequest extends SourceRef {
  readonly repo: string;
  readonly firstCommitAt: Instant;
  readonly openedAt: Instant;
  readonly firstReviewAt: Instant | null;
  readonly mergedAt: Instant | null;
  readonly linesChanged: number;
  /** sourceId of the deployment that shipped this change, once known. */
  readonly deploymentId: string | null;
}

export interface StatusTransition {
  readonly from: string | null;
  readonly to: string;
  readonly at: Instant;
}

export interface SprintMembership {
  readonly sprintId: string;
  readonly addedAt: Instant;
}

export interface WorkItem extends SourceRef {
  readonly key: string;
  readonly type: string;
  readonly labels: readonly string[];
  readonly board: string;
  readonly createdAt: Instant;
  readonly foundInProduction: boolean;
  readonly sprintMemberships: readonly SprintMembership[];
  /** Ordered by time. */
  readonly transitions: readonly StatusTransition[];
}

export interface Sprint extends SourceRef {
  readonly board: string;
  readonly startAt: Instant;
  readonly endAt: Instant;
  readonly committedItemIds: readonly string[];
  readonly completedItemIds: readonly string[];
}

export interface Incident extends SourceRef {
  readonly service: string;
  readonly startedAt: Instant;
  readonly restoredAt: Instant | null;
  readonly deploymentId: string | null;
}

/** Anonymous: no name, email, IP or user agent; submission time rounded to the day. */
export interface SurveyResponse {
  readonly id: string;
  readonly campaignId: string;
  readonly teamId: string;
  readonly submittedDay: Day;
  /** Answers to the questions tagged as part of the DevEx score, each 1–5. */
  readonly scoreAnswers: readonly number[];
  readonly otherAnswers: Readonly<Record<string, string | number>>;
}

export interface EventSet {
  readonly deployments: readonly Deployment[];
  readonly pullRequests: readonly PullRequest[];
  readonly workItems: readonly WorkItem[];
  readonly sprints: readonly Sprint[];
  readonly incidents: readonly Incident[];
  readonly surveyResponses: readonly SurveyResponse[];
}

export const EMPTY_EVENTS: EventSet = {
  deployments: [],
  pullRequests: [],
  workItems: [],
  sprints: [],
  incidents: [],
  surveyResponses: [],
};
