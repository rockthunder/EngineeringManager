import { REGISTRY_BY_ID } from '../metrics/registry';
import type { MetricId } from '../metrics/types';
import { LEVEL_RANK } from './levels';
import type { BenchmarkChange } from './version';

/** Problems with a proposed benchmark change, in words; empty means it can be published. */
export function validateBenchmarkChange(change: BenchmarkChange): string[] {
  const problems: string[] = [];
  const metric = (id: string) => {
    const def = REGISTRY_BY_ID[id as MetricId];
    if (!def) problems.push(`Unknown metric: ${id}`);
    else if (!def.graded) problems.push(`${def.name} is not graded, so it has no thresholds or bar`);
    return def?.graded ? def : null;
  };

  for (const [profile, per] of Object.entries(change.thresholds ?? {})) {
    for (const [id, t] of Object.entries(per ?? {})) {
      const def = metric(id);
      if (!def || !t) continue;
      const vals = [t.elite, t.high, t.medium];
      if (!vals.every((x) => typeof x === 'number' && Number.isFinite(x))) {
        problems.push(`${def.name} (${profile}): thresholds must be numbers`);
        continue;
      }
      const better = def.direction === 'higher' ? (a: number, b: number) => a > b : (a: number, b: number) => a < b;
      if (!better(t.elite, t.high)) problems.push(`${def.name} (${profile}): Elite must be better than High`);
      else if (!better(t.high, t.medium)) problems.push(`${def.name} (${profile}): High must be better than Medium`);
    }
  }

  const bars = [change.bars?.org ?? {}, ...Object.values(change.bars?.byProfile ?? {})];
  for (const per of bars) {
    for (const [id, level] of Object.entries(per ?? {})) {
      const def = metric(id);
      if (def && !(level as string in LEVEL_RANK)) problems.push(`${def.name}: ${String(level)} is not a level`);
    }
  }
  return problems;
}
