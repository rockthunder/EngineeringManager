import { describe, expect, it } from 'vitest';
import type { CellView } from './contract';
import { execSentence, execSummary } from './exec-summary';

const cell = (o: Partial<CellView> & { judgement?: 'improving' | 'worsening' | 'steady'; delta?: string; rel?: number }): CellView => ({
  metricId: 'm', valueText: '2.2 days', value: 52, levelName: 'High', colour: 'green', detail: 'High · At bar', label: 'At bar', distance: 0,
  status: 'graded', sampleSize: 30, minSample: null, tooltip: '',
  trend: { arrow: 'down', judgement: o.judgement ?? 'improving', text: '', relativeChange: o.rel ?? -0.2, deltaText: o.delta ?? '−20%', previousText: 'was 2.8 days' },
  ...o,
});

describe('execSentence', () => {
  it('says the value, how it moved on last quarter, and where it stands against the bar', () => {
    expect(execSentence('Lead time for changes', cell({}))).toBe('Lead time for changes is 2.2 days, improving (−20% on last quarter), and at the bar.');
    expect(execSentence('Change failure rate', cell({ valueText: '15.7%', judgement: 'worsening', delta: '+2.5 pts', distance: -2, label: 'Below bar' }))).toBe(
      'Change failure rate is 15.7%, getting worse (+2.5 pts on last quarter), and two levels below the bar.',
    );
    expect(execSentence('Deployment frequency', cell({ valueText: '62 per week', judgement: 'steady', delta: '0%', distance: 1 }))).toBe(
      'Deployment frequency is 62 per week, steady on last quarter, and above the bar.',
    );
  });

  it('is honest when there is not enough data', () => {
    expect(execSentence('DevEx', cell({ status: 'insufficient_data', trend: null, distance: null }))).toBe('DevEx does not have enough data yet to be graded.');
  });
});

describe('execSummary', () => {
  const items = [
    { name: 'Lead time', cell: cell({ distance: -1, judgement: 'improving', rel: -0.3, delta: '−30%' }), atOrAbove: { atOrAbove: 6, graded: 9 } },
    { name: 'Change failure rate', cell: cell({ distance: -2, judgement: 'worsening', rel: 0.2, delta: '+2 pts' }), atOrAbove: { atOrAbove: 3, graded: 9 } },
    { name: 'Deployment frequency', cell: cell({ distance: 0, judgement: 'improving', rel: 0.1 }), atOrAbove: { atOrAbove: 9, graded: 9 } },
    { name: 'DevEx score', cell: cell({ distance: 1, judgement: 'steady', rel: 0 }), atOrAbove: { atOrAbove: 7, graded: 9 } },
  ];
  const s = execSummary(items);

  it('counts how many are at the bar, improving and worsening', () => {
    expect(s.counts).toEqual({ graded: 4, atOrAbove: 2, improved: 2, worsened: 1 });
    expect(s.sentences[0]).toBe('2 of 4 headline measures are at or above the bar; 2 improved on last quarter and 1 got worse.');
  });

  it('names the biggest gain, the furthest from the bar, and where the fewest teams are at the bar', () => {
    expect(s.sentences).toContain('Biggest improvement: Lead time (−30%).');
    expect(s.sentences).toContain('Furthest from the bar: Change failure rate (two levels below).');
    expect(s.sentences).toContain('Fewest teams at the bar: Change failure rate (3 of 9). Counts only; no team is named.');
  });

  it('skips lines that do not apply', () => {
    const calm = execSummary([{ name: 'A', cell: cell({ distance: 1, judgement: 'steady', rel: 0 }), atOrAbove: { atOrAbove: 9, graded: 9 } }]);
    expect(calm.sentences.some((x) => x.startsWith('Biggest improvement'))).toBe(false);
    expect(calm.sentences.some((x) => x.startsWith('Furthest from the bar'))).toBe(false);
  });
});
