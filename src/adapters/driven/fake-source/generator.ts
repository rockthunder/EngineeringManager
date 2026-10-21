import type {
  Deployment, Incident, PullRequest, SprintMembership, StatusTransition, WorkItem,
} from '../../../domain/events/types';
import { dayToInstant, MS_PER_DAY, MS_PER_HOUR, type Day, type Instant } from '../../../domain/time/day';
import { addDays, dayOfWeek } from './dates';
import type { Behaviour, BoardPlan, OrgPlan, RepoPlan } from './plan';
import { hash32, streamFor, type Rng } from './prng';

const SOURCE = 'fake';
const hours = (n: number) => n * MS_PER_HOUR;
const days = (n: number) => n * MS_PER_DAY;
const SPRINT_MS = days(14);

/** A sprint with the facts needed to snapshot it at any moment. */
export interface SprintFull {
  readonly sourceId: string;
  readonly board: string;
  readonly startAt: Instant;
  readonly endAt: Instant;
  readonly committed: readonly string[];
  /** Committed items with the time they were completed (any time; the snapshot cuts it off). */
  readonly completions: readonly { readonly itemId: string; readonly doneAt: Instant }[];
}

/** Every entity in its final state. Snapshots cut this off at a point in time. */
export interface World {
  readonly deployments: readonly Deployment[];
  readonly pullRequests: readonly PullRequest[];
  readonly workItems: readonly WorkItem[];
  readonly sprints: readonly SprintFull[];
  readonly incidents: readonly Incident[];
}

export interface WorldConfig {
  readonly seed: number;
  readonly startDay: Day;
  /** Last day to generate (inclusive). Extending it never changes anything earlier. */
  readonly endDay: Day;
  readonly plan: OrgPlan;
}

