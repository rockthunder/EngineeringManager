import type { RangeKey } from './range';
import type { SettingsStore } from './ports/settings-store';

export const SCREENS = [
  'team-benchmark', 'org-benchmark', 'team-drilldown', 'eng-mbr', 'director-execs', 'em-director', 'em-tl', 'tl-team',
] as const;
export type ScreenKey = (typeof SCREENS)[number];

export type ColourKey = 'blue' | 'green' | 'amber' | 'red' | 'grey';

export interface AppSettings {
  /** Global default window; each screen can override it. */
  readonly defaultRange: Exclude<RangeKey, 'custom'>;
  readonly screenDefaults: Readonly<Partial<Record<ScreenKey, Exclude<RangeKey, 'custom'>>>>;
  /** 'distance' (default) colours by levels from the bar; 'level' fixes Elite as blue regardless of the bar. */
  readonly colourMode: 'distance' | 'level';
  readonly colours: Readonly<Record<ColourKey, string>>;
  readonly pollEveryHours: number;
  readonly backfillDays: number;
  /** Anonymity threshold for survey results: default 4, never below 3. */
  readonly surveyMinResponses: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultRange: '30',
  screenDefaults: {},
  colourMode: 'distance',
  colours: { blue: '#2f6fed', green: '#2e9e5b', amber: '#e0a21b', red: '#d64545', grey: '#9aa0a6' },
  pollEveryHours: 6,
  backfillDays: 365,
  surveyMinResponses: 4,
};

export class SettingsError extends Error {}

const KEY = 'app';

export async function loadSettings(store: SettingsStore): Promise<AppSettings> {
  const saved = await store.get<Partial<AppSettings>>(KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    colours: { ...DEFAULT_SETTINGS.colours, ...saved?.colours },
  };
}

export function rangeFor(settings: AppSettings, screen: ScreenKey): Exclude<RangeKey, 'custom'> {
  return settings.screenDefaults[screen] ?? settings.defaultRange;
}

export async function updateSettings(store: SettingsStore, patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await loadSettings(store)), ...patch };
  if (patch.colours) next.colours = { ...DEFAULT_SETTINGS.colours, ...patch.colours };
  if (!Number.isInteger(next.surveyMinResponses) || next.surveyMinResponses < 3) {
    throw new SettingsError('The survey minimum can be changed but never below 3');
  }
  if (!(next.pollEveryHours >= 1)) throw new SettingsError('Poll at least every hour or less often');
  if (!(next.backfillDays >= 1 && next.backfillDays <= 730)) throw new SettingsError('Backfill window must be 1–730 days');
  await store.set(KEY, next);
  return next;
}
