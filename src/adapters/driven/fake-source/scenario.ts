import { defaultBenchmarkVersion } from '../../../domain/benchmarks/defaults';
import { deriveBenchmarkVersion, type BenchmarkVersion } from '../../../domain/benchmarks/version';
import type { SourceDefinitions } from '../../../domain/events/definitions';
import { daysBetween, type Day } from '../../../domain/time/day';
import type { Organisation } from '../../../domain/teams/organisation';
import type { Mapping, Team } from '../../../domain/teams/types';
import { addDays, addMonths } from './dates';
import type { Behaviour, BoardPlan, OrgPlan, RepoPlan } from './plan';

export const HISTORY_DAYS = 365;

export const dummyDefinitions: SourceDefinitions = {
  productionEnvironment: 'production',
  statusClasses: {
    'To Do': 'todo',
    'In Progress': 'active',
    'In Review': 'active',
    Blocked: 'waiting',
    'Waiting for QA': 'waiting',
    Done: 'done',
  },
  foundInProductionLabel: 'found-in-prod',
  hotfixLabel: 'hotfix',
  issueTypeCategories: { Story: 'new_capability', Bug: 'defect', Chore: 'maintenance', 'Tech debt': 'tech_debt' },
  categoryLabels: {},
};

const linear = (from: Day, to: Day, a: number, b: number) => (day: Day) => {
  const f = Math.min(1, Math.max(0, daysBetween(from, day) / Math.max(1, daysBetween(from, to))));
  return a + (b - a) * f;
};

const base: Behaviour = {
  engineers: 6,
  prsPerEngineerWeek: 1.2,
  codingH: [8, 0.6],
  pickupH: [4.5, 0.6],
  reviewH: [26, 0.7],
  sizeLines: [160, 0.6],
  deployDelayH: [2, 0.5],
  cadence: { kind: 'weekdays', dows: [1, 3, 5], hourUtc: 10 },
  changeFailureRate: 0.07,
  rollbackShare: 0.3,
  reworkRate: 0.06,
  recoveryH: [6, 0.8],
  backgroundIncidentsPerMonth: 0,
  itemsPerEngineerWeek: 1.0,
  cycleDays: [5, 0.6],
  flowEfficiency: 0.3,
  mix: { newCapability: 0.58, bug: 0.15, maintenance: 0.2, techDebt: 0.07 },
  bugFoundInProd: 0.3,
  unplannedShare: 0.12,
  survey: { mean: 3.8, responseRate: 0.85 },
};

export interface TeamSeed {
  readonly team: Team;
  readonly behaviour: Behaviour;
  readonly repos: readonly string[];
  /** First day the team exists (Juniper formed mid-history). */
  readonly startDay: Day;
}

export interface Scenario {
  readonly anchorDay: Day;
  readonly historyStart: Day;
  readonly reorgDay: Day;
  readonly organisation: Organisation;
  readonly plan: OrgPlan;
  readonly definitions: SourceDefinitions;
  readonly benchmarkVersions: readonly BenchmarkVersion[];
  readonly teamSeeds: readonly TeamSeed[];
}

/**
 * The ten fictional teams. Behaviour is defined here and nowhere else; history ends at `anchorDay`.
 * Bar v1 applies from the start of history; Bar v2 (lead-time bar raised to Elite) three months ago.
 */
