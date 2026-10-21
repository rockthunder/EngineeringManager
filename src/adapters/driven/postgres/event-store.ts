import type { EventQuery, EventStore, KnownRefs } from '../../../application/ports/event-store';
import type {
  Deployment, EventSet, Incident, PullRequest, Sprint, SurveyResponse, WorkItem,
} from '../../../domain/events/types';
import { instant, ms, type Pool } from './pool';

export class PostgresEventStore implements EventStore {
  constructor(private readonly pool: Pool) {}

  async distinctRefs(): Promise<KnownRefs> {
    const col = async (sql: string) => (await this.pool.query<{ ref: string }>(sql)).rows.map((r) => r.ref);
    const [repo, board, service] = await Promise.all([
      col('SELECT repo AS ref FROM deployments UNION SELECT repo FROM pull_requests ORDER BY 1'),
      col('SELECT board AS ref FROM work_items UNION SELECT board FROM sprints ORDER BY 1'),
      col('SELECT service AS ref FROM incidents ORDER BY 1'),
    ]);
    return { repo, board, service: [...new Set(service)] };
  }

  async loadEvents({ window, doneStatuses }: EventQuery): Promise<EventSet> {
    const from = ms(window.from);
    const to = ms(window.to);
    const [deployments, pullRequests, workItems, sprints, incidents, surveyResponses] = await Promise.all([
      this.deployments(from, to),
      this.pullRequests(from, to),
      this.workItems(from, to, doneStatuses),
      this.sprints(from, to),
      this.incidents(from, to),
      this.surveys(),
    ]);
    return { deployments, pullRequests, workItems, sprints, incidents, surveyResponses };
  }

  private async deployments(from: Date | null, to: Date | null): Promise<Deployment[]> {
    const r = await this.pool.query(`SELECT * FROM deployments WHERE at >= $1 AND at < $2 ORDER BY at, source_id`, [from, to]);
    return r.rows.map((x) => ({
      source: x.source, sourceId: x.source_id, updatedAt: instant(x.source_updated_at)!, repo: x.repo,
      environment: x.environment, at: instant(x.at)!, commitShas: x.commit_shas, isRework: x.is_rework, isRollback: x.is_rollback,
    }));
  }

  /** A PR's lifetime ends when its change is deployed, else when it is merged, else when it is opened. */
  private async pullRequests(from: Date | null, to: Date | null): Promise<PullRequest[]> {
    const r = await this.pool.query(
      `SELECT p.* FROM pull_requests p
       LEFT JOIN deployments d ON d.source = p.source AND d.source_id = p.deployment_source_id
       WHERE p.opened_at < $2 AND COALESCE(d.at, p.merged_at, p.opened_at) >= $1
       ORDER BY p.opened_at, p.source_id`,
      [from, to],
    );
    return r.rows.map((x) => ({
      source: x.source, sourceId: x.source_id, updatedAt: instant(x.source_updated_at)!, repo: x.repo,
      firstCommitAt: instant(x.first_commit_at)!, openedAt: instant(x.opened_at)!, firstReviewAt: instant(x.first_review_at),
      mergedAt: instant(x.merged_at), linesChanged: x.lines_changed, deploymentId: x.deployment_source_id,
    }));
  }

  /** Items that finished before `from` are skipped; anything still open is always included. */
  private async workItems(from: Date | null, to: Date | null, doneStatuses: readonly string[]): Promise<WorkItem[]> {
    const items = await this.pool.query(
      `SELECT * FROM work_items
       WHERE created_at < $2
         AND (last_transition_at >= $1 OR final_status IS NULL OR final_status <> ALL($3::text[]))
       ORDER BY created_at, source_id`,
      [from, to, [...doneStatuses]],
    );
    const ids = items.rows.map((x) => x.source_id as string);
    const [trs, mems] = await Promise.all([
      this.pool.query(`SELECT * FROM status_transitions WHERE item_id = ANY($1) ORDER BY source, item_id, seq`, [ids]),
      this.pool.query(`SELECT * FROM sprint_memberships WHERE item_id = ANY($1) ORDER BY source, item_id, added_at`, [ids]),
    ]);
    const key = (s: string, id: string) => `${s}\u0000${id}`;
    const transitions = new Map<string, WorkItem['transitions'][number][]>();
    for (const t of trs.rows) {
      const k = key(t.source, t.item_id);
      (transitions.get(k) ?? transitions.set(k, []).get(k)!).push({ from: t.from_status, to: t.to_status, at: instant(t.at)! });
    }
    const memberships = new Map<string, WorkItem['sprintMemberships'][number][]>();
    for (const m of mems.rows) {
      const k = key(m.source, m.item_id);
      (memberships.get(k) ?? memberships.set(k, []).get(k)!).push({ sprintId: m.sprint_id, addedAt: instant(m.added_at)! });
    }
    return items.rows.map((x) => ({
      source: x.source, sourceId: x.source_id, updatedAt: instant(x.source_updated_at)!, key: x.key, type: x.type,
      labels: x.labels, board: x.board, createdAt: instant(x.created_at)!, foundInProduction: x.found_in_production,
      sprintMemberships: memberships.get(key(x.source, x.source_id)) ?? [],
      transitions: transitions.get(key(x.source, x.source_id)) ?? [],
    }));
  }

  private async sprints(from: Date | null, to: Date | null): Promise<Sprint[]> {
    const r = await this.pool.query(`SELECT * FROM sprints WHERE end_at >= $1 AND start_at < $2 ORDER BY start_at, source_id`, [from, to]);
    return r.rows.map((x) => ({
      source: x.source, sourceId: x.source_id, updatedAt: instant(x.source_updated_at)!, board: x.board,
      startAt: instant(x.start_at)!, endAt: instant(x.end_at)!, committedItemIds: x.committed_item_ids, completedItemIds: x.completed_item_ids,
    }));
  }

  private async incidents(from: Date | null, to: Date | null): Promise<Incident[]> {
    const r = await this.pool.query(
      `SELECT * FROM incidents WHERE started_at < $2 AND (restored_at IS NULL OR restored_at >= $1) ORDER BY started_at, source_id`,
      [from, to],
    );
    return r.rows.map((x) => ({
      source: x.source, sourceId: x.source_id, updatedAt: instant(x.source_updated_at)!, service: x.service,
      startedAt: instant(x.started_at)!, restoredAt: instant(x.restored_at), deploymentId: x.deployment_source_id,
    }));
  }

  private async surveys(): Promise<SurveyResponse[]> {
    const r = await this.pool.query(`SELECT * FROM survey_responses ORDER BY submitted_day, id`);
    return r.rows.map((x) => ({
      id: x.id, campaignId: x.campaign_id, teamId: x.team_id, submittedDay: x.submitted_day,
      scoreAnswers: x.score_answers, otherAnswers: x.other_answers,
    }));
  }

  async putSurveyResponses(responses: readonly SurveyResponse[]): Promise<void> {
    for (let i = 0; i < responses.length; i += 500) {
      const chunk = responses.slice(i, i + 500);
      const params: unknown[] = [];
      const tuples = chunk.map((r) => {
        const b = params.length;
        params.push(r.id, r.campaignId, r.teamId, r.submittedDay, [...r.scoreAnswers], JSON.stringify(r.otherAnswers));
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}::jsonb)`;
      });
      await this.pool.query(
        `INSERT INTO survey_responses (id, campaign_id, team_id, submitted_day, score_answers, other_answers)
         VALUES ${tuples.join(', ')} ON CONFLICT (id) DO NOTHING`,
        params,
      );
    }
  }
}
