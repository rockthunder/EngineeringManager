import { acceptingResponses, normaliseAnswers, validateSurvey, type Campaign, type Question, type Survey } from '../../domain/surveys/survey';
import { computeResults, MIN_RESPONSES_FLOOR } from '../../domain/surveys/results';
import { instantToDay } from '../../domain/time/day';
import { NotFoundError, ValidationError } from '../errors';
import type { Clock } from '../ports/clock';
import type { ConfigStore } from '../ports/config-store';
import type { IdGenerator } from '../ports/ids';
import type { SettingsStore } from '../ports/settings-store';
import type { SurveyStore } from '../ports/survey-store';
import { loadSettings } from '../settings';
import type { CampaignResultsView, CampaignView, PublicSurveyView, SurveyView, SurveysView } from '../views/contract';

export interface SurveyDeps {
  readonly surveys: SurveyStore;
  readonly configStore: ConfigStore;
  readonly settingsStore: SettingsStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

const today = (d: SurveyDeps) => instantToDay(d.clock.now());

async function surveyView(d: SurveyDeps, s: Survey): Promise<SurveyView> {
  return { id: s.id, name: s.name, locked: await d.surveys.isLocked(s.id), questions: s.questions };
}

async function campaignView(d: SurveyDeps, c: Campaign): Promise<CampaignView> {
  const [survey, links, responses, org] = await Promise.all([
    d.surveys.getSurvey(c.surveyId), d.surveys.teamLinks(c.id), d.surveys.responses(c.id), d.configStore.loadOrganisation(),
  ]);
  const now = today(d);
  const teams = links.map((l) => {
    const t = org.teams.find((x) => x.id === l.teamId);
    return {
      teamId: l.teamId, teamName: t?.name ?? l.teamId, headcount: t?.headcount ?? 0,
      responses: responses.filter((r) => r.teamId === l.teamId).length, link: l.token ? `/s/${l.token}` : null,
    };
  });
  const lapsed = c.status === 'open' && now > c.closes;
  return {
    id: c.id, surveyId: c.surveyId, surveyName: survey?.name ?? c.surveyId, name: c.name, opens: c.opens, closes: c.closes,
    status: lapsed ? 'closed' : c.status, accepting: acceptingResponses(c, now),
    teams, totalResponses: responses.length,
  };
}

export async function getSurveys(d: SurveyDeps): Promise<SurveysView> {
  const [surveys, campaigns, org, settings] = await Promise.all([
    d.surveys.listSurveys(), d.surveys.listCampaigns(), d.configStore.loadOrganisation(), loadSettings(d.settingsStore),
  ]);
  return {
    today: today(d),
    minResponses: Math.max(MIN_RESPONSES_FLOOR, settings.surveyMinResponses),
    surveys: await Promise.all(surveys.map((s) => surveyView(d, s))),
    campaigns: await Promise.all(campaigns.map((c) => campaignView(d, c))),
    teams: org.teams.filter((t) => !t.archived).map((t) => ({ id: t.id, name: t.name, headcount: t.headcount, groupId: t.groupId })),
  };
}

const cleanQuestion = (q: Question): Question => ({
  id: q.id.trim(), type: q.type, text: q.text.trim(), inScore: Boolean(q.inScore), required: Boolean(q.required),
  choices: q.type === 'choice' ? q.choices.map((c) => c.trim()).filter(Boolean) : [],
});

/** Create a survey, or edit one that no campaign has opened yet. */
export async function saveSurvey(d: SurveyDeps, input: { id?: string; name: string; questions: readonly Question[] }): Promise<SurveysView> {
  const survey: Survey = { id: input.id ?? d.ids.id(), name: input.name.trim(), questions: input.questions.map(cleanQuestion) };
  const problems = validateSurvey(survey);
  if (problems.length > 0) throw new ValidationError(problems.join('; '));
  if (input.id) {
    if (!(await d.surveys.getSurvey(input.id))) throw new NotFoundError(`No survey ${input.id}`);
    if (await d.surveys.isLocked(input.id)) {
      throw new ValidationError('This survey has been used in an open or closed campaign, so it is locked. Duplicate it to make changes.');
    }
  }
  await d.surveys.saveSurvey(survey);
  return getSurveys(d);
}

export async function createCampaign(
  d: SurveyDeps,
  input: { surveyId: string; name: string; opens: string; closes: string; teamIds: readonly string[] },
): Promise<SurveysView> {
  if (!(await d.surveys.getSurvey(input.surveyId))) throw new NotFoundError(`No survey ${input.surveyId}`);
  if (!input.name.trim()) throw new ValidationError('A campaign needs a name');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.opens) || !/^\d{4}-\d{2}-\d{2}$/.test(input.closes)) throw new ValidationError('Dates must be YYYY-MM-DD');
  if (input.closes < input.opens) throw new ValidationError('A campaign cannot close before it opens');
  const org = await d.configStore.loadOrganisation();
  const teams = input.teamIds.filter((id, i, a) => a.indexOf(id) === i);
  if (teams.length === 0) throw new ValidationError('Include at least one team');
  const bad = teams.find((id) => !org.teams.some((t) => t.id === id && !t.archived));
  if (bad) throw new ValidationError(`Unknown or archived team: ${bad}`);
  await d.surveys.saveCampaign({
    id: d.ids.id(), surveyId: input.surveyId, name: input.name.trim(), opens: input.opens, closes: input.closes, status: 'draft', teamIds: teams,
  });
  return getSurveys(d);
}

