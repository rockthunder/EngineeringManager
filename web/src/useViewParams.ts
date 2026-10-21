import { useSearchParams } from 'react-router-dom';
import type { RangeKey } from '@contract';

export interface ViewParams {
  readonly range: RangeKey | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly compare: boolean;
  readonly version: 'in_force' | 'today';
  readonly group: string | undefined;
  readonly profile: string | undefined;
}

/** Time range, compare and filters live in the URL, so every view is linkable and survives navigation. */
export function useViewParams() {
  const [sp, setSp] = useSearchParams();
  const params: ViewParams = {
    range: (sp.get('range') as RangeKey | null) ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    compare: sp.get('compare') !== '0',
    version: sp.get('version') === 'today' ? 'today' : 'in_force',
    group: sp.get('group') ?? undefined,
    profile: sp.get('profile') ?? undefined,
  };

  const build = (p: ViewParams, keys: readonly (keyof ViewParams)[]) => {
    const q = new URLSearchParams();
    if (keys.includes('range') && p.range) q.set('range', p.range);
    if (keys.includes('from') && p.range === 'custom' && p.from) q.set('from', p.from);
    if (keys.includes('to') && p.range === 'custom' && p.to) q.set('to', p.to);
    if (keys.includes('compare') && !p.compare) q.set('compare', '0');
    if (keys.includes('version') && p.version === 'today') q.set('version', 'today');
    if (keys.includes('group') && p.group) q.set('group', p.group);
    if (keys.includes('profile') && p.profile) q.set('profile', p.profile);
    return q.toString();
  };

  return {
    params,
    set(patch: Partial<ViewParams>) {
      const next = { ...params, ...patch };
      setSp(build(next, ['range', 'from', 'to', 'compare', 'version', 'group', 'profile']));
    },
    /** Query string for the API. */
    query: (extra: Record<string, string> = {}) => {
      const q = new URLSearchParams(build(params, ['range', 'from', 'to', 'compare', 'version', 'group', 'profile']));
      for (const [k, v] of Object.entries(extra)) q.set(k, v);
      return q.toString();
    },
    /** Query string to carry the time window to another screen via a link. */
    carry: (extra: Record<string, string> = {}) => {
      const q = new URLSearchParams(build(params, ['range', 'from', 'to', 'compare', 'version']));
      for (const [k, v] of Object.entries(extra)) q.set(k, v);
      const s = q.toString();
      return s ? `?${s}` : '';
    },
  };
}
