import { barFor, thresholdsFor } from '../../domain/benchmarks/version';
import { AGEING_DAYS } from '../../domain/metrics/calculators';
import { REGISTRY, REGISTRY_BY_ID } from '../../domain/metrics/registry';
import type { MetricId } from '../../domain/metrics/types';
import { startedAt, statusClassAt } from '../../domain/events/definitions';
import { EMPTY_EVENTS } from '../../domain/events/types';
import { attributeEvents } from '../../domain/teams/attribution';
import { instantToDay, lastNDays, MS_PER_DAY, MS_PER_HOUR } from '../../domain/time/day';
import { NotFoundError } from '../errors';
import { loadSettings, rangeFor, type ScreenKey } from '../settings';
import { resolveRange, type RangeInput } from '../range';
import type {
  EmDirectorView, EmTlView, ExecsView, FocusItem, HeadlineView, MbrView, TeamOption, TlTeamView,
} from '../views/contract';
import { barText, levelName } from '../views/format';
import { cellView, trendView } from '../views/grid-view';
import { dataAsOf, pageContext } from '../views/page';
import { computeBenchmarkGrid, loadGridInput, type BenchmarkGrid, type GridInput } from './benchmark-grid';
import { computeMonthly, monthEnds, monthlyRangeDays } from './monthly';
import { monthLabel, teamsAtOrAbove } from './org-benchmark';
import { getTeamBenchmark, type ViewDeps } from './team-benchmark';

async function prepare(deps: ViewDeps, screen: ScreenKey, extraDays: number, range?: RangeInput) {
  const settings = await loadSettings(deps.settingsStore);
  const today = instantToDay(deps.clock.now());
  const r = range ?? { range: rangeFor(settings, screen) };
  const months = monthEnds(today, 12);
  const from = lastNDays(today, monthlyRangeDays(today, months) + extraDays).from;
  const [base, asOf] = await Promise.all([
    loadGridInput(deps, { from, to: lastNDays(today, 1).to }),
    dataAsOf(deps.syncStore),
  ]);
  const input: GridInput = { ...base, today };
  return { settings, today, range: r, months, input, asOf, resolved: resolveRange(r, today) };
}

const MBR_METRICS: readonly MetricId[] = [
  'deployment_frequency', 'lead_time', 'change_failure_rate', 'failed_deployment_recovery_time',
  'deployment_rework_rate', 'new_capability_share', 'devex_score',
];

const orgCell = (grid: BenchmarkGrid, id: MetricId) => grid.org.cells.find((c) => c.metricId === id)!;

/** Eng MBR: the five DORA metrics, new capability share and DevEx, with month and quarter movement. */
export async function getEngMbr(deps: ViewDeps, range?: RangeInput): Promise<MbrView> {
  const p = await prepare(deps, 'eng-mbr', 180, range);
  const g30 = computeBenchmarkGrid(p.input, { windowDays: 30, compare: true });
  const g90 = computeBenchmarkGrid(p.input, { windowDays: 90, compare: true });
  const current = computeBenchmarkGrid(p.input, { compare: true });
  const monthly = computeMonthly(p.input, p.months);

  return {
    ...pageContext(current, p.settings, p.asOf, p.range.range),
    metrics: MBR_METRICS.map((id) => {
      const def = REGISTRY_BY_ID[id];
      const idx = REGISTRY.findIndex((m) => m.id === id);
      return {
        metricId: id,
        name: def.name,
        unitLabel: def.unitLabel,
        cell: cellView(orgCell(current, id), p.settings),
        monthOnMonth: trendView(orgCell(g30, id)),
        quarterOnQuarter: trendView(orgCell(g90, id)),
        series: monthly.map((m) => {
          const c = cellView(m.grid.org.cells[idx]!, p.settings);
          return { endDay: m.endDay, label: monthLabel(m.endDay, p.today), value: c.status === 'insufficient_data' ? null : c.value, colour: c.colour, text: c.valueText };
        }),
      };
    }),
  };
}

const EXEC_METRICS: readonly MetricId[] = [
  'deployment_frequency', 'lead_time', 'change_failure_rate', 'failed_deployment_recovery_time', 'new_capability_share', 'devex_score',
];

