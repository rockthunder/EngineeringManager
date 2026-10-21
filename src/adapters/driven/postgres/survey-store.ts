import type { SurveyStore } from '../../../application/ports/survey-store';
import type { SurveyResponse } from '../../../domain/events/types';
import type { Campaign, Question, Survey } from '../../../domain/surveys/survey';
import type { Pool } from './pool';

export class PostgresSurveyStore implements SurveyStore {
  constructor(private readonly pool: Pool) {}

  async listSurveys(): Promise<Survey[]> {
    const r = await this.pool.query('SELECT * FROM surveys ORDER BY name, id');
    return r.rows.map((x) => ({ id: x.id, name: x.name, questions: x.questions as Question[] }));
  }

  async getSurvey(id: string): Promise<Survey | null> {
    const r = await this.pool.query('SELECT * FROM surveys WHERE id = $1', [id]);
    const x = r.rows[0];
    return x ? { id: x.id, name: x.name, questions: x.questions as Question[] } : null;
  }

  async saveSurvey(s: Survey): Promise<void> {
    await this.pool.query(
      `INSERT INTO surveys (id, name, questions) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, questions = EXCLUDED.questions`,
      [s.id, s.name, JSON.stringify(s.questions)],
    );
  }

  async isLocked(surveyId: string): Promise<boolean> {
    const r = await this.pool.query(`SELECT 1 FROM campaigns WHERE survey_id = $1 AND status <> 'draft' LIMIT 1`, [surveyId]);
    return r.rowCount! > 0;
  }

  private async campaigns(where: string, params: unknown[]): Promise<Campaign[]> {
    const c = await this.pool.query(`SELECT * FROM campaigns ${where} ORDER BY opens DESC, id`, params);
    if (c.rows.length === 0) return [];
    const t = await this.pool.query('SELECT campaign_id, team_id FROM campaign_teams WHERE campaign_id = ANY($1) ORDER BY team_id', [c.rows.map((x) => x.id)]);
    return c.rows.map((x) => ({
      id: x.id, surveyId: x.survey_id, name: x.name, opens: x.opens, closes: x.closes, status: x.status,
      teamIds: t.rows.filter((y) => y.campaign_id === x.id).map((y) => y.team_id),
    }));
  }

  listCampaigns(): Promise<Campaign[]> {
    return this.campaigns('', []);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    return (await this.campaigns('WHERE id = $1', [id]))[0] ?? null;
  }

  async saveCampaign(c: Campaign): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO campaigns (id, survey_id, name, opens, closes, status) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, opens = EXCLUDED.opens, closes = EXCLUDED.closes, status = EXCLUDED.status`,
        [c.id, c.surveyId, c.name, c.opens, c.closes, c.status],
      );
      await client.query('DELETE FROM campaign_teams WHERE campaign_id = $1 AND NOT (team_id = ANY($2))', [c.id, [...c.teamIds]]);
      for (const teamId of c.teamIds) {
        await client.query('INSERT INTO campaign_teams (campaign_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [c.id, teamId]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async teamLinks(campaignId: string) {
    const r = await this.pool.query('SELECT team_id, token FROM campaign_teams WHERE campaign_id = $1 ORDER BY team_id', [campaignId]);
    return r.rows.map((x) => ({ teamId: x.team_id as string, token: (x.token as string | null) ?? null }));
  }

  async setTokens(campaignId: string, tokens: Readonly<Record<string, string>>): Promise<void> {
    for (const [teamId, token] of Object.entries(tokens)) {
      await this.pool.query('UPDATE campaign_teams SET token = $3 WHERE campaign_id = $1 AND team_id = $2', [campaignId, teamId, token]);
    }
  }

  async findByToken(token: string) {
    const r = await this.pool.query('SELECT campaign_id, team_id FROM campaign_teams WHERE token = $1', [token]);
    const x = r.rows[0];
    return x ? { campaignId: x.campaign_id as string, teamId: x.team_id as string } : null;
  }

  async responses(campaignId: string): Promise<SurveyResponse[]> {
    const r = await this.pool.query('SELECT * FROM survey_responses WHERE campaign_id = $1 ORDER BY submitted_day, id', [campaignId]);
    return r.rows.map((x) => ({
      id: x.id, campaignId: x.campaign_id, teamId: x.team_id, submittedDay: x.submitted_day,
      scoreAnswers: x.score_answers, otherAnswers: x.other_answers,
    }));
  }

  async addResponse(s: SurveyResponse): Promise<void> {
    await this.pool.query(
      `INSERT INTO survey_responses (id, campaign_id, team_id, submitted_day, score_answers, other_answers)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [s.id, s.campaignId, s.teamId, s.submittedDay, [...s.scoreAnswers], JSON.stringify(s.otherAnswers)],
    );
  }
}
