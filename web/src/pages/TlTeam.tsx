import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { TlTeamView } from '@contract';
import { api } from '../api';
import { BarRow } from '../components/BarRow';
import { InfoLink } from '../components/InfoLink';
import { Toolbar } from '../components/Toolbar';
import { useTeamParam } from '../components/useTeamParam';
import { useViewParams } from '../useViewParams';

const days = (n: number) => `${n.toFixed(1)} days`;
const hrs = (n: number) => (n >= 48 ? `${(n / 24).toFixed(1)} days` : `${n.toFixed(1)} h`);

export function TlTeam() {
  const v = useViewParams();
  const { team, setTeam } = useTeamParam();
  const q = useQuery({
    queryKey: ['tl-team', team],
    queryFn: () => api<TlTeamView>(`/api/views/tl-team${team ? `?team=${team}` : ''}`),
    placeholderData: (prev) => prev,
  });
  const view = q.data;

  return (
    <>
      <header className="page-head">
        <h1>TL to Team</h1>
        <p className="lede">What is stuck right now? The dashed line on each chart is the bar. This view is for the team’s own conversation, so it shows no grades.</p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showRange={false} />
      <div className="filters">
        <label>
          Team{' '}
          <select value={view?.team.id ?? ''} onChange={(e) => setTeam(e.target.value)}>
            {view?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        {view && <Link to={`/teams/${view.team.id}`}>Full drill-down →</Link>}
      </div>
      {q.error && <p className="error" role="alert">{(q.error as Error).message}</p>}
      {!view && !q.error && <p className="muted">Loading…</p>}
      {view && (
        <div className="cards">
          <section className="card">
            <h3>Ageing work in progress <InfoLink metricId="ageing_wip" name="Ageing work in progress" /></h3>
            <p className="muted small">
              {view.ageing.items.length} items in progress; {view.ageing.agedShare === null ? '–' : `${Math.round(view.ageing.agedShare * 100)}%`} older than {view.ageing.thresholdDays} days. Bar: {view.ageing.bar}.
            </p>
            {view.ageing.items.length === 0 && <p className="muted">Nothing in progress.</p>}
            {view.ageing.items.slice(0, 12).map((i) => (
              <BarRow key={i.key} label={i.key} sub={`${i.type} · ${i.status}`} value={i.ageDays} max={Math.max(30, ...view.ageing.items.map((x) => x.ageDays))}
                barAt={view.ageing.thresholdDays} valueText={days(i.ageDays)} emphasis={i.aged} />
            ))}
            <p className="muted small">Dashed line: {view.ageing.thresholdDays} days.</p>
          </section>

          <section className="card">
            <h3>PRs waiting for a first review <InfoLink metricId="pr_pickup_time" name="PR pickup time" /></h3>
            <p className="muted small">Bar for pickup: {view.waitingForReview.bar}.</p>
            {view.waitingForReview.prs.length === 0 && <p className="muted">No PR is waiting for review.</p>}
            {view.waitingForReview.prs.map((p) => (
              <BarRow key={p.id} label={p.repo} sub={`${p.lines} lines`} value={p.waitingHours}
                max={Math.max(24, ...view.waitingForReview.prs.map((x) => x.waitingHours))} barAt={view.waitingForReview.pickupBarHours}
                valueText={hrs(p.waitingHours)} emphasis={p.overBar} />
            ))}
          </section>

          <section className="card">
            <h3>PR sizes this week <InfoLink metricId="pr_size" name="PR size" /></h3>
            <p className="muted small">Merged in the last 7 days. Bar: {view.prSizes.bar}.</p>
            {view.prSizes.prs.length === 0 && <p className="muted">No PRs merged this week.</p>}
            {view.prSizes.prs.slice(0, 12).map((p) => (
              <BarRow key={p.id} label={p.repo} sub={p.day} value={p.lines} max={Math.max(300, ...view.prSizes.prs.map((x) => x.lines))}
                barAt={view.prSizes.barLines} valueText={`${p.lines} lines`} emphasis={p.overBar} />
            ))}
          </section>

          <section className="card">
            <h3>Sprint progress <InfoLink metricId="plan_predictability" name="Plan predictability" /></h3>
            {!view.sprint && <p className="muted">No sprint is running.</p>}
            {view.sprint && (
              <>
                <p className="muted small">{view.sprint.startDay} → {view.sprint.endDay} · {view.sprint.daysLeft} days left</p>
                <BarRow label="Committed items done" sub={`${view.sprint.completed} of ${view.sprint.committed}`} value={view.sprint.percentDone}
                  max={100} barAt={view.sprint.expectedPercent} valueText={`${view.sprint.percentDone}%`} />
                <p className="muted small">Dashed line: how far through the sprint we are ({view.sprint.expectedPercent}%).</p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
