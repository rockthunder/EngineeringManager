import { useMemo, useState } from 'react';
import type { BenchmarkConfigView, LevelKey, SettingsView } from '@contract';
import { InfoLink } from '../../components/InfoLink';
import { formatDay } from '../../components/Toolbar';
import { useAdmin, useChange } from './hooks';

const LEVELS: LevelKey[] = ['elite', 'high', 'medium', 'low'];
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

interface Edit {
  thresholds?: { elite: string; high: string; medium: string };
  bar?: LevelKey;
  profileBar?: LevelKey | 'inherit';
}

export function BenchmarksTab() {
  const cfg = useAdmin<BenchmarkConfigView>('benchmarks');
  const settings = useAdmin<SettingsView>('settings');
  const publish = useChange<{ change: unknown; effectiveFrom: string }, BenchmarkConfigView>('POST', 'benchmarks/versions');
  const saveSettings = useChange<Partial<SettingsView>>('PUT', 'settings');

  const [profile, setProfile] = useState('product');
  const [edits, setEdits] = useState<Record<string, Record<string, Edit>>>({});
  const [date, setDate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const c = cfg.data;
  const effective = date || c?.today || '';
  const forProfile = edits[profile] ?? {};

  const change = useMemo((): {
    thresholds: Record<string, Record<string, unknown>>;
    bars: { org: Record<string, string>; byProfile: Record<string, Record<string, string>> } | Record<string, never>;
    count: number;
  } => {
    if (!c) return { thresholds: {}, bars: {}, count: 0 };
    const thresholds: Record<string, Record<string, unknown>> = {};
    const bars: { org: Record<string, string>; byProfile: Record<string, Record<string, string>> } = { org: {}, byProfile: {} };
    let count = 0;
    for (const [prof, perMetric] of Object.entries(edits)) {
      for (const [id, e] of Object.entries(perMetric)) {
        const m = c.metrics.find((x) => x.id === id)!;
        const cur = m.thresholds[prof]!;
        if (e.thresholds) {
          const t = { elite: Number(e.thresholds.elite), high: Number(e.thresholds.high), medium: Number(e.thresholds.medium) };
          if (t.elite !== cur.elite || t.high !== cur.high || t.medium !== cur.medium) {
            (thresholds[prof] ??= {})[id] = t;
            count++;
          }
        }
        if (e.bar && prof === 'product' && e.bar !== m.bar) { bars.org[id] = e.bar; count++; }
        if (e.profileBar && e.profileBar !== 'inherit' && e.profileBar !== (m.barByProfile[prof] ?? m.bar)) {
          (bars.byProfile[prof] ??= {})[id] = e.profileBar;
          count++;
        }
      }
    }
    return { thresholds, bars, count };
  }, [c, edits]);

  if (!c || !settings.data) return <p className="muted">Loading…</p>;
  const s = settings.data;

  const setEdit = (id: string, patch: Edit) =>
    setEdits((prev) => ({ ...prev, [profile]: { ...prev[profile], [id]: { ...prev[profile]?.[id], ...patch } } }));

  const onPublish = async () => {
    setError(null);
    try {
      await publish.mutateAsync({ change: { thresholds: change.thresholds, bars: change.bars }, effectiveFrom: effective });
      setEdits({});
      setDate('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <p className="lede">
        Each metric has four levels (Elite, High, Medium, Low) and a bar: the level the Director expects. Changing a threshold or a bar
        never edits history: it publishes the next version from a date, and the grids recolour straight away.
      </p>

      <div className="toolbar">
        <div className="toolbar-group" role="group" aria-label="Profile">
          {c.profiles.map((p) => (
            <button key={p.id} type="button" className={`chip${profile === p.id ? ' on' : ''}`} aria-pressed={profile === p.id} onClick={() => setProfile(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <span className="tag">Latest: Bar v{c.latest.number} from {formatDay(c.latest.effectiveFrom)}</span>
        <span className="tag muted">In force today: Bar v{c.inForce}</span>
      </div>
      {profile !== 'product' && (
        <p className="muted small">Platform inherits Product thresholds except where overridden (marked). Editing a Platform value creates an override.</p>
      )}

      <div className="grid-scroll">
        <table className="grid editor">
          <thead>
            <tr>
              <th className="sticky">Metric</th><th>Better</th><th>Elite</th><th>High</th><th>Medium</th><th>Currently means</th><th>Bar</th>
            </tr>
          </thead>
          <tbody>
            {c.metrics.map((m) => {
              const cur = m.thresholds[profile]!;
              const e = forProfile[m.id];
              const t = e?.thresholds ?? { elite: String(cur.elite), high: String(cur.high), medium: String(cur.medium) };
              const dirty = Object.values(change.thresholds[profile] ?? {}).length > 0 && change.thresholds[profile]?.[m.id] !== undefined;
              const bar = profile === 'product' ? (e?.bar ?? m.bar) : (e?.profileBar ?? m.barByProfile[profile] ?? 'inherit');
              return (
                <tr key={m.id} className={dirty ? 'dirty' : ''}>
                  <th scope="row" className="sticky team">
                    {m.name} <InfoLink metricId={m.id} name={m.name} />
                    <small>{m.unitLabel}{m.overridden[profile] ? ' · overridden' : ''}</small>
                  </th>
                  <td className="small">{m.direction === 'higher' ? 'higher' : 'lower'}</td>
                  {(['elite', 'high', 'medium'] as const).map((k) => (
                    <td key={k}>
                      <input
                        aria-label={`${m.name} ${k} threshold`}
                        className="num"
                        type="number"
                        step="any"
                        value={t[k]}
                        onChange={(ev) => setEdit(m.id, { thresholds: { ...t, [k]: ev.target.value } })}
                      />
                    </td>
                  ))}
                  <td className="small muted">{m.text[profile]!.elite} · {m.text[profile]!.high} · {m.text[profile]!.medium}</td>
                  <td>
                    <select
                      aria-label={`${m.name} bar`}
                      value={bar}
                      onChange={(ev) =>
                        profile === 'product' ? setEdit(m.id, { bar: ev.target.value as LevelKey }) : setEdit(m.id, { profileBar: ev.target.value as LevelKey | 'inherit' })
                      }
                    >
                      {profile !== 'product' && <option value="inherit">Org bar ({cap(m.bar)})</option>}
                      {LEVELS.map((l) => <option key={l} value={l}>{cap(l)}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="publish card">
        <div>
          <strong>{change.count === 0 ? 'No changes yet' : `${change.count} change${change.count === 1 ? '' : 's'} ready to publish`}</strong>
          <p className="muted small">
            Edits across both profiles are published together. A new version must take effect after Bar v{c.latest.number} (from {formatDay(c.latest.effectiveFrom)}).
          </p>
        </div>
        <label>
          Effective from{' '}
          <input type="date" value={effective} min={c.minEffectiveFrom} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="button" className="primary" disabled={change.count === 0 || publish.isPending} onClick={onPublish}>
          Publish Bar v{c.latest.number + 1} from {effective ? formatDay(effective) : '…'}
        </button>
        {change.count > 0 && <button type="button" className="secondary" onClick={() => setEdits({})}>Discard</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {publish.isSuccess && !error && <p className="ok" role="status">Published. The grids now use the new version where it is in force.</p>}

      <h2>Versions</h2>
      <ol className="versions" reversed>
        {[...c.versions].reverse().map((v) => (
          <li key={v.number}>
            <strong>Bar v{v.number}</strong> from {formatDay(v.effectiveFrom)}{' '}
            {v.inForce && <span className="tag">in force</span>}
            <ul>{v.changes.map((ch) => <li key={ch}>{ch}</li>)}</ul>
          </li>
        ))}
      </ol>

      <h2>Colours</h2>
      <p className="muted small">Each cell also shows a text label, so colour is never the only signal.</p>
      <div className="toolbar">
        <div className="toolbar-group" role="radiogroup" aria-label="Colour mode">
          <label className="check">
            <input type="radio" name="mode" checked={s.colourMode === 'distance'} onChange={() => saveSettings.mutate({ colourMode: 'distance' })} />
            By distance from the bar (default)
          </label>
          <label className="check">
            <input type="radio" name="mode" checked={s.colourMode === 'level'} onChange={() => saveSettings.mutate({ colourMode: 'level' })} />
            By level (Elite is always blue)
          </label>
        </div>
      </div>
      <div className="toolbar">
        {(['blue', 'green', 'amber', 'red', 'grey'] as const).map((k) => (
          <label key={k} className="check">
            <input aria-label={`${k} colour`} type="color" value={s.colours[k]} onChange={(e) => saveSettings.mutate({ colours: { ...s.colours, [k]: e.target.value } })} />
            {cap(k)}
          </label>
        ))}
      </div>
    </>
  );
}
