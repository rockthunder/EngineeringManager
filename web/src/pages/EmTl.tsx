import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { EmTlView, FocusItem } from '@contract';
import { api } from '../api';
import { TrendArrow } from '../components/Cell';
import { InfoLink } from '../components/InfoLink';
import { Toolbar } from '../components/Toolbar';
import { useColours } from '../components/useColours';
import { useTeamParam } from '../components/useTeamParam';
import { useViewParams } from '../useViewParams';

function Focus({ item, teamId, carry }: { item: FocusItem; teamId: string; carry: string }) {
  return (
    <li className="card focus-item">
      <div className="metric-head">
        <h3>{item.name} <InfoLink metricId={item.metricId} name={item.name} /></h3>
        <div className={`pill c-${item.cell.colour}`}>
          <strong>{item.cell.valueText}</strong> <TrendArrow trend={item.cell.trend} />
          <span className="small">{item.cell.detail}</span>
        </div>
      </div>
      <p className="muted small">{item.cell.tooltip}</p>
      {item.cell.trend && <p className="small">{item.cell.trend.text}</p>}
      <Link to={`/teams/${teamId}${carry}`}>Where does the time go? →</Link>
    </li>
  );
}

export function EmTl() {
  const v = useViewParams();
  const { team, setTeam } = useTeamParam();
  const q = useQuery({
    queryKey: ['em-tl', team, v.query()],
    queryFn: () => api<EmTlView>(`/api/views/em-tl?${v.query(team ? { team } : {})}`),
    placeholderData: (prev) => prev,
  });
  const view = q.data;
  useColours(view?.colours);

  return (
    <>
      <header className="page-head">
        <h1>EM to TL</h1>
        <p className="lede">Where can this team improve? Start from what is furthest from the bar and what has improved most, then look at where the time goes.</p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showVersion />
      <div className="filters">
        <label>
          Team{' '}
          <select value={view?.team.id ?? ''} onChange={(e) => setTeam(e.target.value)}>
            {view?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      {q.error && <p className="error" role="alert">{(q.error as Error).message}</p>}
      {!view && !q.error && <p className="muted">Loading…</p>}
      {view && (
        <div className="two-col">
          <section>
            <h2>Furthest from the bar</h2>
            {view.furthestFromBar.length === 0 && <p className="muted">Nothing is below the bar in this window.</p>}
            <ul className="stack">
              {view.furthestFromBar.map((i) => <Focus key={i.metricId} item={i} teamId={view.team.id} carry={v.carry({ metric: i.metricId })} />)}
            </ul>
          </section>
          <section>
            <h2>Most improved</h2>
            {view.mostImproved.length === 0 && <p className="muted">No metric has improved on the previous period.</p>}
            <ul className="stack">
              {view.mostImproved.map((i) => <Focus key={i.metricId} item={i} teamId={view.team.id} carry={v.carry({ metric: i.metricId })} />)}
            </ul>
          </section>
        </div>
      )}
      {view && <p><Link to={`/teams/${view.team.id}${v.carry()}`}>Open the full drill-down for {view.team.name} →</Link></p>}
    </>
  );
}
