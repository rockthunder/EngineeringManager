import type { BenchmarkConfigView, TeamAdminView } from '@contract';
import { Link } from 'react-router-dom';
import { useAdmin } from './hooks';

export function ProfilesTab() {
  const cfg = useAdmin<BenchmarkConfigView>('benchmarks');
  const teams = useAdmin<TeamAdminView>('teams');
  if (!cfg.data || !teams.data) return <p className="muted">Loading…</p>;
  return (
    <>
      <p className="lede">
        Thresholds can differ by team type. Product is the default; Platform overrides only what differs and inherits the rest.
        Assign a profile to each team in <Link to="/settings/mapping">Team mapping</Link>; edit thresholds in <Link to="/settings/benchmarks">Benchmarks and bars</Link>.
      </p>
      <div className="cards">
        {cfg.data.profiles.map((p) => {
          const overrides = cfg.data!.metrics.filter((m) => m.overridden[p.id]);
          const members = teams.data!.teams.filter((t) => t.profile === p.id && !t.archived);
          return (
            <section key={p.id} className="card">
              <h2 style={{ marginTop: 0 }}>{p.name}</h2>
              <h3>Teams ({members.length})</h3>
              <p>{members.length ? members.map((t) => t.name).join(', ') : 'No teams'}</p>
              <h3>Thresholds that differ from Product</h3>
              {p.id === 'product' ? (
                <p className="muted">This is the base profile.</p>
              ) : overrides.length === 0 ? (
                <p className="muted">None: inherits Product.</p>
              ) : (
                <ul>
                  {overrides.map((m) => (
                    <li key={m.id}><strong>{m.name}</strong>: Elite {m.text[p.id]!.elite}, High {m.text[p.id]!.high}, Medium {m.text[p.id]!.medium}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
