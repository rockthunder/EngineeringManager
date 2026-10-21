import { REGISTRY, REGISTRY_BY_ID } from '../../domain/metrics/registry';
import type { MetricDefinition, MetricGroup } from '../../domain/metrics/types';
import type { GlossaryEntry, GlossaryView } from '../views/contract';
import { barText } from '../views/format';

const GROUP_NAMES: Record<MetricGroup, string> = {
  speed_flow: 'Speed and flow',
  stability_quality: 'Stability and quality',
  investment: 'Investment',
  developer_experience: 'Developer experience',
};

const DIRECTION = { higher: 'Higher is better', lower: 'Lower is better', neutral: 'Context only, never graded' } as const;

function entry(def: MetricDefinition): GlossaryEntry {
  const t = def.defaultThresholds;
  return {
    id: def.id,
    name: def.name,
    group: GROUP_NAMES[def.group],
    graded: def.graded,
    unitLabel: def.unitLabel,
    direction: DIRECTION[def.direction],
    source: def.glossary.source,
    definition: def.glossary.definition,
    formula: def.glossary.formula,
    highMeans: def.glossary.highMeans,
    lowMeans: def.glossary.lowMeans,
    aggregation: { text: def.aggregation.text, example: def.glossary.aggregationExample },
    watchOuts: def.glossary.watchOuts,
    counterpart: def.counterpart ? { id: def.counterpart, name: REGISTRY_BY_ID[def.counterpart].name } : null,
    minSample: def.minSample.count === 0 ? 'None' : `${def.minSample.count} ${def.minSample.noun === 'days' ? 'days of data' : def.minSample.noun}`,
    defaultWindowDays: def.defaultWindowDays,
    thresholds: t
      ? { elite: barText(def, t, 'elite'), high: barText(def, t, 'high'), medium: barText(def, t, 'medium'), low: 'anything worse' }
      : null,
  };
}

/** The glossary is generated from the metric registry, the same code that computes the numbers. */
export function getGlossary(): GlossaryView {
  return {
    principles: [
      { title: 'Team level only', text: 'No metric is ever computed, stored or shown per individual. Sources drop author identities on the way in.' },
      { title: 'The bar, not a league table', text: 'Colour shows distance from the bar the Director sets. Teams are never ranked or sorted by score, and there is no total score.' },
      { title: 'Pairs, not singles', text: 'Every speed metric is read beside its stability counterpart, so speed is never bought with instability.' },
      { title: 'Show the why', text: 'Every grade links here and to the team’s breakdown of where time goes. The conversation starts from "where does the time go", not "why are you red".' },
      { title: 'Honest about small samples', text: 'Below a metric’s minimum sample a cell says "not enough data" with the count instead of a grade.' },
      { title: 'History you can recompute', text: 'Raw events are stored and every figure is computed when you ask, so changing a definition or raising the bar recalculates history without re-pulling data.' },
    ],
    aggregationRule:
      'Org figures are computed from all events pooled together, not by averaging team results. An average of team medians gives a two-person team the same weight as a twelve-person team and hides the shape of the distribution. Counts are summed, rates are total numerator over total denominator, and durations are the median of every event in the org.',
    entries: REGISTRY.map(entry),
  };
}
