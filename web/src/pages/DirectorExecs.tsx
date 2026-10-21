import { useQuery } from '@tanstack/react-query';
import type { ExecsView } from '@contract';
import { api } from '../api';
import { TrendArrow } from '../components/Cell';
import { InfoLink } from '../components/InfoLink';
import { Toolbar } from '../components/Toolbar';
import { useColours } from '../components/useColours';
import { useViewParams } from '../useViewParams';

export function DirectorExecs() {
  const v = useViewParams();
  const q = useQuery({ queryKey: ['director-execs'], queryFn: () => api<ExecsView>('/api/views/director-execs') });
  useColours(q.data?.colours);
  const view = q.data;

  return (
    <>
      <header className="page-head">
        <h1>Director to Execs</h1>
        <p className="lede">Are we delivering faster and more safely, on the right work? Six headline measures for the last 90 days against the 90 before.</p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showRange={false} />
      {q.error && <p className="error" role="alert">{(q.error as Error).message}</p>}
      {!view && !q.error && <p className="muted">Loading…</p>}
      <div className="tiles">
        {view?.headlines.map((h) => (
          <section key={h.metricId} className={`tile c-${h.cell.colour}`} title={h.cell.tooltip}>
            <h2>{h.name} <InfoLink metricId={h.metricId} name={h.name} /></h2>
            <div className="big">{h.cell.valueText}</div>
            <div className="small">{h.cell.detail}</div>
            <p className="trend-line"><TrendArrow trend={h.cell.trend} /> {h.cell.trend?.text ?? ''} <span className="muted">(vs last quarter)</span></p>
            {h.atOrAbove && <p className="small"><strong>{h.atOrAbove.text}</strong></p>}
          </section>
        ))}
      </div>
    </>
  );
}
