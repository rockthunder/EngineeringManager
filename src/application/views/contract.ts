/**
 * The JSON the HTTP API returns and the web app renders. Types only: no imports, no logic.
 * The web app imports this file (type-only) and nothing else from src/, so metric names,
 * thresholds, labels and colours all arrive from the server, never hard-coded in the UI.
 */

export type ColourKey = 'blue' | 'green' | 'amber' | 'red' | 'grey' | 'none';
export type RangeKey = '7' | '14' | '30' | '90' | 'qtd' | 'metric' | 'custom';

export interface TrendView {
  readonly arrow: 'up' | 'down' | 'flat' | null;
  readonly judgement: 'improving' | 'worsening' | 'steady' | 'not_judged' | 'unknown';
  /** e.g. "Improving: down 18% on the previous period". */
  readonly text: string;
}

export interface CellView {
  readonly metricId: string;
  /** Value with its unit, e.g. "3.2 days"; "Not enough data" when ungradable. */
  readonly valueText: string;
  readonly value: number | null;
  /** 'Elite' | 'High' | 'Medium' | 'Low', null when not graded. */
  readonly levelName: string | null;
  readonly colour: ColourKey;
  /** Text shown with the colour so it works for colour-blind readers, e.g. "Near bar". */
  readonly label: string;
  /** Second line of the cell, e.g. "High · Near bar" or "7 of 10 PRs". */
  readonly detail: string;
  readonly distance: number | null;
  readonly status: 'graded' | 'insufficient_data' | 'not_graded';
  readonly sampleSize: number;
  readonly minSample: number | null;
  readonly trend: TrendView | null;
  /** Hover text, e.g. "Lead time 3.2 days; bar is under 1 day". */
  readonly tooltip: string;
}

export interface MetricHeader {
  readonly id: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly windowDays: number;
  readonly graded: boolean;
  readonly group: 'speed_flow' | 'stability_quality' | 'investment' | 'developer_experience';
}

export interface GridRowView {
  readonly teamId: string;
  readonly teamName: string;
  readonly profile: string;
  readonly groupId: string;
  readonly cells: readonly CellView[];
}

export interface Option {
  readonly id: string;
  readonly name: string;
}

/** Shared context shown on every screen. */
export interface PageContext {
  readonly endDay: string;
  readonly benchmarkVersion: number;
  readonly benchmarkEffectiveFrom: string;
  readonly dataAsOf: string | null;
  readonly colourMode: 'distance' | 'level';
  readonly colours: Readonly<Record<string, string>>;
  readonly range: RangeKey;
}

export interface GridView extends PageContext {
  readonly metrics: readonly MetricHeader[];
  /** Alphabetical by team name; never ordered by grade or score. */
  readonly rows: readonly GridRowView[];
  readonly org: { readonly cells: readonly CellView[] };
  readonly groups: readonly Option[];
  readonly profiles: readonly Option[];
  readonly filters: { readonly groupId: string | null; readonly profileId: string | null };
}

export interface Me {
  readonly user: { readonly id: number; readonly username: string; readonly role: 'admin' };
}
