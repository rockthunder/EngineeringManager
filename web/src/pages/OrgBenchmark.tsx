import { useQuery } from '@tanstack/react-query';
import type { OrgBenchmarkView } from '@contract';
import { api } from '../api';
import { Cell } from '../components/Cell';
import { InfoLink } from '../components/InfoLink';
import { Legend } from '../components/Legend';
import { Toolbar } from '../components/Toolbar';
import { useColours } from '../components/useColours';
import { useViewParams } from '../useViewParams';

export function OrgBenchmark() {
  const v = useViewParams();
  const q = useQuery({
    queryKey: ['org-benchmark', v.query()],
    queryFn: () => api<OrgBenchmarkView>(`/api/benchmark/org?${v.query()}`),
    placeholderData: (prev) => prev,
  });
  const view = q.data;
  useColours(view?.colours);

  return (
    <>
      <header className="page-head">
        <h1>Org benchmark</h1>
        <p className="lede">Is engineering as a whole moving towards the bar? Figures are pooled across all teams’ events, not averaged.</p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showCompare={false} showVersion />
      {q.error && <p className="error" role="alert">{(q.error as Error).message}</p>}
      {!view && !q.error && <p className="muted">Loading…</p>}
      {view && (
        <>
          <div className="filters"><Legend colourMode={view.colourMode} /></div>
          <h2>Whole organisation, selected window</h2>
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  {view.metrics.map((m) => (
                    <th key={m.id} className="metric">{m.name} <InfoLink metricId={m.id} name={m.name} /><small>{m.windowDays}d</small></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>{view.org.cells.map((c) => <Cell key={c.metricId} cell={c} />)}</tr>
                <tr className="atabove">
                  {view.metrics.map((m) => {
                    const a = view.atOrAbove.find((x) => x.metricId === m.id);
                    return <td key={m.id} className="small"><strong>{a ? `${a.atOrAbove} of ${a.graded}` : '–'}</strong>{a && <small className="block muted">teams at or above bar{a.previousAtOrAbove !== null ? ` (was ${a.previousAtOrAbove})` : ''}</small>}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <h2>By month</h2>
          <p className="muted small">
            Each metric over its own default window ending at the month end, graded against{' '}
            {view.version === 'in_force' ? 'the bar in force at the time' : 'today’s bar'}.
          </p>
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th className="sticky">Metric</th>
                  {view.months.map((m) => <th key={m.endDay} className="metric">{m.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {view.metrics.map((m, i) => (
                  <tr key={m.id}>
                    <th scope="row" className="sticky team">{m.name} <InfoLink metricId={m.id} name={m.name} /><small>{m.windowDays}d windows</small></th>
                    {view.months.map((mo) => <Cell key={mo.endDay} cell={mo.cells[i]!} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
