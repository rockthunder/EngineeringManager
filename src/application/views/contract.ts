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
  /** Movement since the previous period, e.g. "−18%" or "+2.5 pts"; null when unknown. */
  readonly deltaText: string | null;
  /** What it was, e.g. "was 3.9 days". */
  readonly previousText: string | null;
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
  /** The count in the previous period of the same length, for "was N". */
  readonly previousAtOrAbove: number | null;
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
  readonly insights: TeamInsightsView;
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

export interface BandCounts {
  readonly above: number;
  readonly at: number;
  readonly near: number;
  readonly below: number;
  readonly insufficient: number;
}

/** One headline measure for the execs: the org figure, how it moved, the bar, 12 months of trend, and team counts. */
export interface ExecHeadline {
  readonly metricId: string;
  readonly name: string;
  readonly cell: CellView;
  /** A plain-English sentence about it. */
  readonly sentence: string;
  readonly atOrAbove: AtOrAbove | null;
  /** How many teams sit in each band: counts only, never names. */
  readonly teamBands: BandCounts;
  readonly series: readonly SeriesPoint[];
  readonly bar: { readonly level: string; readonly value: number; readonly text: string } | null;
}

export interface ExecPair {
  readonly title: string;
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly left: ExecHeadline;
  readonly right: ExecHeadline;
}

/** Director to Execs: are we delivering faster and more safely, on the right work? */
export interface ExecsView extends PageContext {
  readonly summary: {
    readonly sentences: readonly string[];
    readonly counts: { readonly graded: number; readonly atOrAbove: number; readonly improved: number; readonly worsened: number };
  };
  /** Speed beside stability, value beside sustainability: no metric stands alone. */
  readonly pairs: readonly ExecPair[];
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
  /** When nothing is below the bar: the metrics sitting exactly at it, so there is always something to look at. */
  readonly atTheBar: readonly FocusItem[];
  readonly mostImproved: readonly FocusItem[];
  readonly headline: readonly HeadlineItem[];
  readonly insights: TeamInsightsView;
}

