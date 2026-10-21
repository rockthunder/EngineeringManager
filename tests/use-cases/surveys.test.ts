import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type {
  CampaignResultsView, GridView, PublicSurveyView, SurveysView,
} from '../../src/application/views/contract';
import { cloneDatabase, type TestDb } from '../support/postgres';
import { startApp, type TestApp } from '../support/app';

let db: TestDb;
let t: TestApp;

beforeAll(async () => {
  db = await cloneDatabase(inject('pgAdminUrl'), 'seeded');
  t = await startApp(db);
});
afterAll(async () => {
  await t.app.close();
  await db.drop();
});

const good = (extra: Record<string, unknown> = {}) => ({ q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, q6: 4, q7: 4, recommend: 8, ...extra });
const UA = 'Mozilla/5.0 (Secret Browser 9000)';
const IP = '203.0.113.77';

/** The public respondent's view: no cookie from the admin session, only the token. */
const publicGet = (path: string, cookies: Record<string, string> = {}) =>
  t.app.inject({ url: path, cookies, headers: { 'user-agent': UA, 'x-forwarded-for': IP } });
const publicPost = (path: string, answers: unknown) =>
  t.app.inject({ method: 'POST', url: path, payload: { answers }, headers: { 'user-agent': UA, 'x-forwarded-for': IP } });

const surveys = () => t.get<SurveysView>('/api/surveys');
const results = (id: string) => t.get<CampaignResultsView>(`/api/campaigns/${id}/results`);

describe('seeded survey history', () => {
  it('has the core survey, locked, and four closed quarterly campaigns', async () => {
    const v = await surveys();
    expect(v.surveys).toHaveLength(1);
    expect(v.surveys[0]).toMatchObject({ id: 'core', locked: true });
    expect(v.surveys[0]!.questions).toHaveLength(9);
    expect(v.campaigns).toHaveLength(4);
    expect(v.campaigns.every((c) => c.status === 'closed' && !c.accepting)).toBe(true);
    expect(v.minResponses).toBe(4);
  });

  it('shows results by team and group under the anonymity rules: Iris is hidden but counts in its group', async () => {
    const v = await surveys();
    const latest = v.campaigns[0]!;
    expect(latest.name).toMatch(/2026-09-21/);
    const r = await results(latest.id);
    const iris = r.teams.find((x) => x.teamName === 'Iris')!;
    expect(iris).toMatchObject({ visible: false, responses: 2, devex: null, questions: [], texts: [] });
    expect(iris.hiddenReason).toMatch(/fewer than 4/);
    expect(iris.responseRate).toBeNull();
    const aurora = r.teams.find((x) => x.teamName === 'Aurora')!;
    expect(aurora.visible).toBe(true);
    expect(aurora.questions.length).toBe(8); // seven agreement + recommend; free text is separate
    expect(aurora.responseRate).toBeGreaterThan(0.8);
    const south = r.groups.find((g) => g.groupId === 'south')!;
    expect(south).toMatchObject({ visible: true, includesHiddenTeams: true });
    expect(south.responses).toBe(r.teams.filter((x) => x.groupId === 'south').reduce((a, x) => a + x.responses, 0));
  });

  it('agrees with the benchmark: the org DevEx result equals the grid’s org DevEx cell', async () => {
    const r = await results((await surveys()).campaigns[0]!.id);
    const grid = await t.get<GridView>('/api/benchmark/teams?range=30');
    const cell = grid.org.cells.find((c) => c.metricId === 'devex_score')!;
    expect(Number(cell.valueText)).toBe(Math.round(r.org.devex!));
    expect(grid.rows.find((x) => x.teamName === 'Iris')!.cells.find((c) => c.metricId === 'devex_score')!.status).toBe('insufficient_data');
  });
});

