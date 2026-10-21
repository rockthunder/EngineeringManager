import { useQuery } from '@tanstack/react-query';
import type { MbrView } from '@contract';
import { api } from '../api';
import { TrendArrow } from '../components/Cell';
import { InfoLink } from '../components/InfoLink';
import { Toolbar } from '../components/Toolbar';
import { useColours } from '../components/useColours';
import { LineChart } from '../charts/LineChart';
import { useViewParams } from '../useViewParams';

export function EngMbr() {
  const v = useViewParams();
  const q = useQuery({ queryKey: ['eng-mbr', v.query()], queryFn: () => api<MbrView>(`/api/views/eng-mbr?${v.query()}`) });
  useColours(q.data?.colours);
  const view = q.data;

  return (
    <>
      <header className="page-head">
        <h1>Eng MBR</h1>
        <p className="lede">How has engineering trended this month and quarter? The five DORA metrics, new capability share and developer experience, for the whole organisation.</p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showRange={false} />
      {q.error && <p className="error" role="alert">{(q.error as Error).message}</p>}
      {!view && !q.error && <p className="muted">Loading…</p>}
      <div className="cards metrics">
        {view?.metrics.map((m) => (
          <section key={m.metricId} className="card">
            <div className="metric-head">
              <h3>{m.name} <InfoLink metricId={m.metricId} name={m.name} /></h3>
              <div className={`pill c-${m.cell.colour}`} title={m.cell.tooltip}>
                <strong>{m.cell.valueText}</strong>
                <span className="small">{m.cell.detail}</span>
              </div>
            </div>
            <ul className="movement">
              <li><TrendArrow trend={m.monthOnMonth} /> <strong>Month on month</strong> {m.monthOnMonth?.text ?? '–'}</li>
              <li><TrendArrow trend={m.quarterOnQuarter} /> <strong>Quarter on quarter</strong> {m.quarterOnQuarter?.text ?? '–'}</li>
            </ul>
            <LineChart points={m.series} />
            <p className="annot muted small">Annotations on this chart: coming soon</p>
          </section>
        ))}
      </div>
    </>
  );
}