/** Director to Execs: are we delivering faster and more safely, on the right work? Six headlines vs last quarter. */
export async function getDirectorExecs(deps: ViewDeps): Promise<ExecsView> {
  const p = await prepare(deps, 'director-execs', 180);
  const grid = computeBenchmarkGrid(p.input, { windowDays: 90, compare: true });
  const counts = teamsAtOrAbove(grid);
  return {
    ...pageContext(grid, p.settings, p.asOf, '90'),
    headlines: EXEC_METRICS.map((id): HeadlineView => ({
      metricId: id,
      name: REGISTRY_BY_ID[id].name,
      cell: cellView(orgCell(grid, id), p.settings),
      atOrAbove: counts.find((c) => c.metricId === id) ?? null,
    })),
  };
}

/** EM to Director: the benchmark grid for one EM's group, each team's trend against its own baseline. */
export async function getEmDirector(
  deps: ViewDeps,
  req: { groupId?: string | null; range?: RangeInput; version?: 'in_force' | 'today' } = {},
): Promise<EmDirectorView> {
  const org = await deps.configStore.loadOrganisation();
  const groupId = req.groupId || [...org.groups].sort((a, b) => a.name.localeCompare(b.name))[0]?.id;
  if (!groupId || !org.groups.some((g) => g.id === groupId)) throw new NotFoundError(`No group ${req.groupId ?? ''}`);
  const settings = await loadSettings(deps.settingsStore);
  const range = req.range ?? { range: rangeFor(settings, 'em-director') };
  const view = await getTeamBenchmark(deps, { range, compare: true, version: req.version ?? 'in_force', groupId });
  return { ...view, selectedGroup: groupId };
}

const teamOption = (t: { id: string; name: string; groupId: string }): TeamOption => ({ id: t.id, name: t.name, groupId: t.groupId });

/** EM to TL: where can this team improve? Furthest from the bar, and most improved. */
export async function getEmTl(
  deps: ViewDeps,
  req: { teamId?: string | null; range?: RangeInput; version?: 'in_force' | 'today' } = {},
): Promise<EmTlView> {
  const p = await prepare(deps, 'em-tl', 60, req.range);
  const teams = [...p.input.organisation.teams].filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name));
  const team = req.teamId ? teams.find((t) => t.id === req.teamId) : teams[0];
  if (!team) throw new NotFoundError(`No team ${req.teamId ?? ''}`);

  const grid = computeBenchmarkGrid(p.input, {
    endDay: p.resolved.endDay, compare: true, version: req.version ?? 'in_force',
    ...(p.resolved.windowDays === undefined ? {} : { windowDays: p.resolved.windowDays }),
  });
  const row = grid.rows.find((r) => r.teamId === team.id)!;
  const items: (FocusItem & { distance: number; change: number })[] = row.cells.map((c, i) => {
    const view = cellView(c, p.settings);
    return {
      metricId: c.metricId, name: grid.metrics[i]!.name, cell: view,
      distance: c.grade.status === 'graded' ? c.grade.distance : Number.POSITIVE_INFINITY,
      change: view.trend?.judgement === 'improving' ? Math.abs(view.trend.relativeChange ?? 0) : -1,
    };
  });
  const strip = ({ metricId, name, cell }: FocusItem): FocusItem => ({ metricId, name, cell });
  return {
    ...pageContext(grid, p.settings, p.asOf, p.range.range),
    team: teamOption(team),
    teams: teams.map(teamOption),
    furthestFromBar: items.filter((i) => i.distance < 0).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name)).slice(0, 3).map(strip),
    mostImproved: items.filter((i) => i.change >= 0).sort((a, b) => b.change - a.change).slice(0, 3).map(strip),
  };
}

