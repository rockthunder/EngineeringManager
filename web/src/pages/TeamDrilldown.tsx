import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DrilldownView } from '@contract';
import { api } from '../api';
import { Histogram, MixBar, StageBar } from '../charts/Bars';
import { LineChart } from '../charts/LineChart';
import { BouncePanel, InFlightPanel, StatusTimeChart } from '../charts/Flow';
import { Scatter } from '../charts/Scatter';
import { HeadlineStrip, StatTiles } from '../components/Headline';
import { TrendArrow } from '../components/Cell';
import { InfoLink } from '../components/InfoLink';
import { Legend } from '../components/Legend';
import { Toolbar } from '../components/Toolbar';
import { useColours } from '../components/useColours';
import { useViewParams } from '../useViewParams';
import { useSearchParams } from 'react-router-dom';

export function TeamDrilldown() {
  const { teamId = '' } = useParams();
  const v = useViewParams();
  const [sp] = useSearchParams();
  const focus = sp.get('metric');
  const q = useQuery({
    queryKey: ['team', teamId, v.query()],
    queryFn: () => api<DrilldownView>(`/api/teams/${teamId}?${v.query(focus ? { metric: focus } : {})}`),
    placeholderData: (prev) => prev,
  });
  const view = q.data;
  useColours(view?.colours);

  useEffect(() => {
    if (view && focus) document.getElementById(`m-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [view?.team.id, focus]);

  if (q.error) return <p className="error" role="alert">{(q.error as Error).message}</p>;
  if (!view) return <p className="muted">Loading…</p>;

  return (
    <>
      <header className="page-head">
        <p className="small"><Link to={`/${v.carry()}`}>← Team benchmark</Link></p>
        <h1>{view.team.name}</h1>
        <p className="lede">
          {view.team.profile === 'platform' ? 'Platform' : 'Product'} team · {view.team.headcount} engineers ·
          where does the time go? Start with the breakdowns, then each metric against its bar.
        </p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showVersion />

      <h2>Headline: {view.team.name} against the bar</h2>
      <Legend colourMode={view.colourMode} />
      <HeadlineStrip items={view.metrics.map((m) => ({ header: m.header, cell: m.cell }))} to={(id) => `/teams/${view.team.id}${v.carry({ metric: id })}`} />

      <h2>The numbers</h2>
      <StatTiles stats={view.insights.stats} windowDays={view.insights.windowDays} />

      <h2>Where does the time go? <span className="muted small">last {view.windowDays} days</span></h2>
      <div className="cards">
        <section className="card wide">
          <h3>Time in each status <InfoLink metricId="work_item_cycle_time" name="Work item cycle time" /></h3>
          <StatusTimeChart rows={view.insights.statusTimes} />
        </section>
        <section className="card">
          <h3>Where tickets bounce <InfoLink metricId="ticket_bounce_rate" name="Ticket bounce rate" /></h3>
          <BouncePanel bounce={view.insights.bounce} />
        </section>
        <section className="card">
          <h3>In each column right now</h3>
          <InFlightPanel flight={view.insights.inFlight} teamLink={`/views/tl-team?team=${view.team.id}`} />
        </section>
        <section className="card">
          <h3>Lead time by stage <InfoLink metricId="lead_time" name="Lead time for changes" /></h3>
          <StageBar stages={view.breakdowns.leadTimeStages} />
        </section>
        <section className="card">
          <h3>PR size distribution <InfoLink metricId="pr_size" name="PR size" /></h3>
          <Histogram buckets={view.breakdowns.prSize} />
          <p className="muted small">Lines changed per merged PR.</p>
        </section>
        <section className="card">
          <h3>Cycle time of finished work <InfoLink metricId="work_item_cycle_time" name="Work item cycle time" /></h3>
          <Scatter points={view.breakdowns.cycleTime} />
        </section>
        <section className="card">
          <h3>Where the effort went <InfoLink metricId="new_capability_share" name="New capability share" /></h3>
          <MixBar mix={view.breakdowns.investment} />
        </section>
      </div>

      <h2>Every metric against the bar</h2>
      <div className="filters"><Legend colourMode={view.colourMode} /></div>
      <div className="cards metrics">
        {view.metrics.map((m) => (
          <section key={m.header.id} id={`m-${m.header.id}`} className={`card metric-card${focus === m.header.id ? ' focus' : ''}`}>
            <div className="metric-head">
              <h3>{m.header.name} <InfoLink metricId={m.header.id} name={m.header.name} /></h3>
              <div className={`pill c-${m.cell.colour}`} title={m.cell.tooltip}>
                <strong>{m.cell.valueText}</strong> <TrendArrow trend={m.cell.trend} />
                <span className="small">{m.cell.detail}</span>
              </div>
            </div>
            <p className="muted small">
              {m.cell.tooltip}
              {m.counterpart && <> · Read with <Link to={`/teams/${view.team.id}${v.carry({ metric: m.counterpart.id })}`}>{m.counterpart.name}</Link></>}
            </p>
            <LineChart points={m.series} bar={m.bar} />
            <p className="annot muted small">Annotations on this chart: coming soon</p>
          </section>
        ))}
      </div>
    </>
  );
}
