import type { SurveyResponse } from '../../../domain/events/types';
import { addDays } from './dates';
import { streamFor } from './prng';
import type { Scenario } from './scenario';

const CAMPAIGN_OFFSETS = [-300, -210, -120, -30];
const SCORE_QUESTIONS = 7;

/** Quarterly DevEx campaigns, anonymous. Iris (two engineers) stays below the 4-response minimum. */
export function dummySurveyResponses(seed: number, scenario: Scenario): SurveyResponse[] {
  const out: SurveyResponse[] = [];
  for (const offset of CAMPAIGN_OFFSETS) {
    const opens = addDays(scenario.anchorDay, offset);
    const campaignId = `devex-${opens}`;
    for (const s of scenario.teamSeeds) {
      if (s.startDay > opens) continue;
      const b = s.behaviour.survey;
      const n = b.fixedResponses ?? Math.round(s.team.headcount * b.responseRate);
      for (let i = 0; i < n; i++) {
        const r = streamFor(seed, 'survey', campaignId, s.team.id, i);
        const scoreAnswers = Array.from({ length: SCORE_QUESTIONS }, () =>
          Math.min(5, Math.max(1, Math.round(b.mean + 0.8 * r.normal()))),
        );
        out.push({
          id: `${campaignId}|${s.team.id}|${i}`,
          campaignId,
          teamId: s.team.id,
          submittedDay: addDays(opens, Math.floor(r.uniform(0, 7))),
          scoreAnswers,
          otherAnswers: { recommend: Math.min(10, Math.max(0, Math.round(b.mean * 2 + 1.5 * r.normal()))) },
        });
      }
    }
  }
  return out;
}
