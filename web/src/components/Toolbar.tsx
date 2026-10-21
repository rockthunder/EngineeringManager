import { useState } from 'react';
import type { PageContext, RangeKey } from '@contract';
import type { ViewParams } from '../useViewParams';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7', label: '7 days' },
  { key: '14', label: '14 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'qtd', label: 'Quarter to date' },
  { key: 'metric', label: 'Metric default' },
  { key: 'custom', label: 'Custom' },
];

export function formatDay(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  });
}

interface Props {
  readonly context: PageContext | undefined;
  readonly params: ViewParams;
  readonly onChange: (patch: Partial<ViewParams>) => void;
  readonly showCompare?: boolean;
  readonly showVersion?: boolean;
  readonly showRange?: boolean;
}

/** On every screen: time range, compare, benchmark version label and "data as of". */
export function Toolbar({ context, params, onChange, showCompare = true, showVersion = false, showRange = true }: Props) {
  const active: RangeKey | undefined = params.range ?? context?.range;
  const [from, setFrom] = useState(params.from ?? '');
  const [to, setTo] = useState(params.to ?? '');

  return (
    <div className="toolbar">
      {showRange && (
        <div className="toolbar-group" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`chip${active === r.key ? ' on' : ''}`}
              aria-pressed={active === r.key}
              onClick={() => (r.key === 'custom' ? onChange({ range: 'custom', from: from || params.from, to: to || params.to }) : onChange({ range: r.key }))}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      {showRange && active === 'custom' && (
        <form
          className="toolbar-group"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) onChange({ range: 'custom', from, to });
          }}
        >
          <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="submit" className="chip" disabled={!from || !to}>Apply</button>
        </form>
      )}
      {showRange && showCompare && (
        <label className="check">
          <input type="checkbox" checked={params.compare} onChange={(e) => onChange({ compare: e.target.checked })} />
          Compare with previous period
        </label>
      )}
      {showRange && showVersion && (
        <label>
          Grade history against{' '}
          <select value={params.version} onChange={(e) => onChange({ version: e.target.value as 'in_force' | 'today' })}>
            <option value="in_force">the bar in force at the time</option>
            <option value="today">today’s bar</option>
          </select>
        </label>
      )}
      <div className="toolbar-meta">
        {context && (
          <>
            <span className="tag" title={`Effective ${formatDay(context.benchmarkEffectiveFrom)}`}>
              Graded against Bar v{context.benchmarkVersion}
            </span>
            <span className="tag muted" title="When the last successful poll finished">
              Data as of {context.dataAsOf ? formatStamp(context.dataAsOf) : 'never'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