export interface TlTeamView extends PageContext {
  readonly team: TeamOption;
  readonly teams: readonly TeamOption[];
  readonly headline: readonly HeadlineItem[];
  readonly insights: TeamInsightsView;
  readonly ageing: {
    readonly thresholdDays: number;
    readonly bar: string;
    readonly items: readonly { key: string; type: string; ageDays: number; status: string; aged: boolean; daysInStatus: number }[];
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

// ── Settings ────────────────────────────────────────────────────────────────

export type LevelKey = 'elite' | 'high' | 'medium' | 'low';

export interface LevelValues {
  readonly elite: number;
  readonly high: number;
  readonly medium: number;
}

export interface BenchmarkMetricConfig {
  readonly id: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly direction: 'higher' | 'lower';
  readonly group: MetricHeader['group'];
  /** Per profile, resolved (Platform inherits Product unless overridden). */
  readonly thresholds: Readonly<Record<string, LevelValues>>;
  readonly overridden: Readonly<Record<string, boolean>>;
  /** What each threshold means in words, per profile, e.g. "under 1 day". */
  readonly text: Readonly<Record<string, { elite: string; high: string; medium: string }>>;
  readonly bar: LevelKey;
  /** Per-profile bar overrides; null = follows the org bar. */
  readonly barByProfile: Readonly<Record<string, LevelKey | null>>;
}

export interface BenchmarkConfigView {
  readonly today: string;
  readonly inForce: number;
  readonly latest: { readonly number: number; readonly effectiveFrom: string };
  readonly versions: readonly { number: number; effectiveFrom: string; inForce: boolean; changes: readonly string[] }[];
  readonly profiles: readonly Option[];
  readonly metrics: readonly BenchmarkMetricConfig[];
  /** Earliest day a new version can take effect. */
  readonly minEffectiveFrom: string;
}

export interface TeamAdminTeam {
  readonly id: string;
  readonly name: string;
  readonly profile: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly headcount: number;
  readonly archived: boolean;
  readonly mappings: readonly { kind: 'repo' | 'board' | 'service'; ref: string; effectiveFrom: string; effectiveTo: string | null }[];
}

export interface KnownRef {
  readonly ref: string;
  /** The team it belongs to today, or null if unmapped. */
  readonly owner: string | null;
  readonly ownerId: string | null;
}

export interface TeamAdminView {
  readonly today: string;
  readonly teams: readonly TeamAdminTeam[];
  readonly groups: readonly Option[];
  readonly profiles: readonly Option[];
  readonly refs: { readonly repo: readonly KnownRef[]; readonly board: readonly KnownRef[]; readonly service: readonly KnownRef[] };
}

export interface StreamStatus {
  readonly stream: string;
  readonly status: 'never' | 'running' | 'succeeded' | 'failed';
  readonly lastRunAt: string | null;
  readonly upserted: number;
  readonly error: string | null;
  readonly cursor: string | null;
}

export interface SourceDefinitionsView {
  readonly productionEnvironment: string;
  readonly statusClasses: Readonly<Record<string, 'todo' | 'active' | 'waiting' | 'done'>>;
  readonly foundInProductionLabel: string;
  readonly hotfixLabel: string;
  readonly issueTypeCategories: Readonly<Record<string, 'new_capability' | 'maintenance' | 'defect' | 'tech_debt'>>;
  readonly categoryLabels: Readonly<Record<string, 'new_capability' | 'maintenance' | 'defect' | 'tech_debt'>>;
}

export interface DataSourcesView {
  readonly today: string;
  readonly dataAsOf: string | null;
  /** True for the dummy world: "Run now" emits the next simulated day. */
  readonly simulated: boolean;
  readonly watermarkDay: string | null;
  readonly pollEveryHours: number;
  readonly backfillDays: number;
  readonly sources: readonly { readonly name: string; readonly label: string; readonly streams: readonly StreamStatus[] }[];
  readonly recentRuns: readonly { id: number; stream: string; status: string; startedAt: string; upserted: number; error: string | null; mode: 'backfill' | 'incremental' }[];
  readonly definitions: SourceDefinitionsView;
}

export interface SettingsView {
  readonly defaultRange: Exclude<RangeKey, 'custom'>;
  readonly screenDefaults: Readonly<Record<string, Exclude<RangeKey, 'custom'>>>;
  readonly colourMode: 'distance' | 'level';
  readonly colours: Readonly<Record<string, string>>;
  readonly pollEveryHours: number;
  readonly backfillDays: number;
  readonly surveyMinResponses: number;
}

// ── Surveys ─────────────────────────────────────────────────────────────────

export interface QuestionView {
  readonly id: string;
  readonly type: 'agreement' | 'scale10' | 'choice' | 'text';
  readonly text: string;
  readonly inScore: boolean;
  readonly required: boolean;
  readonly choices: readonly string[];
}

export interface SurveyView {
  readonly id: string;
  readonly name: string;
  /** Locked once a campaign using it has opened, so results stay comparable. */
  readonly locked: boolean;
  readonly questions: readonly QuestionView[];
}

export interface CampaignTeamView {
  readonly teamId: string;
  readonly teamName: string;
  readonly headcount: number;
  readonly responses: number;
  /** Path of the team's unguessable link once the campaign has opened, e.g. /s/abc123. */
  readonly link: string | null;
}

export interface CampaignView {
  readonly id: string;
  readonly surveyId: string;
  readonly surveyName: string;
  readonly name: string;
  readonly opens: string;
  readonly closes: string;
  readonly status: 'draft' | 'open' | 'closed';
  /** Open and between its dates: the links take responses right now. */
  readonly accepting: boolean;
  readonly teams: readonly CampaignTeamView[];
  readonly totalResponses: number;
}

export interface SurveysView {
  readonly today: string;
  readonly minResponses: number;
  readonly surveys: readonly SurveyView[];
  readonly campaigns: readonly CampaignView[];
  readonly teams: readonly (Option & { readonly headcount: number; readonly groupId: string })[];
}

export interface QuestionResultView {
  readonly questionId: string;
  readonly text: string;
  readonly type: QuestionView['type'];
  readonly inScore: boolean;
  readonly responses: number;
  readonly mean: number | null;
  readonly distribution: readonly { readonly label: string; readonly count: number }[];
}

export interface ResultBlockView {
  readonly responses: number;
  readonly devex: number | null;
  readonly questions: readonly QuestionResultView[];
  readonly texts: readonly string[];
}

export interface CampaignResultsView {
  readonly campaign: CampaignView;
  readonly minResponses: number;
  readonly teams: readonly (ResultBlockView & {
    readonly teamId: string; readonly teamName: string; readonly groupId: string; readonly headcount: number;
    readonly visible: boolean; readonly hiddenReason: string | null; readonly responseRate: number | null;
  })[];
  readonly groups: readonly (ResultBlockView & {
    readonly groupId: string; readonly groupName: string; readonly visible: boolean; readonly includesHiddenTeams: boolean;
  })[];
  readonly org: ResultBlockView;
}

/** What a respondent sees at their team's link. Nothing else is readable without logging in. */
export interface PublicSurveyView {
  readonly surveyName: string;
  readonly campaignName: string;
  readonly teamName: string;
  readonly questions: readonly QuestionView[];
  readonly accepting: boolean;
  readonly closesOn: string;
  readonly alreadySubmitted: boolean;
  /** Plain statement of what is and isn't stored, shown on the page. */
  readonly privacyNote: string;
}

// ── Team insights (shared by drill-down, EM to TL and TL to Team) ──────────

/** One of the team's metrics, as a headline chip: colour-coded against the bar, with the delta. */
export interface HeadlineItem {
  readonly header: MetricHeader;
  readonly cell: CellView;
}

export interface StatView {
  readonly key: string;
  readonly label: string;
  readonly current: number;
  readonly previous: number;
  /** e.g. "+3 (+20%)". */
  readonly deltaText: string;
  readonly previousText: string;
  readonly direction: 'up' | 'down' | 'flat';
}

export interface StatusTimeView {
  readonly status: string;
  readonly statusClass: 'todo' | 'active' | 'waiting' | 'done';
  readonly meanHours: number;
  readonly meanText: string;
  readonly medianText: string | null;
  /** Share of finished items that were ever in this status (0–1). */
  readonly visitedShare: number;
}

export interface BounceView {
  readonly items: number;
  readonly bouncedItems: number;
  readonly rate: number | null;
  readonly transitions: readonly { from: string; to: string; count: number }[];
}

export interface InFlightView {
  /** In-progress items that have sat in their current status at least this long are listed as not moved. */
  readonly staleDays: number;
  readonly columns: readonly {
    status: string; statusClass: 'todo' | 'active' | 'waiting' | 'done'; count: number; medianText: string | null; oldestText: string; oldestHours: number;
  }[];
  readonly notMoved: readonly { key: string; type: string; status: string; days: number; daysText: string }[];
}

export interface TeamInsightsView {
  readonly windowDays: number;
  readonly stats: readonly StatView[];
  readonly statusTimes: readonly StatusTimeView[];
  readonly bounce: BounceView;
  readonly inFlight: InFlightView;
}