/** Opening locks the survey and gives each team its own unguessable link. */
export async function openCampaign(d: SurveyDeps, id: string): Promise<SurveysView> {
  const c = await d.surveys.getCampaign(id);
  if (!c) throw new NotFoundError(`No campaign ${id}`);
  if (c.status !== 'draft') throw new ValidationError('Only a draft campaign can be opened');
  await d.surveys.setTokens(id, Object.fromEntries(c.teamIds.map((t) => [t, d.ids.token()])));
  await d.surveys.saveCampaign({ ...c, status: 'open' });
  return getSurveys(d);
}

export async function closeCampaign(d: SurveyDeps, id: string): Promise<SurveysView> {
  const c = await d.surveys.getCampaign(id);
  if (!c) throw new NotFoundError(`No campaign ${id}`);
  if (c.status !== 'open') throw new ValidationError('Only an open campaign can be closed');
  await d.surveys.saveCampaign({ ...c, status: 'closed' });
  return getSurveys(d);
}

/** Results under the anonymity rules: small teams appear only inside their group. */
export async function getCampaignResults(d: SurveyDeps, id: string): Promise<CampaignResultsView> {
  const c = await d.surveys.getCampaign(id);
  if (!c) throw new NotFoundError(`No campaign ${id}`);
  const [survey, responses, org, settings] = await Promise.all([
    d.surveys.getSurvey(c.surveyId), d.surveys.responses(id), d.configStore.loadOrganisation(), loadSettings(d.settingsStore),
  ]);
  const included = org.teams.filter((t) => c.teamIds.includes(t.id));
  const results = computeResults({
    survey: survey!, responses, teams: included, minResponses: settings.surveyMinResponses,
    groups: org.groups.filter((g) => included.some((t) => t.groupId === g.id)),
  });
  return { campaign: await campaignView(d, c), ...results };
}

const PRIVACY_NOTE =
  'Your answers are stored with your team and nothing else: no name, email, IP address or browser details, and the time is rounded to the day. ' +
  'Results for a team are hidden until enough people have answered. A cookie on this browser discourages answering twice; it is not foolproof, and we don’t pretend it is.';

async function resolve(d: SurveyDeps, token: string) {
  const link = await d.surveys.findByToken(token);
  if (!link) throw new NotFoundError('This survey link is not valid');
  const campaign = (await d.surveys.getCampaign(link.campaignId))!;
  const survey = (await d.surveys.getSurvey(campaign.surveyId))!;
  const org = await d.configStore.loadOrganisation();
  return { link, campaign, survey, team: org.teams.find((t) => t.id === link.teamId)! };
}

/** What the respondent sees at their link: the questions and the team name, and nothing else. */
export async function getPublicSurvey(d: SurveyDeps, token: string, alreadySubmitted: boolean): Promise<PublicSurveyView> {
  const { campaign, survey, team } = await resolve(d, token);
  return {
    surveyName: survey.name, campaignName: campaign.name, teamName: team.name, questions: survey.questions,
    accepting: acceptingResponses(campaign, today(d)), closesOn: campaign.closes, alreadySubmitted, privacyNote: PRIVACY_NOTE,
  };
}

/** Store an anonymous response against the team the link belongs to. The response id is random and links to nothing. */
export async function submitSurveyResponse(d: SurveyDeps, token: string, answers: Readonly<Record<string, unknown>>): Promise<void> {
  const { link, campaign, survey } = await resolve(d, token);
  if (!acceptingResponses(campaign, today(d))) throw new ValidationError('This survey is not taking responses right now');
  const { problems, scoreAnswers, otherAnswers } = normaliseAnswers(survey, answers);
  if (problems.length > 0) throw new ValidationError(problems.join(' '));
  await d.surveys.addResponse({
    id: d.ids.id(), campaignId: campaign.id, teamId: link.teamId, submittedDay: today(d), scoreAnswers, otherAnswers,
  });
}
