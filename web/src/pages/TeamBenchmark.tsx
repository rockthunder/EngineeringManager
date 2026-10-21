import { useQuery } from '@tanstack/react-query';
import type { GridView } from '@contract';
import { api } from '../api';
import { GridTable } from '../components/GridTable';
import { Legend } from '../components/Legend';
import { Toolbar } from '../components/Toolbar';
import { useColours } from '../components/useColours';
import { useViewParams } from '../useViewParams';

export function TeamBenchmark() {
  const v = useViewParams();
  const q = useQuery({
    queryKey: ['team-benchmark', v.query()],
    queryFn: () => api<GridView>(`/api/benchmark/teams?${v.query()}`),
    placeholderData: (prev) => prev,
  });
  const view = q.data;
  useColours(view?.colours);

  return (
    <>
      <header className="page-head">
        <h1>Team benchmark</h1>
        <p className="lede">
          Colour shows how far each team is from the bar, not where it ranks. Teams are listed alphabetically.
          Click any cell to see where the time goes.
        </p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showVersion />
      <div className="filters">
        <label>
          Group{' '}
          <select value={v.params.group ?? ''} onChange={(e) => v.set({ group: e.target.value || undefined })}>
            <option value="">All groups</option>
            {view?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label>
          Profile{' '}
          <select value={v.params.profile ?? ''} onChange={(e) => v.set({ profile: e.target.value || undefined })}>
            <option value="">All profiles</option>
            {view?.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {view && <Legend colourMode={view.colourMode} />}
      </div>
      {q.error && <p className="error" role="alert">{(q.error as Error).message}</p>}
      {!view && !q.error && <p className="muted">Loading…</p>}
      {view && (
        <GridTable
          view={view}
          cellLink={(teamId, metric) => `/teams/${teamId}${v.carry({ metric })}`}
          orgLink={`/org${v.carry()}`}
        />
      )}
      <p className="muted small">
        The bottom row is the whole organisation, computed from all events pooled together, not an average of team results.
      </p>
    </>
  );
}
