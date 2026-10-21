import type { Day } from '../time/day';

export type QuestionType = 'agreement' | 'scale10' | 'choice' | 'text';

export interface Question {
  readonly id: string;
  readonly type: QuestionType;
  readonly text: string;
  /** Counts towards the DevEx score. Only scale questions can. */
  readonly inScore: boolean;
  readonly required: boolean;
  readonly choices: readonly string[];
}

export interface Survey {
  readonly id: string;
  readonly name: string;
  readonly questions: readonly Question[];
}

export type CampaignStatus = 'draft' | 'open' | 'closed';

export interface Campaign {
  readonly id: string;
  readonly surveyId: string;
  readonly name: string;
  readonly opens: Day;
  readonly closes: Day;
  readonly status: CampaignStatus;
  readonly teamIds: readonly string[];
}

const agreement = (n: number, text: string): Question => ({ id: `q${n}`, type: 'agreement', text, inScore: true, required: true, choices: [] });

/** The core DevEx template: seven 1–5 agreement questions in the score, plus a recommend and a free-text question. */
export const CORE_SURVEY: Survey = {
  id: 'core',
  name: 'Developer experience (core)',
  questions: [
    agreement(1, 'I can usually get into focused work without being interrupted.'),
    agreement(2, 'Getting my code reviewed is quick enough that it doesn’t block me.'),
    agreement(3, 'Builds and tests give me feedback quickly.'),
    agreement(4, 'Releasing a change to production is easy and low-risk.'),
    agreement(5, 'I understand the systems I work on well enough to change them with confidence.'),
    agreement(6, 'Our tools and environments help me rather than slow me down.'),
    agreement(7, 'I know what the priorities are and why.'),
    { id: 'recommend', type: 'scale10', text: 'How likely are you to recommend working on this team?', inScore: false, required: true, choices: [] },
    { id: 'change', type: 'text', text: 'What one change would most improve your day-to-day work?', inScore: false, required: false, choices: [] },
  ],
};

export const MAX_TEXT = 2000;

export function validateSurvey(s: Survey): string[] {
  const problems: string[] = [];
  if (!s.name.trim()) problems.push('A survey needs a name');
  if (s.questions.length === 0) problems.push('A survey needs at least one question');
  const seen = new Set<string>();
  s.questions.forEach((q, i) => {
    const n = i + 1;
    if (seen.has(q.id)) problems.push(`Question ${n}: duplicate id ${q.id}`);
    seen.add(q.id);
    if (!q.id.trim()) problems.push(`Question ${n} needs an id`);
    if (!q.text.trim()) problems.push(`Question ${n} needs text`);
    if (q.type === 'choice' && q.choices.filter((c) => c.trim()).length < 2) problems.push(`Question ${n} needs at least two choices`);
    if (q.inScore && q.type !== 'agreement' && q.type !== 'scale10') problems.push(`Question ${n}: only scale questions can be part of the DevEx score`);
  });
  return problems;
}

/** A scale answer on the 1–5 footing the DevEx score uses. */
function toScoreValue(q: Question, v: number): number {
  return q.type === 'scale10' ? 1 + (4 * v) / 10 : v;
}

export interface NormalisedAnswers {
  readonly problems: string[];
  /** One 1–5 value per score question, in survey order. */
  readonly scoreAnswers: number[];
  /** Raw answers by question id (nothing identifying: only answers). */
  readonly otherAnswers: Record<string, string | number>;
}

/** Validate a submission against the survey and split it into what is stored. */
export function normaliseAnswers(survey: Survey, answers: Readonly<Record<string, unknown>>): NormalisedAnswers {
  const problems: string[] = [];
  const scoreAnswers: number[] = [];
  const otherAnswers: Record<string, string | number> = {};
  const known = new Set(survey.questions.map((q) => q.id));
  for (const id of Object.keys(answers)) if (!known.has(id)) problems.push(`Unknown question: ${id}`);

  for (const q of survey.questions) {
    const raw = answers[q.id];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (q.required) problems.push(`Please answer: ${q.text}`);
      continue;
    }
    if (q.type === 'agreement' || q.type === 'scale10') {
      const [lo, hi] = q.type === 'agreement' ? [1, 5] : [0, 10];
      const v = Number(raw);
      if (!Number.isInteger(v) || v < lo || v > hi) {
        problems.push(`${q.text} Answer between ${lo} and ${hi}.`);
        continue;
      }
      otherAnswers[q.id] = v;
      if (q.inScore) scoreAnswers.push(toScoreValue(q, v));
    } else if (q.type === 'choice') {
      if (typeof raw !== 'string' || !q.choices.includes(raw)) problems.push(`${q.text} Pick one of the choices.`);
      else otherAnswers[q.id] = raw;
    } else {
      const text = String(raw).trim();
      if (text.length > MAX_TEXT) problems.push(`${q.text} Your answer is too long.`);
      else otherAnswers[q.id] = text;
    }
  }
  return { problems, scoreAnswers, otherAnswers };
}

export function acceptingResponses(c: Pick<Campaign, 'status' | 'opens' | 'closes'>, today: Day): boolean {
  return c.status === 'open' && c.opens <= today && today <= c.closes;
}
