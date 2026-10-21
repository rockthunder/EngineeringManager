import type { Level } from '../../domain/benchmarks/levels';
import { REGISTRY_BY_ID } from '../../domain/metrics/registry';
import type { MetricId } from '../../domain/metrics/types';
import type { GridCell } from '../use-cases/benchmark-grid';
import type { AppSettings } from '../settings';
import type { CellView, ColourKey, TrendView } from './contract';
import { barText, formatValue, levelName } from './format';

const BAND_COLOUR = { above: 'blue', at: 'green', near: 'amber', below: 'red' } as const;
const BAND_LABEL = { above: 'Above bar', at: 'At bar', near: 'Near bar', below: 'Below bar' } as const;
const LEVEL_COLOUR: Record<Level, ColourKey> = { elite: 'blue', high: 'green', medium: 'amber', low: 'red' };

function trendView(c: GridCell): TrendView | null {
  if (!c.trend) return null;
  const { change, judgement, relativeChange } = c.trend;
  const pct = relativeChange !== null && Number.isFinite(relativeChange) ? `${Math.abs(Math.round(relativeChange * 100))}%` : '';
  const move = change === 'up' ? `up${pct ? ` ${pct}` : ''}` : change === 'down' ? `down${pct ? ` ${pct}` : ''}` : 'little changed';
  const text =
    judgement === 'unknown' ? 'Trend unknown: not enough data in one of the periods'
    : judgement === 'not_judged' ? `${move[0]!.toUpperCase()}${move.slice(1)} on the previous period (context only)`
    : judgement === 'steady' ? 'Steady on the previous period'
    : `${judgement === 'improving' ? 'Improving' : 'Worsening'}: ${move} on the previous period`;
  return { arrow: change, judgement, text };
}

/** Turn one grid cell into display-ready JSON: text, colour key, label and hover explanation. */
export function cellView(c: GridCell, settings: Pick<AppSettings, 'colourMode'>): CellView {
  const def = REGISTRY_BY_ID[c.metricId as MetricId];
  const trend = trendView(c);
  const base = { metricId: c.metricId, value: c.value, sampleSize: c.sampleSize, trend };
  const g = c.grade;

  if (g.status === 'insufficient_data') {
    return {
      ...base, valueText: 'Not enough data', levelName: null, colour: 'grey', label: 'Not enough data', distance: null,
      status: 'insufficient_data', minSample: g.minSample,
      tooltip: `${def.name}: not enough data (${g.sampleSize} of ${g.minSample} ${def.minSample.noun} needed)`,
    };
  }
  if (g.status === 'not_graded' || c.value === null) {
    const text = c.value === null ? '–' : formatValue(def.unit, c.value);
    return {
      ...base, valueText: text, levelName: null, colour: 'none', label: 'Context only', distance: null,
      status: 'not_graded', minSample: null, tooltip: `${def.name} ${text} (shown for context, not graded)`,
    };
  }
  const text = formatValue(def.unit, c.value);
  const bar = c.thresholds ? barText(def, c.thresholds, g.bar) : '';
  const gap =
    g.distance === 0 ? 'at the bar' : `${Math.abs(g.distance)} level${Math.abs(g.distance) === 1 ? '' : 's'} ${g.distance > 0 ? 'above' : 'below'} the bar`;
  const byLevel = settings.colourMode === 'level';
  return {
    ...base, valueText: text, levelName: levelName(g.level), distance: g.distance, status: 'graded', minSample: null,
    colour: byLevel ? LEVEL_COLOUR[g.level] : BAND_COLOUR[g.band],
    label: byLevel ? levelName(g.level) : BAND_LABEL[g.band],
    tooltip: `${def.name} ${text}, ${levelName(g.level)} (${gap}); bar is ${bar} (${levelName(g.bar)})`,
  };
}