describe('journey: a survey campaign collects responses through a team link without login', () => {
  let campaignId = '';
  const links: Record<string, string> = {};

  it('creates a draft, opens it, and gives each team its own unguessable link', async () => {
    const created = await t.send<SurveysView>('POST', '/api/campaigns', {
      surveyId: 'core', name: 'October pulse', opens: '2026-10-21', closes: '2026-11-04', teamIds: ['birch', 'iris', 'aurora'],
    });
    expect(created.status).toBe(200);
    const draft = created.body.campaigns.find((c) => c.name === 'October pulse')!;
    expect(draft).toMatchObject({ status: 'draft', accepting: false });
    expect(draft.teams.every((x) => x.link === null)).toBe(true);
    campaignId = draft.id;

    const opened = await t.send<SurveysView>('POST', `/api/campaigns/${campaignId}/open`, {});
    const c = opened.body.campaigns.find((x) => x.id === campaignId)!;
    expect(c).toMatchObject({ status: 'open', accepting: true });
    for (const team of c.teams) {
      expect(team.link).toMatch(/^\/s\/[A-Za-z0-9_-]{30,}$/);
      links[team.teamId] = team.link!;
    }
    expect(new Set(Object.values(links)).size).toBe(3);
    expect(opened.body.surveys[0]!.locked).toBe(true);
    expect((await t.send<{ error: string }>('POST', `/api/campaigns/${campaignId}/open`, {})).status).toBe(400);
  });

  it('shows a respondent the form and their team name with no login, and nothing else', async () => {
    const res = await publicGet(`/api${links['birch']}`);
    expect(res.statusCode).toBe(200);
    const v = res.json<PublicSurveyView>();
    expect(v).toMatchObject({ teamName: 'Birch', campaignName: 'October pulse', accepting: true, alreadySubmitted: false });
    expect(v.questions).toHaveLength(9);
    expect(v.privacyNote).toMatch(/no name, email, IP address or browser details/);
    expect(v.privacyNote).toMatch(/not foolproof/);
    expect(res.cookies.find((c) => c.name === 'session')).toBeUndefined();
  });

  it('accepts a response, and stores no identity: nothing from the request, day-rounded time, random id', async () => {
    const res = await publicPost(`/api${links['birch']}`, good({ change: 'Faster CI please' }));
    expect(res.statusCode).toBe(200);
    const row = (await db.pool.query(`SELECT * FROM survey_responses WHERE campaign_id = $1`, [campaignId])).rows[0];
    expect(Object.keys(row).sort()).toEqual(['campaign_id', 'id', 'other_answers', 'score_answers', 'submitted_day', 'team_id']);
    expect(row).toMatchObject({ team_id: 'birch', submitted_day: '2026-10-21' });
    expect(row.score_answers).toEqual([4, 4, 4, 4, 4, 4, 4]);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    const dump = JSON.stringify((await db.pool.query('SELECT * FROM survey_responses')).rows) + JSON.stringify((await db.pool.query('SELECT * FROM sync_runs')).rows);
    expect(dump).not.toContain(UA);
    expect(dump).not.toContain(IP);
    expect(dump).not.toContain('Secret Browser');
    expect(dump).not.toMatch(/@/);
  });

  it('sets a cookie that discourages answering twice, and says honestly that it is not foolproof', async () => {
    const res = await publicPost(`/api${links['aurora']}`, good());
    const cookie = res.cookies.find((c) => c.name.startsWith('survey_'))!;
    expect(cookie).toMatchObject({ value: '1', httpOnly: true });
    const again = await publicGet(`/api${links['aurora']}`, { [cookie.name]: cookie.value });
    expect(again.json<PublicSurveyView>().alreadySubmitted).toBe(true);
    expect((await publicGet(`/api${links['aurora']}`)).json<PublicSurveyView>().alreadySubmitted).toBe(false); // not foolproof
  });

  it('hides a team below the minimum and shows it at four, with free text only then', async () => {
    for (let i = 0; i < 2; i++) await publicPost(`/api${links['birch']}`, good({ change: `idea ${i}` }));
    let r = await results(campaignId);
    expect(r.teams.find((x) => x.teamId === 'birch')).toMatchObject({ visible: false, responses: 3, devex: null, texts: [] });
    await publicPost(`/api${links['birch']}`, good({ recommend: 10, change: 'idea 3' }));
    r = await results(campaignId);
    const birch = r.teams.find((x) => x.teamId === 'birch')!;
    expect(birch).toMatchObject({ visible: true, responses: 4, devex: 75 });
    expect([...birch.texts].sort()).toEqual(['Faster CI please', 'idea 0', 'idea 1', 'idea 3']);
    expect(birch.questions.find((q) => q.questionId === 'recommend')!.mean).toBe(8.5);
  });

  it('keeps Iris hidden at three responses while still counting them in the group and org', async () => {
    for (let i = 0; i < 3; i++) await publicPost(`/api${links['iris']}`, good({ q1: 1 }));
    const r = await results(campaignId);
    expect(r.teams.find((x) => x.teamId === 'iris')).toMatchObject({ visible: false, responses: 3, devex: null });
    const south = r.groups.find((g) => g.groupId === 'south')!;
    expect(south).toMatchObject({ responses: 3, visible: false }); // group alone is also below the minimum
    expect(r.org).toMatchObject({ responses: 8 }); // 4 Birch + 1 Aurora + 3 Iris
    expect(r.org.devex).not.toBeNull();
  });

  it('raising the minimum in Settings hides results again, with no re-collection', async () => {
    await t.send('PUT', '/api/admin/settings', { surveyMinResponses: 5 });
    const r = await results(campaignId);
    expect(r.minResponses).toBe(5);
    expect(r.teams.find((x) => x.teamId === 'birch')!.visible).toBe(false);
    await t.send('PUT', '/api/admin/settings', { surveyMinResponses: 4 });
  });

  it('feeds the benchmark: the new campaign becomes each team’s latest DevEx, graded only at the minimum', async () => {
    const grid = await t.get<GridView>('/api/benchmark/teams?range=30&compare=0');
    const dx = (team: string) => grid.rows.find((x) => x.teamName === team)!.cells.find((c) => c.metricId === 'devex_score')!;
    expect(dx('Birch')).toMatchObject({ status: 'graded', valueText: '75', sampleSize: 4 });
    expect(dx('Iris')).toMatchObject({ status: 'insufficient_data', sampleSize: 3, minSample: 4 });
    expect(dx('Aurora')).toMatchObject({ status: 'insufficient_data', sampleSize: 1 }); // one response: not graded
  });

  it('rejects invalid answers with reasons, unknown links, and writes nothing', async () => {
    const before = (await db.pool.query('SELECT count(*)::int AS n FROM survey_responses')).rows[0].n;
    const bad = await publicPost(`/api${links['birch']}`, good({ q1: 9, q2: undefined }));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/1 and 5/);
    expect(bad.json().error).toMatch(/Getting my code reviewed/);
    expect((await publicPost('/api/s/not-a-real-token', good())).statusCode).toBe(404);
    expect((await publicGet('/api/s/not-a-real-token')).statusCode).toBe(404);
    expect((await db.pool.query('SELECT count(*)::int AS n FROM survey_responses')).rows[0].n).toBe(before);
  });

  it('a survey link can only submit: no listing, no results, no admin data without a session', async () => {
    for (const url of ['/api/surveys', `/api/campaigns/${campaignId}/results`, '/api/me', '/api/benchmark/teams']) {
      expect((await t.app.inject({ url })).statusCode, url).toBe(401);
    }
  });

  it('stops taking responses when the campaign is closed', async () => {
    const closed = await t.send<SurveysView>('POST', `/api/campaigns/${campaignId}/close`, {});
    expect(closed.body.campaigns.find((c) => c.id === campaignId)).toMatchObject({ status: 'closed', accepting: false });
    const res = await publicPost(`/api${links['birch']}`, good());
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not taking responses/);
    expect((await publicGet(`/api${links['birch']}`)).json<PublicSurveyView>().accepting).toBe(false);
  });
});

