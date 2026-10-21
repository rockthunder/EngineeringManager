import { describe, expect, it } from 'vitest';
import { REGISTRY_BY_ID } from '../metrics/registry';
import { trendOf } from './trend';

const t = (id: keyof typeof REGISTRY_BY_ID, cur: number | null, prev: number | null, nc = 50, np = 50) =>
  trendOf(REGISTRY_BY_ID[id], { value: cur, sampleSize: nc }, { value: prev, sampleSize: np });

describe('trendOf knows the direction of good', () => {
  it('a falling lead time is improving', () => {
    expect(t('lead_time', 80, 100)).toMatchObject({ change: 'down', judgement: 'improving' });
  });
  it('a rising lead time is worsening', () => {
    expect(t('lead_time', 120, 100)).toMatchObject({ change: 'up', judgement: 'worsening' });
  });
  it('a rising higher-is-better metric is improving; falling is worsening', () => {
    expect(t('deployment_frequency', 5, 4)).toMatchObject({ change: 'up', judgement: 'improving' });
    expect(t('deployment_frequency', 3, 4)).toMatchObject({ change: 'down', judgement: 'worsening' });
  });
  it('small movement is steady', () => {
    expect(t('lead_time', 102, 100)).toMatchObject({ change: 'flat', judgement: 'steady' });
    expect(t('lead_time', 94, 100)).toMatchObject({ change: 'down', judgement: 'improving' });
  });
  it('neutral metrics show movement but are not judged', () => {
    expect(t('throughput', 9, 5)).toMatchObject({ change: 'up', judgement: 'not_judged' });
  });
  it('is unknown when either period lacks a sample', () => {
    expect(t('lead_time', 80, 100, 3, 50)).toMatchObject({ judgement: 'unknown', change: null });
    expect(t('lead_time', 80, null)).toMatchObject({ judgement: 'unknown' });
  });
  it('handles a previous value of zero', () => {
    expect(t('change_failure_rate', 0, 0)).toMatchObject({ change: 'flat', judgement: 'steady' });
    expect(t('change_failure_rate', 10, 0)).toMatchObject({ change: 'up', judgement: 'worsening' });
  });
});