/** TL to Team: what is stuck right now? Plain lists against bar lines: no red/green grid. */
export async function getTlTeam(deps: ViewDeps, req: { teamId?: string | null } = {}): Promise<TlTeamView> {
  const p = await prepare(deps, 'tl-team', 60);
  const { organisation, definitions, versions, events } = p.input;
  const teams = [...organisation.teams].filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name));
  const team = req.teamId ? teams.find((t) => t.id === req.teamId) : teams[0];
  if (!team) throw new NotFoundError(`No team ${req.teamId ?? ''}`);

  const now = deps.clock.now();
  const grid = computeBenchmarkGrid(p.input, { windowDays: 30, compare: false });
  const version = versions.find((v) => v.number === grid.benchmarkVersion)!;
  const bar = (id: MetricId) => {
    const t = thresholdsFor(version, team.profileId, id);
    const level = barFor(version, team.profileId, id);
    return t ? { text: `${barText(REGISTRY_BY_ID[id], t, level)} (${levelName(level)})`, value: level === 'low' ? null : t[level] } : { text: '', value: null };
  };
  const ev = attributeEvents(events, organisation.mappings, definitions).get(team.id) ?? EMPTY_EVENTS;

  const inProgress = ev.workItems
    .filter((w) => w.createdAt < now && ['active', 'waiting'].includes(statusClassAt(w, definitions, now)))
    .map((w) => {
      const start = startedAt(w, definitions) ?? w.createdAt;
      const last = [...w.transitions].filter((t) => t.at < now).pop();
      return { key: w.key, type: w.type, ageDays: (now - start) / MS_PER_DAY, status: last?.to ?? 'In Progress' };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
  const aged = inProgress.filter((i) => i.ageDays > AGEING_DAYS).length;

  const pickupBar = bar('pr_pickup_time');
  const waiting = ev.pullRequests
    .filter((x) => x.openedAt < now && x.firstReviewAt === null && x.mergedAt === null)
    .map((x) => ({ id: x.sourceId, repo: x.repo, waitingHours: (now - x.openedAt) / MS_PER_HOUR, lines: x.linesChanged }))
    .sort((a, b) => b.waitingHours - a.waitingHours);

  const sizeBar = bar('pr_size');
  const weekStart = lastNDays(instantToDay(now), 7).from;
  const sizes = ev.pullRequests
    .filter((x) => x.mergedAt !== null && x.mergedAt >= weekStart && x.mergedAt < now)
    .map((x) => ({ id: x.sourceId, repo: x.repo, lines: x.linesChanged, day: instantToDay(x.mergedAt!) }))
    .sort((a, b) => b.lines - a.lines);

  const boards = new Set(organisation.mappings.filter((m) => m.teamId === team.id && m.kind === 'board').map((m) => m.ref));
  const current = events.sprints.filter((s) => boards.has(s.board) && s.startAt <= now && now < s.endAt).sort((a, b) => b.startAt - a.startAt)[0];
  const sprint = current
    ? (() => {
        const committed = current.committedItemIds.length;
        const done = new Set(current.completedItemIds);
        const completed = current.committedItemIds.filter((id) => done.has(id)).length;
        return {
          name: current.sourceId,
          startDay: instantToDay(current.startAt),
          endDay: instantToDay(current.endAt - 1),
          daysLeft: Math.max(0, Math.ceil((current.endAt - now) / MS_PER_DAY)),
          committed,
          completed,
          percentDone: committed === 0 ? 0 : Math.round((completed / committed) * 100),
          expectedPercent: Math.round(((now - current.startAt) / (current.endAt - current.startAt)) * 100),
        };
      })()
    : null;

  return {
    ...pageContext(grid, p.settings, p.asOf, '30'),
    team: teamOption(team),
    teams: teams.map(teamOption),
    ageing: {
      thresholdDays: AGEING_DAYS,
      bar: bar('ageing_wip').text,
      items: inProgress.map((i) => ({ ...i, aged: i.ageDays > AGEING_DAYS })),
      agedShare: inProgress.length === 0 ? null : aged / inProgress.length,
    },
    waitingForReview: {
      bar: pickupBar.text,
      pickupBarHours: pickupBar.value,
      prs: waiting.map((x) => ({ ...x, overBar: pickupBar.value !== null && x.waitingHours > pickupBar.value })),
    },
    prSizes: {
      bar: sizeBar.text,
      barLines: sizeBar.value,
      prs: sizes.map((x) => ({ ...x, overBar: sizeBar.value !== null && x.lines >= sizeBar.value })),
    },
    sprint,
  };
}
