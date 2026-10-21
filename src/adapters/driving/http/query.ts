import type { RangeInput } from '../../../application/range';

type Q = Record<string, string | undefined>;

const RANGES = ['7', '14', '30', '90', 'qtd', 'metric', 'custom'] as const;

/** `?range=30|qtd|metric|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`; absent range = the screen's default. */
export function parseRange(q: Q): RangeInput | undefined {
  if (!q['range']) return undefined;
  if (!(RANGES as readonly string[]).includes(q['range'])) {
    throw Object.assign(new Error(`Unknown range: ${q['range']}`), { statusCode: 400 });
  }
  return {
    range: q['range'] as RangeInput['range'],
    ...(q['from'] ? { from: q['from'] } : {}),
    ...(q['to'] ? { to: q['to'] } : {}),
  };
}

export const flag = (v: string | undefined, dflt: boolean): boolean => (v === undefined ? dflt : v === '1' || v === 'true');
