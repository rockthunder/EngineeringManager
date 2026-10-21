import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ExecHeadline, ExecsView } from '@contract';
import { api } from '../api';
import { BandDots, Sparkline } from '../charts/Sparkline';
import { TrendArrow } from '../components/Cell';
import { InfoLink } from '../components/InfoLink';
import { Toolbar } from '../components/Toolbar';
import { useColours } from '../components/useColours';
import { useViewParams } from '../useViewParams';

function ExecTile({ h, kind }: { h: ExecHeadline; kind: string }) {
  const t = h.cell.trend;
  return (
    <section className={`exec-tile c-${h.cell.colour}`} title={h.cell.tooltip}>
      <span className="kind">{kind}</span>
      <h3>{h.name} <InfoLink metricId={h.metricId} name={h.name} /></h3>
      <div className="big">{h.cell.valueText}</div>
      {t?.deltaText ? (
        <div className="exec-delta">
          <TrendArrow trend={t} /> {t.deltaText} <small>vs last quarter ({t.previousText})</small>
        </div>
      ) : (
        <div className="exec-delta muted"><small>No comparison available</small></div>
      )}
      <div className="small">{h.cell.detail}</div>
      <p className="exec-sentence">{h.sentence}</p>
      <Sparkline points={h.series} bar={h.bar} />
      <p className="muted small" style={{ margin: 0 }}>12 months{h.bar ? `, dashed line = the bar (${h.bar.text})` : ''}</p>
      <div className="team-spread">
        <BandDots bands={h.teamBands} />
        {h.atOrAbove && (
          <span>
            <strong>{h.atOrAbove.atOrAbove} of {h.atOrAbove.graded}</strong> teams at or above the bar
            {h.atOrAbove.previousAtOrAbove !== null && <span className="muted"> (was {h.atOrAbove.previousAtOrAbove})</span>}
          </span>
        )}
      </div>
    </section>
  );
}

export function DirectorExecs() {
  const v = useViewParams();
  const q = useQuery({ queryKey: ['director-execs'], queryFn: () => api<ExecsView>('/api/views/director-execs') });
  useColours(q.data?.colours);
  const view = q.data;

  return (
    <>
      <header className="page-head">
        <h1>Director to Execs</h1>
        <p className="lede">Are we delivering faster and more safely, on the right work? The last 90 days against the 90 before. Speed always sits beside stability.</p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showRange={false} />
      {q.error && <p className="error" role="alert">{(q.error as Error).message}</p>}
      {!view && !q.error && <p className="muted">Loading…</p>}
      {view && (
        <>
          <section className="exec-summary" aria-label="Summary">
            {view.summary.sentences.map((s, i) => <p key={i}>{s}</p>)}
          </section>
          {view.pairs.map((p) => (
            <div key={p.title} className="pair">
              <h2>{p.title}</h2>
              <div className="pair-grid">
                <ExecTile h={p.left} kind={p.leftLabel} />
                <ExecTile h={p.right} kind={p.rightLabel} />
              </div>
            </div>
          ))}
          <p className="muted small">
            Dots are teams (blue above the bar, green at it, amber one level below, red two or more below, grey not enough data): counts only, never names.
            For the detail see the <Link to="/">team benchmark</Link>.
          </p>
        </>
      )}
    </>
  );
}
