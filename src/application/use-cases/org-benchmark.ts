import { instantToDay, lastNDays } from '../../domain/time/day';
import { resolveRange, type RangeInput } from '../range';
import { loadSettings, rangeFor } from '../settings';
import type { AtOrAbove, OrgBenchmarkView } from '../views/contract';
import { cellView } from '../views/grid-view';
import { dataAsOf, pageContext } from '../views/page';
import { computeBenchmarkGrid, loadGridInput, type BenchmarkGrid } from './benchmark-grid';
import { computeMonthly, monthEnds, monthlyRangeDays } from './monthly';
import type { ViewDeps } from './team-benchmark';

export interface OrgBenchmarkRequest {
  readonly range?: RangeInput;
  readonly version?: 'in_force' | 'today';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(endDay: string, today: string): string {
  const [y, m] = endDay.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}${endDay === today ? ' (to date)' : ''}`;
}

/** Counts only: how many teams are at or above the bar per metric, never which ones. */
export function teamsAtOrAbove(grid: BenchmarkGrid): AtOrAbove[] {
  return grid.metrics
    .filter((m) => m.graded)
    .map((m) => {
      const idx = grid.metrics.findIndex((x) => x.id === m.id);
      const graded = grid.rows.map((r) => r.cells[idx]!.grade).filter((g) => g.status === 'graded');
      const atOrAbove = graded.filter((g) => g.status === 'graded' && g.distance >= 0).length;
      return {
        metricId: m.id,
        atOrAbove,
        graded: graded.length,
        text: graded.length === 0 ? 'No team has enough data' : `${atOrAbove} of ${graded.length} teams at or above the bar`,
      };
    });
}

/** Is engineering as a whole moving towards the bar? Org row, 12 months of org cells, and team counts. */
export async function getOrgBenchmark(deps: ViewDeps, req: OrgBenchmarkRequest = {}): Promise<OrgBenchmarkView> {
  const settings = await loadSettings(deps.settingsStore);
  const today = instantToDay(deps.clock.now());
  const range = req.range ?? { range: rangeFor(settings, 'org-benchmark') };
  const { endDay, windowDays } = resolveRange(range, today);
  const version = req.version ?? 'in_force';

  const months = monthEnds(today, 12);
  const from = lastNDays(today, monthlyRangeDays(today, months) + 1).from;
  const [base, asOf] = await Promise.all([
    loadGridInput(deps, { from, to: lastNDays(today, 1).to }),
    dataAsOf(deps.syncStore),
  ]);
  const input = { ...base, today };

  const current = computeBenchmarkGrid(input, { endDay, compare: false, version, ...(windowDays === undefined ? {} : { windowDays }) });
  const monthly = computeMonthly(input, months, version);

  return {
    ...pageContext(current, settings, asOf, range.range),
    metrics: current.metrics,
    org: { cells: current.org.cells.map((c) => cellView(c, settings)) },
    atOrAbove: teamsAtOrAbove(current),
    months: monthly.map((m) => ({
      endDay: m.endDay,
      label: monthLabel(m.endDay, today),
      cells: m.grid.org.cells.map((c) => cellView(c, settings)),
    })),
    version,
  };
}

