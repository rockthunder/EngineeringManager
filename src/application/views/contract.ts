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
  /** (current − previous) ÷ |previous|, when finite. */
  readonly relativeChange: number | null;
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

export interface AtOrAbove {
  readonly metricId: string;
  /** Teams at or above the bar: a count, never names. */
  readonly atOrAbove: number;
  readonly graded: number;
  readonly text: string;
}

export interface OrgBenchmarkView extends PageContext {
  readonly metrics: readonly MetricHeader[];
  /** The whole organisation, pooled, for the selected window. */
  readonly org: { readonly cells: readonly CellView[] };
  readonly atOrAbove: readonly AtOrAbove[];
  /** Oldest first; each metric over its own default window ending at the month end. */
  readonly months: readonly { readonly endDay: string; readonly label: string; readonly cells: readonly CellView[] }[];
  readonly version: 'in_force' | 'today';
}

export interface SeriesPoint {
  readonly endDay: string;
  readonly label: string;
  readonly value: number | null;
  readonly colour: ColourKey;
  readonly text: string;
}

export interface DrilldownMetric {
  readonly header: MetricHeader;
  readonly cell: CellView;
  readonly counterpart: { readonly id: string; readonly name: string } | null;
  readonly series: readonly SeriesPoint[];
  /** The bar as a line on the chart: its numeric threshold, and in words. */
  readonly bar: { readonly level: string; readonly value: number; readonly text: string } | null;
}

export interface DrilldownView extends PageContext {
  readonly team: { readonly id: string; readonly name: string; readonly profile: string; readonly groupId: string; readonly headcount: number; readonly archived: boolean };
  readonly focusMetric: string | null;
  readonly windowDays: number;
  readonly metrics: readonly DrilldownMetric[];
  readonly breakdowns: {
    readonly leadTimeStages: readonly { stage: string; label: string; medianHours: number | null; text: string; sampleSize: number }[];
    readonly prSize: readonly { label: string; count: number }[];
    readonly cycleTime: readonly { day: string; days: number }[];
    readonly investment: readonly { category: string; label: string; count: number; share: number }[];
  };
}

export interface GlossaryEntry {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly graded: boolean;
  readonly unitLabel: string;
  readonly direction: string;
  readonly source: string;
  readonly definition: string;
  readonly formula: string;
  readonly highMeans: string;
  readonly lowMeans: string;
  readonly aggregation: { readonly text: string; readonly example: string };
  readonly watchOuts: string;
  readonly counterpart: { readonly id: string; readonly name: string } | null;
  readonly minSample: string;
  readonly defaultWindowDays: number;
  readonly thresholds: { readonly elite: string; readonly high: string; readonly medium: string; readonly low: string } | null;
}

export interface GlossaryView {
  readonly principles: readonly { readonly title: string; readonly text: string }[];
  readonly aggregationRule: string;
  readonly entries: readonly GlossaryEntry[];
}

/** One headline figure for a leadership view: the org cell plus how it moved. */
export interface HeadlineView {
  readonly metricId: string;
  readonly name: string;
  readonly cell: CellView;
  readonly atOrAbove: AtOrAbove | null;
}

export interface MbrMetric {
  readonly metricId: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly cell: CellView;
  /** Org figure, last 30 days vs the 30 days before. */
  readonly monthOnMonth: TrendView | null;
  /** Org figure, last 90 days vs the 90 days before. */
  readonly quarterOnQuarter: TrendView | null;
  readonly series: readonly SeriesPoint[];
}

/** Eng MBR: how has engineering trended this month and quarter? */
export interface MbrView extends PageContext {
  readonly metrics: readonly MbrMetric[];
}

/** Director to Execs: six headline metrics, trend vs last quarter, teams at the bar. */
export interface ExecsView extends PageContext {
  readonly headlines: readonly HeadlineView[];
}

export interface TeamOption extends Option {
  readonly groupId: string;
}

/** EM to Director: the grid filtered to one EM's group. */
export interface EmDirectorView extends GridView {
  readonly selectedGroup: string;
}

export interface FocusItem {
  readonly metricId: string;
  readonly name: string;
  readonly cell: CellView;
}

/** EM to TL: where can this team improve? */
export interface EmTlView extends PageContext {
  readonly team: TeamOption;
  readonly teams: readonly TeamOption[];
  readonly furthestFromBar: readonly FocusItem[];
  readonly mostImproved: readonly FocusItem[];
}

export interface TlTeamView extends PageContext {
  readonly team: TeamOption;
  readonly teams: readonly TeamOption[];
  readonly ageing: {
    readonly thresholdDays: number;
    readonly bar: string;
    readonly items: readonly { key: string; type: string; ageDays: number; status: string; aged: boolean }[];
    readonly agedShare: number | null;
  };
  readonly waitingForReview: {
    readonly bar: string;
    readonly prs: readonly { id: string; repo: string; waitingHours: number; lines: number; overBar: boolean }[];
    readonly pickupBarHours: number | null;
  };
  readonly prSizes: {
    readonly bar: string;
    readonly barLines: number | null;
    readonly prs: readonly { id: string; repo: string; lines: number; day: string; overBar: boolean }[];
  };
  readonly sprint: {
    readonly name: string;
    readonly startDay: string;
    readonly endDay: string;
    readonly daysLeft: number;
    readonly committed: number;
    readonly completed: number;
    readonly percentDone: number;
    readonly expectedPercent: number;
  } | null;
}
