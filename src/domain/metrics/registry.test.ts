import { describe, expect, it } from 'vitest';
import { REGISTRY, REGISTRY_BY_ID } from './registry';

describe('metric registry', () => {
  it('has 18 metrics: 17 graded plus throughput', () => {
    expect(REGISTRY).toHaveLength(18);
    expect(new Set(REGISTRY.map((m) => m.id)).size).toBe(18);
    expect(REGISTRY.filter((m) => m.graded)).toHaveLength(17);
    expect(REGISTRY.filter((m) => !m.graded).map((m) => m.id)).toEqual(['throughput']);
  });

  it('groups the catalogue as in the spec', () => {
    const count = (g: string) => REGISTRY.filter((m) => m.group === g).length;
    expect(count('speed_flow')).toBe(11);
    expect(count('stability_quality')).toBe(4);
    expect(count('investment')).toBe(2);
    expect(count('developer_experience')).toBe(1);
  });

  it('has thresholds ordered in the direction of good, consistent with the comparator', () => {
    for (const m of REGISTRY.filter((x) => x.graded)) {
      const t = m.defaultThresholds!;
      if (m.direction === 'higher') {
        expect(t.elite, m.id).toBeGreaterThan(t.high);
        expect(t.high, m.id).toBeGreaterThan(t.medium);
        expect(m.comparator, m.id).toBe('gte');
      } else {
        expect(t.elite, m.id).toBeLessThan(t.high);
        expect(t.high, m.id).toBeLessThan(t.medium);
        expect(['lt', 'lte'], m.id).toContain(m.comparator);
      }
    }
  });

  it('has complete glossary text, aggregation text and resolvable counterparts', () => {
    for (const m of REGISTRY) {
      for (const [k, v] of Object.entries(m.glossary)) expect(v.trim().length, `${m.id}.${k}`).toBeGreaterThan(10);
      expect(m.aggregation.text.length, m.id).toBeGreaterThan(10);
      if (m.counterpart) expect(REGISTRY_BY_ID[m.counterpart], m.id).toBeDefined();
      expect(m.defaultWindowDays, m.id).toBeGreaterThan(0);
    }
  });

  it('matches spec thresholds for a sample of metrics', () => {
    expect(REGISTRY_BY_ID.deployment_frequency.defaultThresholds).toEqual({ elite: 7, high: 1, medium: 0.25 });
    expect(REGISTRY_BY_ID.lead_time.defaultThresholds).toEqual({ elite: 24, high: 168, medium: 720 });
    expect(REGISTRY_BY_ID.change_failure_rate.defaultThresholds).toEqual({ elite: 5, high: 10, medium: 15 });
    expect(REGISTRY_BY_ID.devex_score.minSample.count).toBe(4);
    expect(REGISTRY_BY_ID.deployment_frequency.minSample).toEqual({ count: 14, noun: 'days' });
  });
});
