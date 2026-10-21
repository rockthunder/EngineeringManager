import { describe, expect, it } from 'vitest';
import type { SurveyResponse } from '../events/types';
import { CORE_SURVEY } from './survey';
import { computeResults, MIN_RESPONSES_FLOOR } from './results';

const resp = (teamId: string, i: number, score = [4, 4, 4, 4, 4, 4, 4], other: SurveyResponse['otherAnswers'] = { recommend: 8 }): SurveyResponse => ({
  id: `r-${teamId}-${i}`, campaignId: 'c1', teamId, submittedDay: '2026-09-01', scoreAnswers: score, otherAnswers: other,
});
const many = (teamId: string, n: number, score?: number[]) => Array.from({ length: n }, (_, i) => resp(teamId, i, score));

const teams = [
  { id: 'a', name: 'Alpha', groupId: 'g1', headcount: 6 },
  { id: 'b', name: 'Bravo', groupId: 'g1', headcount: 5 },
  { id: 'c', name: 'Charlie', groupId: 'g2', headcount: 4 },
];
const groups = [{ id: 'g1', name: 'North' }, { id: 'g2', name: 'South' }];

describe('survey anonymity rules', () => {
  it('floors the minimum at 3', () => {
    expect(MIN_RESPONSES_FLOOR).toBe(3);
    const r = computeResults({ survey: CORE_SURVEY, responses: many('a', 3), teams, groups, minResponses: 1 });
    expect(r.minResponses).toBe(3);
  });

  it('shows a team only at or above the minimum', () => {
    const r = computeResults({ survey: CORE_SURVEY, responses: [...many('a', 4), ...many('b', 3)], teams, groups, minResponses: 4 });
    const a = r.teams.find((t) => t.teamId === 'a')!;
    const b = r.teams.find((t) => t.teamId === 'b')!;
    expect(a).toMatchObject({ visible: true, responses: 4, devex: 75 });
    expect(b.visible).toBe(false);
    expect(b.devex).toBeNull();
    expect(b.questions).toEqual([]);
    expect(b.texts).toEqual([]);
    expect(b.hiddenReason).toMatch(/fewer than 4/);
  });

  it('still counts a hidden team’s responses in its group and the org', () => {
    const r = computeResults({
      survey: CORE_SURVEY, responses: [...many('a', 4, [5, 5, 5, 5, 5, 5, 5]), ...many('b', 3, [1, 1, 1, 1, 1, 1, 1])], teams, groups, minResponses: 4,
    });
    const g1 = r.groups.find((g) => g.groupId === 'g1')!;
    expect(g1).toMatchObject({ visible: true, responses: 7, includesHiddenTeams: true });
    expect(g1.devex).toBeCloseTo((4 * 100 + 3 * 0) / 7, 6);
    expect(r.org.responses).toBe(7);
    expect(r.org.devex).toBeCloseTo((4 * 100 + 3 * 0) / 7, 6);
  });

  it('hides a group too if the group as a whole is below the minimum', () => {
    const r = computeResults({ survey: CORE_SURVEY, responses: [...many('a', 4), ...many('c', 2)], teams, groups, minResponses: 4 });
    const g2 = r.groups.find((g) => g.groupId === 'g2')!;
    expect(g2.visible).toBe(false);
    expect(g2.devex).toBeNull();
    expect(g2.responses).toBe(2);
  });

  it('shows the org result only at or above the minimum', () => {
    const r = computeResults({ survey: CORE_SURVEY, responses: many('c', 2), teams, groups, minResponses: 4 });
    expect(r.org.devex).toBeNull();
  });

  it('computes response rate against headcount for visible teams only', () => {
    const r = computeResults({ survey: CORE_SURVEY, responses: [...many('a', 3), ...many('b', 4)], teams, groups, minResponses: 4 });
    expect(r.teams.find((t) => t.teamId === 'b')!.responseRate).toBeCloseTo(0.8);
    expect(r.teams.find((t) => t.teamId === 'a')!.responseRate).toBeNull(); // hidden: not even a rate
  });
});

describe('per-question results', () => {
  it('reports each question on its own: mean and distribution', () => {
    const rs = [
      resp('a', 0, [5, 4, 3, 4, 4, 4, 4], { recommend: 10 }),
      resp('a', 1, [3, 4, 3, 4, 4, 4, 4], { recommend: 6 }),
      resp('a', 2, [4, 4, 3, 4, 4, 4, 4], { recommend: 8 }),
      resp('a', 3, [4, 4, 3, 4, 4, 4, 4], { recommend: 8 }),
    ];
    const t = computeResults({ survey: CORE_SURVEY, responses: rs, teams, groups, minResponses: 4 }).teams.find((x) => x.teamId === 'a')!;
    const q1 = t.questions.find((q) => q.questionId === 'q1')!;
    expect(q1).toMatchObject({ responses: 4, mean: 4 });
    expect(q1.distribution.find((d) => d.label === '3')!.count).toBe(1);
    expect(q1.distribution.find((d) => d.label === '5')!.count).toBe(1);
    const rec = t.questions.find((q) => q.questionId === 'recommend')!;
    expect(rec.mean).toBe(8);
    expect(rec.distribution).toHaveLength(11);
    expect(t.questions.find((q) => q.questionId === 'q3')!.mean).toBe(3);
  });

  it('shows free text only for visible teams, in an order unrelated to submission order', () => {
    const rs = Array.from({ length: 6 }, (_, i) => resp('a', i, undefined, { recommend: 7, change: `idea ${i}` }));
    const r = computeResults({ survey: CORE_SURVEY, responses: rs, teams, groups, minResponses: 4 });
    const texts = r.teams.find((t) => t.teamId === 'a')!.texts;
    expect([...texts].sort()).toEqual(['idea 0', 'idea 1', 'idea 2', 'idea 3', 'idea 4', 'idea 5']);
    expect(texts).not.toEqual(['idea 0', 'idea 1', 'idea 2', 'idea 3', 'idea 4', 'idea 5']);
    const again = computeResults({ survey: CORE_SURVEY, responses: rs, teams, groups, minResponses: 4 }).teams.find((t) => t.teamId === 'a')!.texts;
    expect(again).toEqual(texts); // stable
    const hidden = computeResults({ survey: CORE_SURVEY, responses: rs.slice(0, 3), teams, groups, minResponses: 4 });
    expect(hidden.teams.find((t) => t.teamId === 'a')!.texts).toEqual([]);
  });

  it('computes the DevEx score as the mean of score questions scaled 1–5 to 0–100', () => {
    const rs = [resp('a', 0, [1, 1, 1, 1, 1, 1, 1]), resp('a', 1, [5, 5, 5, 5, 5, 5, 5]), resp('a', 2, [3, 3, 3, 3, 3, 3, 3]), resp('a', 3, [3, 3, 3, 3, 3, 3, 3])];
    const t = computeResults({ survey: CORE_SURVEY, responses: rs, teams, groups, minResponses: 4 }).teams.find((x) => x.teamId === 'a')!;
    expect(t.devex).toBe(50);
  });
});
