import type { SurveyResponse } from '../events/types';
import type { Question, Survey } from './survey';

export const MIN_RESPONSES_FLOOR = 3;

export interface QuestionResult {
  readonly questionId: string;
  readonly text: string;
  readonly type: Question['type'];
  readonly inScore: boolean;
  readonly responses: number;
  readonly mean: number | null;
  readonly distribution: readonly { label: string; count: number }[];
}

export interface ResultBlock {
  readonly responses: number;
  /** DevEx score 0–100, or null when hidden or when there is nothing to score. */
  readonly devex: number | null;
  readonly questions: readonly QuestionResult[];
  /** Free-text answers in an order unrelated to when they were submitted. */
  readonly texts: readonly string[];
}

export interface TeamResult extends ResultBlock {
  readonly teamId: string;
  readonly teamName: string;
  readonly groupId: string;
  readonly headcount: number;
  readonly visible: boolean;
  readonly hiddenReason: string | null;
  readonly responseRate: number | null;
}

export interface GroupResult extends ResultBlock {
  readonly groupId: string;
  readonly groupName: string;
  readonly visible: boolean;
  /** True if some of the responses come from teams too small to show on their own. */
  readonly includesHiddenTeams: boolean;
}

export interface CampaignResults {
  readonly minResponses: number;
  readonly teams: readonly TeamResult[];
  readonly groups: readonly GroupResult[];
  readonly org: ResultBlock;
}

export interface ResultsInput {
  readonly survey: Survey;
  readonly responses: readonly SurveyResponse[];
  readonly teams: readonly { id: string; name: string; groupId: string; headcount: number }[];
  readonly groups: readonly { id: string; name: string }[];
  readonly minResponses: number;
}

const hash = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** The score questions are stored as one 1–5 value each, in survey order. */
export function devexScore(responses: readonly SurveyResponse[]): number | null {
  const scores = responses.filter((r) => r.scoreAnswers.length > 0).map((r) => ((r.scoreAnswers.reduce((a, b) => a + b, 0) / r.scoreAnswers.length - 1) / 4) * 100);
  return scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** A question's raw answer: stored by id, or (older/seeded data) recovered from the score answers. */
function rawAnswer(survey: Survey, r: SurveyResponse, q: Question): string | number | undefined {
  const stored = r.otherAnswers[q.id];
  if (stored !== undefined) return stored;
  if (!q.inScore) return undefined;
  const idx = survey.questions.filter((x) => x.inScore).findIndex((x) => x.id === q.id);
  const s = r.scoreAnswers[idx];
  if (s === undefined) return undefined;
  return q.type === 'scale10' ? Math.round(((s - 1) / 4) * 10) : s;
}

function questionResults(survey: Survey, responses: readonly SurveyResponse[]): QuestionResult[] {
  return survey.questions
    .filter((q) => q.type !== 'text')
    .map((q) => {
      const values = responses.map((r) => rawAnswer(survey, r, q)).filter((v): v is string | number => v !== undefined);
      const labels = q.type === 'agreement' ? ['1', '2', '3', '4', '5'] : q.type === 'scale10' ? Array.from({ length: 11 }, (_, i) => String(i)) : [...q.choices];
      const numeric = q.type !== 'choice';
      return {
        questionId: q.id, text: q.text, type: q.type, inScore: q.inScore, responses: values.length,
        mean: numeric && values.length > 0 ? (values as number[]).reduce((a, b) => a + b, 0) / values.length : null,
        distribution: labels.map((label) => ({ label, count: values.filter((v) => String(v) === label).length })),
      };
    });
}

function freeText(survey: Survey, responses: readonly SurveyResponse[]): string[] {
  const textQs = survey.questions.filter((q) => q.type === 'text');
  return responses
    .flatMap((r) => textQs.map((q) => ({ id: r.id, text: r.otherAnswers[q.id] })))
    .filter((x): x is { id: string; text: string } => typeof x.text === 'string' && x.text.length > 0)
    .sort((a, b) => hash(a.id) - hash(b.id) || (a.text < b.text ? -1 : 1))
    .map((x) => x.text);
}

const block = (survey: Survey, rs: readonly SurveyResponse[]): ResultBlock => ({
  responses: rs.length, devex: devexScore(rs), questions: questionResults(survey, rs), texts: freeText(survey, rs),
});
const hidden = (n: number): ResultBlock => ({ responses: n, devex: null, questions: [], texts: [] });

/**
 * Survey results under the anonymity rules: a team is shown only at or above the minimum
 * (default 4, never below 3); a smaller team is shown only inside its group, and its responses
 * still count towards group and org results. Free text appears only for visible results.
 */
export function computeResults(input: ResultsInput): CampaignResults {
  const min = Math.max(MIN_RESPONSES_FLOOR, input.minResponses);
  const { survey, responses } = input;
  const byTeam = (id: string) => responses.filter((r) => r.teamId === id);

  const teams: TeamResult[] = input.teams.map((t) => {
    const rs = byTeam(t.id);
    const visible = rs.length >= min;
    return {
      teamId: t.id, teamName: t.name, groupId: t.groupId, headcount: t.headcount, visible,
      hiddenReason: visible ? null : rs.length === 0 ? 'No responses yet' : `Hidden: fewer than ${min} responses, shown only within its group`,
      responseRate: visible && t.headcount > 0 ? Math.min(1, rs.length / t.headcount) : null,
      ...(visible ? block(survey, rs) : hidden(rs.length)),
    };
  });

  const groups: GroupResult[] = input.groups.map((g) => {
    const ids = input.teams.filter((t) => t.groupId === g.id).map((t) => t.id);
    const rs = responses.filter((r) => ids.includes(r.teamId));
    const visible = rs.length >= min;
    return {
      groupId: g.id, groupName: g.name, visible,
      includesHiddenTeams: teams.some((t) => ids.includes(t.teamId) && !t.visible && t.responses > 0),
      ...(visible ? block(survey, rs) : hidden(rs.length)),
    };
  });

  return { minResponses: min, teams, groups, org: responses.length >= min ? block(survey, responses) : hidden(responses.length) };
}
