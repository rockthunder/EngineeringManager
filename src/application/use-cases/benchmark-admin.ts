import { versionInForce, deriveBenchmarkVersion, barFor, thresholdsFor, type BenchmarkChange, type BenchmarkVersion } from '../../domain/benchmarks/version';
import { validateBenchmarkChange } from '../../domain/benchmarks/validate';
import { REGISTRY } from '../../domain/metrics/registry';
import type { ProfileId } from '../../domain/teams/types';
import { addDays, instantToDay } from '../../domain/time/day';
import { ValidationError } from '../errors';
import type { Clock } from '../ports/clock';
import type { ConfigStore } from '../ports/config-store';
import type { BenchmarkConfigView, BenchmarkMetricConfig } from '../views/contract';
import { barText, levelName } from '../views/format';

interface Deps {
  readonly configStore: ConfigStore;
  readonly clock: Clock;
}

/** What changed between two versions, in words. */
export function describeChange(prev: BenchmarkVersion | undefined, next: BenchmarkVersion): string[] {
  if (!prev) return ['Initial thresholds, bar = High for every metric'];
  const out: string[] = [];
  for (const def of REGISTRY.filter((m) => m.graded)) {
    for (const profile of ['product', 'platform'] as ProfileId[]) {
      const a = thresholdsFor(prev, profile, def.id);
      const b = thresholdsFor(next, profile, def.id);
      if (a && b && (a.elite !== b.elite || a.high !== b.high || a.medium !== b.medium)) {
        out.push(`${def.name} thresholds (${profile}): ${barText(def, a, 'high')} → ${barText(def, b, 'high')} for High`);
      }
      // The org bar is reported once; a profile's bar only when that profile has its own override.
      const own = (v: BenchmarkVersion) => (profile === 'product' ? v.bars.org[def.id] : v.bars.byProfile?.[profile]?.[def.id]) ?? 'high';
      const ba = profile === 'product' ? own(prev) : (prev.bars.byProfile?.[profile]?.[def.id] ?? barFor(prev, 'product', def.id));
      const bb = profile === 'product' ? own(next) : (next.bars.byProfile?.[profile]?.[def.id] ?? barFor(next, 'product', def.id));
      const explicit = profile === 'product' || prev.bars.byProfile?.[profile]?.[def.id] !== undefined || next.bars.byProfile?.[profile]?.[def.id] !== undefined;
      if (explicit && ba !== bb) out.push(`${def.name} bar${profile === 'product' ? '' : ` (${profile})`}: ${levelName(ba)} → ${levelName(bb)}`);
    }
  }
  return [...new Set(out)];
}

export async function getBenchmarkConfig(deps: Deps): Promise<BenchmarkConfigView> {
  const [versions, org] = await Promise.all([deps.configStore.loadBenchmarkVersions(), deps.configStore.loadOrganisation()]);
  const today = instantToDay(deps.clock.now());
  const latest = versions[versions.length - 1]!;
  const inForce = versionInForce(versions, today) ?? versions[0]!;
  const profiles = org.profiles.map((p) => ({ id: p.id, name: p.name }));

  const metrics: BenchmarkMetricConfig[] = REGISTRY.filter((m) => m.graded).map((def) => {
    const thresholds: Record<string, { elite: number; high: number; medium: number }> = {};
    const overridden: Record<string, boolean> = {};
    const text: Record<string, { elite: string; high: string; medium: string }> = {};
    const barByProfile: Record<string, 'elite' | 'high' | 'medium' | 'low' | null> = {};
    for (const p of profiles) {
      const t = thresholdsFor(latest, p.id as ProfileId, def.id)!;
      thresholds[p.id] = { elite: t.elite, high: t.high, medium: t.medium };
      overridden[p.id] = p.id !== 'product' && latest.thresholds[p.id as ProfileId]?.[def.id] !== undefined;
      text[p.id] = { elite: barText(def, t, 'elite'), high: barText(def, t, 'high'), medium: barText(def, t, 'medium') };
      barByProfile[p.id] = latest.bars.byProfile?.[p.id as ProfileId]?.[def.id] ?? null;
    }
    return {
      id: def.id, name: def.name, unitLabel: def.unitLabel, direction: def.direction as 'higher' | 'lower', group: def.group,
      thresholds, overridden, text, bar: latest.bars.org[def.id] ?? 'high', barByProfile,
    };
  });

  return {
    today,
    inForce: inForce.number,
    latest: { number: latest.number, effectiveFrom: latest.effectiveFrom },
    versions: versions.map((v, i) => ({
      number: v.number, effectiveFrom: v.effectiveFrom, inForce: v.number === inForce.number, changes: describeChange(versions[i - 1], v),
    })),
    profiles,
    metrics,
    minEffectiveFrom: addDays(latest.effectiveFrom, 1),
  };
}

/**
 * Changing thresholds or the bar never edits a version: it creates the next one, effective from
 * a date. History can then be graded against the bar in force at the time or today's.
 */
export async function publishBenchmarkVersion(
  deps: Deps,
  req: { change: BenchmarkChange; effectiveFrom?: string },
): Promise<BenchmarkConfigView> {
  const problems = validateBenchmarkChange(req.change);
  if (problems.length > 0) throw new ValidationError(problems.join('; '));
  const versions = await deps.configStore.loadBenchmarkVersions();
  const latest = versions[versions.length - 1]!;
  const effectiveFrom = req.effectiveFrom ?? instantToDay(deps.clock.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new ValidationError('The effective date must be YYYY-MM-DD');
  let next: BenchmarkVersion;
  try {
    next = deriveBenchmarkVersion(latest, req.change, effectiveFrom);
  } catch (e) {
    throw new ValidationError((e as Error).message);
  }
  if (describeChange(latest, next).length === 0) throw new ValidationError('Nothing changed: there is no new version to publish');
  await deps.configStore.appendBenchmarkVersion(next);
  return getBenchmarkConfig(deps);
}