describe('survey builder', () => {
  const q = (id: string, type: string, extra: object = {}) => ({ id, type, text: `Question ${id}`, inScore: false, required: true, choices: [], ...extra });

  it('creates a survey with every question type and tags scale questions for the DevEx score', async () => {
    const res = await t.send<SurveysView>('POST', '/api/surveys', {
      name: 'Onboarding',
      questions: [q('a', 'agreement', { inScore: true }), q('b', 'scale10'), q('c', 'choice', { choices: ['Yes', 'No'] }), q('d', 'text', { required: false })],
    });
    expect(res.status).toBe(200);
    const s = res.body.surveys.find((x) => x.name === 'Onboarding')!;
    expect(s).toMatchObject({ locked: false });
    expect(s.questions.map((x) => x.type)).toEqual(['agreement', 'scale10', 'choice', 'text']);
  });

  it('edits an unlocked survey but refuses to edit one a campaign has opened', async () => {
    const list = await surveys();
    const mine = list.surveys.find((s) => s.name === 'Onboarding')!;
    const edited = await t.send<SurveysView>('PUT', `/api/surveys/${mine.id}`, { name: 'Onboarding v2', questions: mine.questions });
    expect(edited.status).toBe(200);
    expect(edited.body.surveys.some((s) => s.name === 'Onboarding v2')).toBe(true);
    const locked = await t.send<{ error: string }>('PUT', '/api/surveys/core', { name: 'x', questions: list.surveys[0]!.questions });
    expect(locked.status).toBe(400);
    expect(locked.body.error).toMatch(/locked/);
  });

  it('validates: needs questions, unique ids, choices, and only scale questions in the score', async () => {
    const post = (body: object) => t.send<{ error: string }>('POST', '/api/surveys', body);
    expect((await post({ name: 'x', questions: [] })).body.error).toMatch(/at least one question/);
    expect((await post({ name: 'x', questions: [q('a', 'choice', { choices: ['one'] })] })).body.error).toMatch(/two choices/);
    expect((await post({ name: 'x', questions: [q('a', 'text', { inScore: true })] })).body.error).toMatch(/score/);
    expect((await post({ name: 'x', questions: [q('a', 'text'), q('a', 'text')] })).body.error).toMatch(/duplicate/i);
  });

  it('validates campaigns: dates, teams, and unknown surveys', async () => {
    const post = (body: object) => t.send<{ error: string }>('POST', '/api/campaigns', body);
    const base = { surveyId: 'core', name: 'c', opens: '2026-11-10', closes: '2026-11-20', teamIds: ['birch'] };
    expect((await post({ ...base, closes: '2026-11-01' })).body.error).toMatch(/before it opens/);
    expect((await post({ ...base, teamIds: [] })).body.error).toMatch(/at least one team/);
    expect((await post({ ...base, teamIds: ['nobody'] })).body.error).toMatch(/Unknown or archived/);
    expect((await post({ ...base, surveyId: 'ghost' })).status).toBe(404);
  });
});

describe('campaign dates follow the simulated day', () => {
  it('an open campaign dated tomorrow starts accepting responses once Run now moves the day on', async () => {
    const created = await t.send<SurveysView>('POST', '/api/campaigns', {
      surveyId: 'core', name: 'Starts tomorrow', opens: '2026-10-22', closes: '2026-10-30', teamIds: ['comet'],
    });
    const id = created.body.campaigns.find((c) => c.name === 'Starts tomorrow')!.id;
    const opened = await t.send<SurveysView>('POST', `/api/campaigns/${id}/open`, {});
    const link = opened.body.campaigns.find((c) => c.id === id)!.teams[0]!.link!;
    expect(opened.body.campaigns.find((c) => c.id === id)!.accepting).toBe(false);
    expect((await publicPost(`/api${link}`, good())).statusCode).toBe(400);
    await t.send('POST', '/api/admin/sync/run', {});
    expect((await publicPost(`/api${link}`, good())).statusCode).toBe(200);
  });
});