export function dummyScenario(anchorDay: Day): Scenario {
  const historyStart = addDays(anchorDay, -HISTORY_DAYS);
  const reorgDay = addDays(anchorDay, -120);

  const team = (id: string, name: string, profileId: 'product' | 'platform', groupId: string, headcount: number): Team => ({
    id, name, profileId, groupId, headcount, archived: false,
  });

  const harbour: Behaviour = {
    ...base,
    drift: linear(addDays(anchorDay, -180), anchorDay, 1, 3.2),
    driftsFailureRate: true,
  };
  const juniper: Behaviour = {
    ...base,
    engineers: 5,
    cadence: { kind: 'weekdays', dows: [2, 4], hourUtc: 10 },
    itemsPerEngineerWeek: 0.9,
    survey: { mean: 3.9, responseRate: 0.85 },
  };

  const seeds: TeamSeed[] = [
    {
      team: team('aurora', 'Aurora', 'product', 'north', 7),
      repos: ['aurora-web', 'aurora-api'],
      startDay: historyStart,
      behaviour: {
        ...base, engineers: 7, prsPerEngineerWeek: 1.6, cadence: { kind: 'perMerge' },
        codingH: [4, 0.5], pickupH: [0.6, 0.7], reviewH: [4, 0.6], sizeLines: [55, 0.6], deployDelayH: [0.3, 0.5],
        changeFailureRate: 0.03, reworkRate: 0.03, recoveryH: [0.4, 0.6],
        itemsPerEngineerWeek: 1.2, cycleDays: [2, 0.5], flowEfficiency: 0.5,
        mix: { newCapability: 0.62, bug: 0.12, maintenance: 0.2, techDebt: 0.06 }, bugFoundInProd: 0.2, unplannedShare: 0.06,
        survey: { mean: 4.15, responseRate: 0.9 },
      },
    },
    {
      team: team('birch', 'Birch', 'product', 'north', 6),
      repos: ['birch-api', 'birch-app'],
      startDay: historyStart,
      behaviour: { ...base, mix: { newCapability: 0.66, bug: 0.12, maintenance: 0.16, techDebt: 0.06 } },
    },
    {
      team: team('comet', 'Comet', 'product', 'north', 8),
      repos: ['comet-core', 'comet-edge'],
      startDay: historyStart,
      behaviour: {
        ...base, engineers: 8, prsPerEngineerWeek: 2.8, cadence: { kind: 'perMerge' },
        codingH: [3, 0.5], pickupH: [0.5, 0.7], reviewH: [3, 0.6], sizeLines: [45, 0.6], deployDelayH: [0.2, 0.5],
        changeFailureRate: 0.28, rollbackShare: 0.4, reworkRate: 0.15, recoveryH: [4, 0.8],
        itemsPerEngineerWeek: 1.3, cycleDays: [2.5, 0.5], flowEfficiency: 0.45,
        mix: { newCapability: 0.55, bug: 0.15, maintenance: 0.22, techDebt: 0.08 }, unplannedShare: 0.18,
        survey: { mean: 3.6, responseRate: 0.85 },
      },
    },
    {
      team: team('delta', 'Delta', 'product', 'central', 6),
      repos: ['delta-monolith'],
      startDay: historyStart,
      behaviour: {
        ...base, prsPerEngineerWeek: 0.9, cadence: { kind: 'weekdays', dows: [4], hourUtc: 10 },
        codingH: [400, 0.5], pickupH: [36, 0.6], reviewH: [216, 0.5], sizeLines: [650, 0.7], deployDelayH: [48, 0.4],
        changeFailureRate: 0.12, reworkRate: 0.1, recoveryH: [20, 0.8],
        itemsPerEngineerWeek: 0.8, cycleDays: [16, 0.6], flowEfficiency: 0.18,
        mix: { newCapability: 0.35, bug: 0.2, maintenance: 0.3, techDebt: 0.15 }, bugFoundInProd: 0.5, unplannedShare: 0.28,
        survey: { mean: 3.0, responseRate: 0.75 },
      },
    },
    {
      team: team('ember', 'Ember', 'platform', 'central', 5),
      repos: ['ember-platform'],
      startDay: historyStart,
      behaviour: {
        ...base, engineers: 5, prsPerEngineerWeek: 1.0, cadence: { kind: 'every', days: 10, hourUtc: 11 },
        codingH: [6, 0.5], pickupH: [1.5, 0.6], reviewH: [8, 0.6], sizeLines: [130, 0.6], deployDelayH: [4, 0.5],
        changeFailureRate: 0.04, reworkRate: 0.04, recoveryH: [0.5, 0.6], backgroundIncidentsPerMonth: 4,
        itemsPerEngineerWeek: 0.9, cycleDays: [4, 0.5], flowEfficiency: 0.35,
        mix: { newCapability: 0.52, bug: 0.12, maintenance: 0.28, techDebt: 0.08 }, bugFoundInProd: 0.2, unplannedShare: 0.1,
        survey: { mean: 3.9, responseRate: 0.9 },
      },
    },
    {
      team: team('fjord', 'Fjord', 'product', 'central', 6),
      repos: ['fjord-ios', 'fjord-android'],
      startDay: historyStart,
      behaviour: {
        ...base, prsPerEngineerWeek: 1.1, cadence: { kind: 'weekdays', dows: [2], hourUtc: 12 },
        codingH: [10, 0.5], pickupH: [3, 0.6], reviewH: [16, 0.6], sizeLines: [150, 0.6], deployDelayH: [72, 0.3],
        changeFailureRate: 0.06, reworkRate: 0.05, recoveryH: [12, 0.8], cycleDays: [6, 0.5],
        survey: { mean: 3.7, responseRate: 0.85 },
      },
    },
    {
      team: team('garnet', 'Garnet', 'product', 'south', 7),
      repos: ['garnet-api', 'garnet-web'],
      startDay: historyStart,
      behaviour: {
        ...base, engineers: 7, prsPerEngineerWeek: 1.3, cadence: { kind: 'weekdays', dows: [1, 2, 3, 4, 5], hourUtc: 14 },
        codingH: [8, 0.5], pickupH: [3, 0.6], reviewH: [12, 0.6], sizeLines: [150, 0.6], deployDelayH: [4, 0.5],
        changeFailureRate: 0.08, recoveryH: [5, 0.8], itemsPerEngineerWeek: 1.1, cycleDays: [4, 0.5], flowEfficiency: 0.32,
        drift: linear(historyStart, anchorDay, 14, 0.9), driftsFailureRate: true,
        survey: { mean: 3.8, responseRate: 0.85 },
      },
    },
    {
      team: team('harbour', 'Harbour', 'product', 'south', 6),
      repos: ['harbour-core', 'harbour-web', 'harbour-billing', 'harbour-notify'],
      startDay: historyStart,
      behaviour: harbour,
    },
    {
      team: team('iris', 'Iris', 'product', 'south', 2),
      repos: ['iris-tool'],
      startDay: historyStart,
      behaviour: {
        ...base, engineers: 2, prsPerEngineerWeek: 0.6, itemsPerEngineerWeek: 0.5,
        survey: { mean: 3.8, responseRate: 1, fixedResponses: 2 },
      },
    },
    { team: team('juniper', 'Juniper', 'product', 'south', 5), repos: [], startDay: reorgDay, behaviour: juniper },
  ];

  const moved = new Set(['harbour-billing', 'harbour-notify']);

  const repos: RepoPlan[] = [];
  for (const s of seeds) {
    for (const name of s.repos) {
      const isMoved = moved.has(name);
      const prsPerWeek = (s.behaviour.prsPerEngineerWeek * s.behaviour.engineers) / s.repos.length;
      repos.push({
        name,
        service: `${name}-svc`,
        prsPerWeek,
        backgroundIncidentsPerMonth: s.behaviour.backgroundIncidentsPerMonth / s.repos.length,
        behaviourAt: isMoved ? (day) => (day < reorgDay ? harbour : juniper) : () => s.behaviour,
      });
    }
  }

  const prefixes: Record<string, string> = {
    aurora: 'AUR', birch: 'BIR', comet: 'COM', delta: 'DEL', ember: 'EMB',
    fjord: 'FJO', garnet: 'GAR', harbour: 'HAR', iris: 'IRI', juniper: 'JUN',
  };
  const boards: BoardPlan[] = seeds.map((s, i) => ({
    name: `${s.team.id}-board`,
    prefix: prefixes[s.team.id]!,
    startDay: s.startDay,
    sprintOffsetDays: i,
    behaviourAt: () => s.behaviour,
  }));

  const mappings: Mapping[] = [];
  for (const s of seeds) {
    for (const r of s.repos) {
      const isMoved = moved.has(r);
      const to = isMoved ? reorgDay : null;
      mappings.push({ teamId: s.team.id, kind: 'repo', ref: r, effectiveFrom: historyStart, effectiveTo: to });
      mappings.push({ teamId: s.team.id, kind: 'service', ref: `${r}-svc`, effectiveFrom: historyStart, effectiveTo: to });
      if (isMoved) {
        mappings.push({ teamId: 'juniper', kind: 'repo', ref: r, effectiveFrom: reorgDay, effectiveTo: null });
        mappings.push({ teamId: 'juniper', kind: 'service', ref: `${r}-svc`, effectiveFrom: reorgDay, effectiveTo: null });
      }
    }
    mappings.push({ teamId: s.team.id, kind: 'board', ref: `${s.team.id}-board`, effectiveFrom: s.startDay, effectiveTo: null });
  }

  const v1 = defaultBenchmarkVersion(historyStart);
  const v2 = deriveBenchmarkVersion(v1, { bars: { org: { lead_time: 'elite' } } }, addMonths(anchorDay, -3));

  return {
    anchorDay,
    historyStart,
    reorgDay,
    organisation: {
      profiles: [
        { id: 'product', name: 'Product' },
        { id: 'platform', name: 'Platform' },
      ],
      groups: [
        { id: 'north', name: 'North' },
        { id: 'central', name: 'Central' },
        { id: 'south', name: 'South' },
      ],
      teams: seeds.map((s) => s.team),
      mappings,
    },
    plan: { repos, boards },
    definitions: dummyDefinitions,
    benchmarkVersions: [v1, v2],
    teamSeeds: seeds,
  };
}
