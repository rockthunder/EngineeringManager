import type { FastifyInstance } from 'fastify';
import {
  closeCampaign, createCampaign, getCampaignResults, getPublicSurvey, getSurveys, openCampaign, saveSurvey, submitSurveyResponse,
  type SurveyDeps,
} from '../../../application/use-cases/survey-admin';
import type { Question } from '../../../domain/surveys/survey';
import { cryptoIds } from '../../driven/crypto-ids/crypto-ids';
import type { AppDeps } from './deps';

type Body = Record<string, unknown>;

/** Survey links are public but can only fetch the form and submit; they need no login. */
export function registerSurveyRoutes(app: FastifyInstance, deps: AppDeps): void {
  const s: SurveyDeps = {
    surveys: deps.stores.surveys, configStore: deps.stores.config, settingsStore: deps.stores.settings, clock: deps.clock, ids: deps.ids ?? cryptoIds,
  };
  const doneCookie = (token: string) => `survey_${token.slice(0, 12)}`;

  // ── Admin
  app.get('/api/surveys', async () => getSurveys(s));
  app.post<{ Body: Body }>('/api/surveys', async (req) =>
    saveSurvey(s, { name: String(req.body?.['name'] ?? ''), questions: (req.body?.['questions'] ?? []) as Question[] }),
  );
  app.put<{ Params: { id: string }; Body: Body }>('/api/surveys/:id', async (req) =>
    saveSurvey(s, { id: req.params.id, name: String(req.body?.['name'] ?? ''), questions: (req.body?.['questions'] ?? []) as Question[] }),
  );
  app.post<{ Body: Body }>('/api/campaigns', async (req) => {
    const b = req.body ?? {};
    return createCampaign(s, {
      surveyId: String(b['surveyId'] ?? ''), name: String(b['name'] ?? ''), opens: String(b['opens'] ?? ''), closes: String(b['closes'] ?? ''),
      teamIds: Array.isArray(b['teamIds']) ? (b['teamIds'] as string[]) : [],
    });
  });
  app.post<{ Params: { id: string } }>('/api/campaigns/:id/open', async (req) => openCampaign(s, req.params.id));
  app.post<{ Params: { id: string } }>('/api/campaigns/:id/close', async (req) => closeCampaign(s, req.params.id));
  app.get<{ Params: { id: string } }>('/api/campaigns/:id/results', async (req) => getCampaignResults(s, req.params.id));

  // ── Public: a team's link. No session; the token resolves to one campaign and team and nothing more.
  app.get<{ Params: { token: string } }>('/api/s/:token', async (req) =>
    getPublicSurvey(s, req.params.token, req.cookies[doneCookie(req.params.token)] === '1'),
  );
  app.post<{ Params: { token: string }; Body: { answers?: Record<string, unknown> } }>('/api/s/:token', async (req, reply) => {
    await submitSurveyResponse(s, req.params.token, req.body?.answers ?? {});
    reply.setCookie(doneCookie(req.params.token), '1', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 180 });
    return { ok: true };
  });
}
