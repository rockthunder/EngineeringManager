import { useState } from 'react';
import type { RangeKey, SettingsView } from '@contract';
import { useAdmin, useChange } from './hooks';

type R = Exclude<RangeKey, 'custom'>;
const RANGES: [R, string][] = [['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['qtd', 'Quarter to date'], ['metric', 'Each metric’s own window']];
const SCREENS: [string, string][] = [
  ['team-benchmark', 'Team benchmark'], ['org-benchmark', 'Org benchmark'], ['team-drilldown', 'Team drill-down'], ['em-director', 'EM to Director'], ['em-tl', 'EM to TL'],
];

export function WindowsTab() {
  const q = useAdmin<SettingsView>('settings');
  const save = useChange<Partial<SettingsView>, SettingsView>('PUT', 'settings');
  const [error, setError] = useState<string | null>(null);
  if (!q.data) return <p className="muted">Loading…</p>;
  const s = q.data;
  const run = async (patch: Partial<SettingsView>) => {
    setError(null);
    try { await save.mutateAsync(patch); } catch (e) { setError((e as Error).message); }
  };
  return (
    <>
      <p className="lede">
        The global default window applies everywhere. Each screen can open on a different one. Every metric also has its own default window
        and minimum sample (see the glossary); choose “each metric’s own window” to use those.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <table className="plain">
        <thead><tr><th>Screen</th><th>Opens on</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Global default</strong></td>
            <td>
              <select aria-label="Global default window" value={s.defaultRange} onChange={(e) => run({ defaultRange: e.target.value as R })}>
                {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </td>
          </tr>
          {SCREENS.map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              <td>
                <select
                  aria-label={`${label} default`}
                  value={s.screenDefaults[key] ?? ''}
                  onChange={(e) => {
                    const next = { ...s.screenDefaults };
                    if (e.target.value) next[key] = e.target.value as R;
                    else delete next[key];
                    void run({ screenDefaults: next });
                  }}
                >
                  <option value="">Use the global default</option>
                  {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Surveys</h2>
      <label>
        Minimum responses before a team’s results are shown{' '}
        <input className="num" type="number" min={3} aria-label="Survey minimum" defaultValue={s.surveyMinResponses}
          onBlur={(e) => Number(e.target.value) !== s.surveyMinResponses && run({ surveyMinResponses: Number(e.target.value) })} />
      </label>
      <p className="muted small">Default 4; it can never go below 3.</p>
    </>
  );
}