function dayRange(start: Day, end: Day): Day[] {
  const out: Day[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Weekends are quiet. Divided by 5.2 (the week's total weight) so stated weekly volumes are the real ones. */
const weekdayFactor = (day: Day) => ([0, 6].includes(dayOfWeek(day)) ? 0.1 : 1) / 5.2;
const speedAt = (b: Behaviour, day: Day) => b.drift?.(day) ?? 1;

function sha(id: string): string {
  return hash32(id).toString(16).padStart(8, '0') + hash32(`${id}!`).toString(16).padStart(8, '0');
}

function nextSlot(b: Behaviour, eligibleAt: Instant, startDay: Day): Instant {
  const c = b.cadence;
  if (c.kind === 'perMerge') return eligibleAt;
  if (c.kind === 'every') {
    const base = dayToInstant(startDay) + hours(c.hourUtc);
    const n = Math.max(0, Math.ceil((eligibleAt - base) / days(c.days)));
    return base + n * days(c.days);
  }
  for (let t = Math.floor(eligibleAt / MS_PER_DAY) * MS_PER_DAY; ; t += MS_PER_DAY) {
    const slot = t + hours(c.hourUtc);
    if (slot >= eligibleAt && c.dows.includes(new Date(t).getUTCDay())) return slot;
  }
}

interface RepoOutput {
  deployments: Deployment[];
  pullRequests: PullRequest[];
  incidents: Incident[];
}

function generateRepo(cfg: WorldConfig, repo: RepoPlan): RepoOutput {
  const out: RepoOutput = { deployments: [], pullRequests: [], incidents: [] };
  const slots = new Map<string, { at: Instant; behaviour: Behaviour; day: Day; prIds: string[] }>();

  for (const day of dayRange(cfg.startDay, cfg.endDay)) {
    const b = repo.behaviourAt(day);
    const speed = speedAt(b, day);
    const count = streamFor(cfg.seed, 'pr-count', repo.name, day).poisson(repo.prsPerWeek * weekdayFactor(day));

    for (let k = 0; k < count; k++) {
      const r = streamFor(cfg.seed, 'pr', repo.name, day, k);
      const id = `${repo.name}#${day}.${k}`;
      const openedAt = Math.round(dayToInstant(day) + hours(r.uniform(8, 17)));
      const firstCommitAt = Math.round(openedAt - hours(r.logNormal(b.codingH[0] * speed, b.codingH[1])));
      const firstReviewAt = Math.round(openedAt + hours(r.logNormal(b.pickupH[0] * speed, b.pickupH[1])));
      const mergedAt = Math.round(firstReviewAt + hours(r.logNormal(b.reviewH[0] * speed, b.reviewH[1])));
      const linesChanged = Math.max(1, Math.round(r.logNormal(b.sizeLines[0] * Math.sqrt(speed), b.sizeLines[1])));
      const eligibleAt = Math.round(mergedAt + hours(r.logNormal(b.deployDelayH[0] * speed, b.deployDelayH[1])));

      const slotAt = nextSlot(b, eligibleAt, cfg.startDay);
      const deploymentId = b.cadence.kind === 'perMerge' ? `${repo.name}|m|${id}` : `${repo.name}|${slotAt}`;
      const slot = slots.get(deploymentId);
      if (slot) slot.prIds.push(id);
      else slots.set(deploymentId, { at: slotAt, behaviour: b, day, prIds: [id] });

      out.pullRequests.push({
        source: SOURCE, sourceId: id, updatedAt: mergedAt, repo: repo.name, firstCommitAt, openedAt,
        firstReviewAt, mergedAt, linesChanged, deploymentId,
      });
    }

    // Background incidents (not caused by a deployment), e.g. platform infrastructure.
    const bg = streamFor(cfg.seed, 'bg-incidents', repo.name, day);
    const nBg = bg.poisson(repo.backgroundIncidentsPerMonth / 30);
    for (let k = 0; k < nBg; k++) {
      const r = streamFor(cfg.seed, 'bg-incident', repo.name, day, k);
      const startedAt = Math.round(dayToInstant(day) + hours(r.uniform(0, 24)));
      out.incidents.push({
        source: SOURCE, sourceId: `inc|${repo.name}|bg|${day}.${k}`, updatedAt: startedAt, service: repo.service,
        startedAt, restoredAt: Math.round(startedAt + hours(r.logNormal(b.recoveryH[0] * speed, b.recoveryH[1]))), deploymentId: null,
      });
    }
  }

  for (const [id, slot] of slots) {
    const b = slot.behaviour;
    const speed = speedAt(b, slot.day);
    const r = streamFor(cfg.seed, 'deployment', id);
    out.deployments.push({
      source: SOURCE, sourceId: id, updatedAt: slot.at, repo: repo.name, environment: 'production', at: slot.at,
      commitShas: slot.prIds.map(sha), isRework: false, isRollback: false,
    });

    const cfr = Math.min(0.45, b.changeFailureRate * (b.driftsFailureRate ? Math.sqrt(speed) : 1));
    if (r.chance(cfr)) {
      const startedAt = Math.round(slot.at + hours(r.logNormal(0.3, 0.5)));
      const restoredAt = Math.round(startedAt + hours(r.logNormal(b.recoveryH[0] * speed, b.recoveryH[1])));
      const rollback = r.chance(b.rollbackShare);
      const last = out.deployments[out.deployments.length - 1]!;
      out.deployments[out.deployments.length - 1] = { ...last, isRollback: rollback };
      out.incidents.push({
        source: SOURCE, sourceId: `inc|${id}`, updatedAt: restoredAt, service: repo.service, startedAt, restoredAt,
        deploymentId: id,
      });
    }

    if (r.chance(b.reworkRate)) {
      const at = Math.round(slot.at + hours(r.logNormal(8, 0.6)));
      out.deployments.push({
        source: SOURCE, sourceId: `${id}|hotfix`, updatedAt: at, repo: repo.name, environment: 'production', at,
        commitShas: [sha(`${id}|hotfix`)], isRework: true, isRollback: false,
      });
    }
  }
  return out;
}

const sprintStart = (epoch: Instant, n: number) => epoch + n * SPRINT_MS;
const sprintIndex = (epoch: Instant, t: Instant) => Math.floor((t - epoch) / SPRINT_MS);

interface BoardOutput {
  workItems: WorkItem[];
  sprints: SprintFull[];
}

function pickType(r: Rng, mix: Behaviour['mix']): string {
  const x = r.next();
  if (x < mix.newCapability) return 'Story';
  if (x < mix.newCapability + mix.bug) return 'Bug';
  if (x < mix.newCapability + mix.bug + mix.maintenance) return 'Chore';
  return 'Tech debt';
}

function generateBoard(cfg: WorldConfig, board: BoardPlan): BoardOutput {
  const epoch = dayToInstant(addDays(board.startDay, -board.sprintOffsetDays));
  const workItems: WorkItem[] = [];
  const committed = new Map<number, string[]>();
  const doneAt = new Map<string, Instant>();

  for (const day of dayRange(board.startDay > cfg.startDay ? board.startDay : cfg.startDay, cfg.endDay)) {
    const b = board.behaviourAt(day);
    const speed = Math.sqrt(speedAt(b, day)); // work items drift more gently than PRs
    const lambda = b.itemsPerEngineerWeek * b.engineers * weekdayFactor(day);
    const count = streamFor(cfg.seed, 'item-count', board.name, day).poisson(lambda);

    for (let k = 0; k < count; k++) {
      const r = streamFor(cfg.seed, 'item', board.name, day, k);
      const key = `${board.prefix}-${1000 + k + 20 * Math.round((dayToInstant(day) - dayToInstant(cfg.startDay)) / MS_PER_DAY)}`;
      const createdAt = Math.round(dayToInstant(day) + hours(r.uniform(8, 17)));
      const type = pickType(r, b.mix);
      const foundInProduction = type === 'Bug' && r.chance(b.bugFoundInProd);
      const urgent = r.chance(b.unplannedShare);
      const startAt = urgent
        ? Math.round(createdAt + hours(r.logNormal(3, 0.6)))
        : Math.round(sprintStart(epoch, sprintIndex(epoch, createdAt) + 1) + days(r.uniform(0.2, 9)));

      const cycle = days(r.logNormal(b.cycleDays[0] * speed, b.cycleDays[1]));
      const active = Math.min(cycle * 0.95, cycle * b.flowEfficiency * r.uniform(0.8, 1.2));
      const waiting = cycle - active;
      const u = r.uniform(0.3, 0.7);
      const steps: [string, number][] = [
        ['In Progress', 0.4 * active],
        ['Blocked', u * waiting],
        ['In Progress', 0.3 * active],
        ['In Review', 0.3 * active],
        ['Waiting for QA', (1 - u) * waiting],
      ];
      // Some items are sent back: from review (In Review → In Progress) or after a QA rejection.
      const pBounce = Math.min(0.6, b.bounceRate * (b.driftsFailureRate ? speed : 1));
      if (r.chance(pBounce)) {
        const loops = r.chance(0.25) ? 2 : 1;
        const rework = (): [string, number][] => [['In Progress', 0.2 * active], ['In Review', 0.1 * active]];
        if (r.chance(0.6)) {
          steps.splice(4, 0, ...Array.from({ length: loops }, rework).flat());
        } else {
          for (let k = 0; k < loops; k++) steps.push(...rework(), ['Waiting for QA', 0.25 * waiting]);
        }
      }
      const transitions: StatusTransition[] = [{ from: null, to: 'To Do', at: createdAt }];
      let t = startAt;
      let prev = 'To Do';
      for (const [status, length] of steps) {
        transitions.push({ from: prev, to: status, at: Math.round(t) });
        prev = status;
        t += length;
      }
      transitions.push({ from: prev, to: 'Done', at: Math.round(t) });

      const n = sprintIndex(epoch, startAt);
      const sStart = sprintStart(epoch, n);
      const addedAt = createdAt <= sStart ? Math.max(createdAt, sStart - days(r.uniform(0, 3))) : createdAt + hours(0.5);
      const sprintId = `${board.name}-S${n}`;
      const membership: SprintMembership = { sprintId, addedAt: Math.round(addedAt) };
      if (membership.addedAt <= sStart) {
        const list = committed.get(n) ?? [];
        list.push(key);
        committed.set(n, list);
      }
      doneAt.set(key, Math.round(t));

      workItems.push({
        source: SOURCE, sourceId: key, updatedAt: Math.round(t), key, type,
        labels: foundInProduction ? ['found-in-prod'] : [], board: board.name, createdAt: Math.round(createdAt),
        foundInProduction, sprintMemberships: [membership], transitions,
      });
    }
  }

  const sprints: SprintFull[] = [...committed.entries()]
    .sort(([a], [b]) => a - b)
    .map(([n, ids]) => {
      const endAt = sprintStart(epoch, n + 1);
      return {
        sourceId: `${board.name}-S${n}`, board: board.name, startAt: sprintStart(epoch, n), endAt, committed: ids,
        completions: ids.flatMap((id) => {
          const done = doneAt.get(id)!;
          return done < endAt ? [{ itemId: id, doneAt: done }] : [];
        }),
      };
    });
  return { workItems, sprints };
}

/** Generate the whole world, deterministically, as a pure function of the config. */
export function generateWorld(cfg: WorldConfig): World {
  const deployments: Deployment[] = [];
  const pullRequests: PullRequest[] = [];
  const incidents: Incident[] = [];
  for (const repo of cfg.plan.repos) {
    const o = generateRepo(cfg, repo);
    deployments.push(...o.deployments);
    pullRequests.push(...o.pullRequests);
    incidents.push(...o.incidents);
  }
  const workItems: WorkItem[] = [];
  const sprints: SprintFull[] = [];
  for (const board of cfg.plan.boards) {
    const o = generateBoard(cfg, board);
    workItems.push(...o.workItems);
    sprints.push(...o.sprints);
  }
  return { deployments, pullRequests, workItems, sprints, incidents };
}
