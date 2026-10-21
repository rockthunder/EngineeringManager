import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { GlossaryView } from '@contract';
import { api } from '../api';

export function Glossary() {
  const { hash } = useLocation();
  const q = useQuery({ queryKey: ['glossary'], queryFn: () => api<GlossaryView>('/api/glossary'), staleTime: Infinity });
  const g = q.data;

  useEffect(() => {
    if (g && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [g, hash]);

  if (q.error) return <p className="error" role="alert">{(q.error as Error).message}</p>;
  if (!g) return <p className="muted">Loading…</p>;

  const groups = [...new Set(g.entries.map((e) => e.group))];
  return (
    <>
      <header className="page-head">
        <h1>Glossary</h1>
        <p className="lede">Generated from the same definitions that compute the numbers, so what you read here is what is measured.</p>
      </header>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Principles</h2>
        <dl className="principles">
          {g.principles.map((p) => (
            <div key={p.title}><dt>{p.title}</dt><dd>{p.text}</dd></div>
          ))}
        </dl>
        <h3>How the org figures are computed</h3>
        <p>{g.aggregationRule}</p>
      </section>

      <nav className="toc" aria-label="Metrics">
        {groups.map((grp) => (
          <div key={grp}>
            <h3>{grp}</h3>
            {g.entries.filter((e) => e.group === grp).map((e) => <a key={e.id} href={`#${e.id}`}>{e.name}</a>)}
          </div>
        ))}
      </nav>

      {g.entries.map((e) => (
        <article key={e.id} id={e.id} className={`card entry${hash === `#${e.id}` ? ' focus' : ''}`}>
          <h2 style={{ marginTop: 0 }}>{e.name}</h2>
          <p className="muted small">{e.group} · {e.unitLabel} · {e.direction}</p>
          <p>{e.definition}</p>
          <dl className="facts">
            <dt>Formula</dt><dd>{e.formula}</dd>
            <dt>Source</dt><dd>{e.source}</dd>
            {e.thresholds && (
              <>
                <dt>Levels</dt>
                <dd>Elite: {e.thresholds.elite} · High: {e.thresholds.high} · Medium: {e.thresholds.medium} · Low: {e.thresholds.low}</dd>
              </>
            )}
            <dt>A high number means</dt><dd>{e.highMeans}</dd>
            <dt>A low number means</dt><dd>{e.lowMeans}</dd>
            <dt>Org aggregation</dt><dd>{e.aggregation.text}<br /><em>Example: {e.aggregation.example}</em></dd>
            <dt>Minimum sample</dt><dd>{e.minSample} · default window {e.defaultWindowDays} days</dd>
            <dt>Watch out for</dt><dd>{e.watchOuts}</dd>
            {e.counterpart && <><dt>Read it beside</dt><dd><Link to={`/glossary#${e.counterpart.id}`}>{e.counterpart.name}</Link></dd></>}
          </dl>
        </article>
      ))}
    </>
  );
}
