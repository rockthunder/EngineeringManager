import { describe, expect, it } from 'vitest';
import { REGISTRY_BY_ID } from '../../domain/metrics/registry';
import { barText, formatValue, levelName } from './format';

describe('formatValue', () => {
  it('switches hours to days at two days', () => {
    expect(formatValue('hours', 10.14)).toBe('10.1 h');
    expect(formatValue('hours', 47)).toBe('47 h');
    expect(formatValue('hours', 77)).toBe('3.2 days');
    expect(formatValue('hours', 24 * 36)).toBe('36 days');
  });
  it('formats each unit', () => {
    expect(formatValue('per_week', 12.06)).toBe('12.1 per week');
    expect(formatValue('percent', 51.94)).toBe('51.9%');
    expect(formatValue('lines', 59.4)).toBe('59 lines');
    expect(formatValue('days', 1.9)).toBe('1.9 days');
    expect(formatValue('days', 1)).toBe('1 day');
    expect(formatValue('per_100_changes', 3.14)).toBe('3.1 per 100 changes');
    expect(formatValue('score', 79.6)).toBe('80');
  });
});

describe('barText: what the bar means in words', () => {
  const t = (id: keyof typeof REGISTRY_BY_ID, level: 'elite' | 'high' | 'medium' | 'low') => {
    const def = REGISTRY_BY_ID[id];
    return barText(def, def.defaultThresholds!, level);
  };
  it('uses the metric’s comparator', () => {
    expect(t('lead_time', 'elite')).toBe('under 1 day');
    expect(t('lead_time', 'high')).toBe('under 7 days');
    expect(t('deployment_frequency', 'high')).toBe('1 per week or more');
    expect(t('change_failure_rate', 'high')).toBe('10% or less');
    expect(t('pr_pickup_time', 'elite')).toBe('under 2 h');
  });
  it('a Low bar accepts anything', () => {
    expect(t('lead_time', 'low')).toBe('any value');
  });
});

describe('levelName', () => {
  it('capitalises', () => {
    expect(levelName('elite')).toBe('Elite');
  });
});
