import { useState } from 'react';
import type { DataSourcesView, SourceDefinitionsView } from '@contract';
import { formatStamp } from '../../components/Toolbar';
import { useAdmin, useChange } from './hooks';

const CLASSES = ['todo', 'active', 'waiting', 'done'] as const;
const CATEGORIES = [['new_capability', 'New capability'], ['maintenance', 'Maintenance'], ['defect', 'Defect'], ['tech_debt', 'Tech debt']] as const;

export function SourcesTab() {
  const q = useAdmin<DataSourcesView>('data-sources');
  const run = useChange<Record<string, never>, DataSourcesView>('POST', 'sync/run');
  const settings = useChange<{ pollEveryHours?: number; backfillDays?: number }>('PUT', 'settings');
  const defs = useChange<SourceDefinitionsView, DataSourcesView>('PUT', 'data-sources/definitions');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<SourceDefinitionsView | null>(null);

  if (!q.data) return <p className="muted">Loading…</p>;
  const d = q.data;
  const current = draft ?? d.definitions;
  const guard = async (f: () => Promise<unknown>) => {
    setError(null);
    try { await f(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <p className="lede">
        {d.simulated
          ? 'This build runs on dummy data. “Run now” makes the fake source emit the next simulated day, exactly as a real poll would fetch what changed since the last cursor.'
          : 'Each source is polled on a schedule; “Run now” polls immediately.'}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="toolbar">
        <button
          type="button" className="primary" disabled={run.isPending}
          onClick={() => guard(async () => {
            const before = d.dataAsOf;
            const res = await run.mutateAsync({});
            setNote(`Polled. ${d.simulated ? `The world is now at ${res.watermarkDay}. ` : ''}Data as of ${res.dataAsOf ? formatStamp(res.dataAsOf) : 'never'}${before === res.dataAsOf ? ' (unchanged)' : ''}.`);
          })}
        >
          {run.isPending ? 'Running…' : 'Run now'}
        </button>
        <span className="tag muted">Data as of {d.dataAsOf ? formatStamp(d.dataAsOf) : 'never'}</span>
        {d.watermarkDay && <span className="tag muted">Simulated day: {d.watermarkDay}</span>}
      </div>
      {note && <p className="ok" role="status">{note}</p>}

      {d.sources.map((s) => (
        <section key={s.name} className="card">
          <h2 style={{ marginTop: 0 }}>{s.label}</h2>
          <table className="plain">
            <thead><tr><th>Stream</th><th>Last run</th><th>Status</th><th>Events updated</th><th>Cursor</th></tr></thead>
            <tbody>
              {s.streams.map((st) => (
                <tr key={st.stream}>
                  <td>{st.stream.replace('_', ' ')}</td>
                  <td>{st.lastRunAt ? formatStamp(st.lastRunAt) : '–'}</td>
                  <td className={st.status === 'failed' ? 'error' : st.status === 'succeeded' ? 'ok' : ''}>{st.status}{st.error ? `: ${st.error}` : ''}</td>
                  <td>{st.upserted}</td>
                  <td className="small muted mono">{st.cursor ? st.cursor.slice(0, 28) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <div className="toolbar">
        <label>Poll every{' '}
          <input className="num" type="number" min={1} defaultValue={d.pollEveryHours} aria-label="Poll every hours"
            onBlur={(e) => Number(e.target.value) !== d.pollEveryHours && guard(() => settings.mutateAsync({ pollEveryHours: Number(e.target.value) }))} /> hours
        </label>
        <label>First sync backfills{' '}
          <input className="num" type="number" min={1} max={730} defaultValue={d.backfillDays} aria-label="Backfill days"
            onBlur={(e) => Number(e.target.value) !== d.backfillDays && guard(() => settings.mutateAsync({ backfillDays: Number(e.target.value) }))} /> days
        </label>
        <span className="muted small">The scheduled worker comes later; for now polling happens when you press Run now.</span>
      </div>

      <h2>Recent runs</h2>
      <table className="plain">
        <thead><tr><th>#</th><th>Stream</th><th>Started</th><th>Mode</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>
          {d.recentRuns.map((r) => (
            <tr key={r.id}><td>{r.id}</td><td>{r.stream}</td><td>{formatStamp(r.startedAt)}</td><td>{r.mode}</td><td>{r.status}</td><td>{r.upserted}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Definitions for this source</h2>
      <p className="muted small">
        These tell the calculators how to read the raw events. Changes apply immediately because metrics are computed from stored events, with no re-fetch.
      </p>
      <div className="card form">
        <label>Production environment <input aria-label="Production environment" value={current.productionEnvironment} onChange={(e) => setDraft({ ...current, productionEnvironment: e.target.value })} /></label>
        <label>Found-in-production label <input value={current.foundInProductionLabel} onChange={(e) => setDraft({ ...current, foundInProductionLabel: e.target.value })} /></label>
        <label>Hotfix label <input value={current.hotfixLabel} onChange={(e) => setDraft({ ...current, hotfixLabel: e.target.value })} /></label>
        <h3>Jira statuses: active or waiting?</h3>
        <table className="plain">
          <tbody>
            {Object.entries(current.statusClasses).map(([status, cls]) => (
              <tr key={status}>
                <td>{status}</td>
                <td>
                  <select aria-label={`${status} class`} value={cls} onChange={(e) => setDraft({ ...current, statusClasses: { ...current.statusClasses, [status]: e.target.value as (typeof CLASSES)[number] } })}>
                    {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Issue types → investment category</h3>
        <table className="plain">
          <tbody>
            {Object.entries(current.issueTypeCategories).map(([type, cat]) => (
              <tr key={type}>
                <td>{type}</td>
                <td>
                  <select aria-label={`${type} category`} value={cat} onChange={(e) => setDraft({ ...current, issueTypeCategories: { ...current.issueTypeCategories, [type]: e.target.value as (typeof CATEGORIES)[number][0] } })}>
                    {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button type="button" className="primary" disabled={!draft || defs.isPending} onClick={() => guard(async () => { await defs.mutateAsync(draft!); setDraft(null); })}>Save definitions</button>
          {draft && <button type="button" className="secondary" onClick={() => setDraft(null)}>Discard</button>}
        </div>
      </div>
    </>
  );
}
