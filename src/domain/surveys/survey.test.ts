import { describe, expect, it } from 'vitest';
import { CORE_SURVEY, acceptingResponses, normaliseAnswers, validateSurvey, type Survey } from './survey';

describe('core template', () => {
  it('has the seven DevEx questions, a 0–10 recommend question outside the score, and an optional free-text question', () => {
    const qs = CORE_SURVEY.questions;
    expect(qs).toHaveLength(9);
    expect(qs.slice(0, 7).every((q) => q.type === 'agreement' && q.inScore)).toBe(true);
    expect(qs[7]).toMatchObject({ id: 'recommend', type: 'scale10', inScore: false });
    expect(qs[8]).toMatchObject({ id: 'change', type: 'text', required: false });
    expect(validateSurvey(CORE_SURVEY)).toEqual([]);
  });
});

describe('validateSurvey', () => {
  const base: Survey = { id: 's', name: 'My survey', questions: [{ id: 'a', type: 'agreement', text: 'I like it', inScore: true, required: true, choices: [] }] };
  it('accepts a simple survey', () => expect(validateSurvey(base)).toEqual([]));
  it('needs a name, at least one question and unique ids', () => {
    expect(validateSurvey({ ...base, name: ' ' }).join()).toMatch(/name/);
    expect(validateSurvey({ ...base, questions: [] }).join()).toMatch(/at least one question/);
    expect(validateSurvey({ ...base, questions: [base.questions[0]!, base.questions[0]!] }).join()).toMatch(/duplicate/i);
  });
  it('needs question text and choices for single-choice questions', () => {
    const q = base.questions[0]!;
    expect(validateSurvey({ ...base, questions: [{ ...q, text: '' }] }).join()).toMatch(/text/);
    expect(validateSurvey({ ...base, questions: [{ ...q, type: 'choice', inScore: false, choices: ['only one'] }] }).join()).toMatch(/two choices/);
  });
  it('only scale questions can be part of the DevEx score', () => {
    const q = base.questions[0]!;
    expect(validateSurvey({ ...base, questions: [{ ...q, type: 'text', inScore: true }] }).join()).toMatch(/score/);
    expect(validateSurvey({ ...base, questions: [{ ...q, type: 'choice', inScore: true, choices: ['a', 'b'] }] }).join()).toMatch(/score/);
  });
});

describe('normaliseAnswers', () => {
  it('splits answers into DevEx score answers (1–5) and the rest, keeping raw answers', () => {
    const answers = { q1: 4, q2: 5, q3: 3, q4: 4, q5: 4, q6: 2, q7: 5, recommend: 9, change: '  Faster builds  ' };
    const out = normaliseAnswers(CORE_SURVEY, answers);
    expect(out.problems).toEqual([]);
    expect(out.scoreAnswers).toEqual([4, 5, 3, 4, 4, 2, 5]);
    expect(out.otherAnswers).toMatchObject({ recommend: 9, change: 'Faster builds', q1: 4 });
  });

  it('puts a 0–10 scale question that counts towards the score on the same 1–5 footing', () => {
    const s: Survey = { id: 's', name: 'S', questions: [{ id: 'n', type: 'scale10', text: 'NPS', inScore: true, required: true, choices: [] }] };
    expect(normaliseAnswers(s, { n: 10 }).scoreAnswers).toEqual([5]);
    expect(normaliseAnswers(s, { n: 0 }).scoreAnswers).toEqual([1]);
    expect(normaliseAnswers(s, { n: 5 }).scoreAnswers).toEqual([3]);
  });

  it('rejects missing required answers, out-of-range values, unknown choices and unknown questions', () => {
    const base = { q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, q6: 4, q7: 4, recommend: 7 };
    expect(normaliseAnswers(CORE_SURVEY, { ...base, q3: undefined as never }).problems.join()).toMatch(/Builds and tests/);
    expect(normaliseAnswers(CORE_SURVEY, { ...base, q1: 6 }).problems.join()).toMatch(/1 and 5/);
    expect(normaliseAnswers(CORE_SURVEY, { ...base, recommend: 11 }).problems.join()).toMatch(/0 and 10/);
    expect(normaliseAnswers(CORE_SURVEY, { ...base, extra: 'x' }).problems.join()).toMatch(/Unknown question/);
    const choice: Survey = { id: 's', name: 'S', questions: [{ id: 'c', type: 'choice', text: 'Pick', inScore: false, required: true, choices: ['a', 'b'] }] };
    expect(normaliseAnswers(choice, { c: 'z' }).problems.join()).toMatch(/choices/);
    expect(normaliseAnswers(choice, { c: 'a' }).problems).toEqual([]);
  });

  it('lets optional questions be skipped and caps free text length', () => {
    const base = { q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, q6: 4, q7: 4, recommend: 7 };
    expect(normaliseAnswers(CORE_SURVEY, base).problems).toEqual([]);
    expect(normaliseAnswers(CORE_SURVEY, { ...base, change: 'x'.repeat(2001) }).problems.join()).toMatch(/too long/);
  });
});

describe('acceptingResponses', () => {
  const c = { status: 'open' as const, opens: '2026-10-01', closes: '2026-10-31' };
  it('is true only while open and between the dates, inclusive', () => {
    expect(acceptingResponses(c, '2026-10-01')).toBe(true);
    expect(acceptingResponses(c, '2026-10-31')).toBe(true);
    expect(acceptingResponses(c, '2026-09-30')).toBe(false);
    expect(acceptingResponses(c, '2026-11-01')).toBe(false);
    expect(acceptingResponses({ ...c, status: 'draft' }, '2026-10-10')).toBe(false);
    expect(acceptingResponses({ ...c, status: 'closed' }, '2026-10-10')).toBe(false);
  });
});
