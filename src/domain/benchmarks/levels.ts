import type { Comparator, Thresholds } from '../metrics/types';

export type Level = 'low' | 'medium' | 'high' | 'elite';

export const LEVEL_RANK: Readonly<Record<Level, number>> = { low: 0, medium: 1, high: 2, elite: 3 };
export const LEVELS: readonly Level[] = ['elite', 'high', 'medium', 'low'];

/** Colour bands by distance from the bar. Colours themselves belong to the UI/settings. */
export type Band = 'above' | 'at' | 'near' | 'below';

function meets(value: number, cmp: Comparator, threshold: number): boolean {
  switch (cmp) {
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'lt': return value < threshold;
  }
}

/** Elite, High or Medium if the value meets that threshold; anything worse is Low. */
export function levelOf(value: number, cmp: Comparator, t: Thresholds): Level {
  if (meets(value, cmp, t.elite)) return 'elite';
  if (meets(value, cmp, t.high)) return 'high';
  if (meets(value, cmp, t.medium)) return 'medium';
  return 'low';
}

/** Levels above (+) or below (−) the bar. */
export function distanceFromBar(level: Level, bar: Level): number {
  return LEVEL_RANK[level] - LEVEL_RANK[bar];
}

export function bandOf(distance: number): Band {
  if (distance > 0) return 'above';
  if (distance === 0) return 'at';
  return distance === -1 ? 'near' : 'below';
}
