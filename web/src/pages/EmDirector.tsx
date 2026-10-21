import { useQuery } from '@tanstack/react-query';
import type { EmDirectorView } from '@contract';
import { api } from '../api';
import { GridTable } from '../components/GridTable';
import { Legend } from '../components/Legend';
import { Toolbar } from '../components/Toolbar';
import { useColours } from '../components/useColours';
import { useViewParams } from '../useViewParams';

export function EmDirector() {
  const v = useViewParams();
  const q = useQuery({
    queryKey: ['em-director', v.query()],
    queryFn: () => api<EmDirectorView>(`/api/views/em-director?${v.query()}`),
    placeholderData: (prev) => prev,
  });
  const view = q.data;
  useColours(view?.colours);

  return (
    <>
      <header className="page-head">
        <h1>EM to Director</h1>
        <p className="lede">How are my teams doing against the bar? Each team’s trend is against its own previous period, not against other teams.</p>
      </header>
      <Toolbar context={view} params={v.params} onChange={v.set} showVersion />
      <div className="filters">
        <label>
          Group (EM’s teams){' '}
          <select value={view?.selectedGroup ?? ''} onChange={(e) => v.set({ group: e.target.value })}>
            {view?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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
          orgLabel="Whole organisation (for reference)"
        />
      )}
    </>
  );
}
