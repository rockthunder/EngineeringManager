import { Link } from 'react-router-dom';
import type { BounceView, InFlightView, StatusTimeView } from '@contract';

const CLASS_LABEL = { todo: 'queue', active: 'being worked', waiting: 'waiting', done: 'done' } as const;

/** Where finished work spent its time, status by status. Active work, waiting and queueing are coloured differently. */
export function StatusTimeChart({ rows }: { rows: readonly StatusTimeView[] }) {
  const total = rows.reduce((a, r) => a + r.meanHours, 0);
  if (total === 0) return <p className="muted small">No work items finished in this window.</p>;
  return (
    <div>
      <div className="stagebar" role="img" aria-label="Time in each status">
        {rows.map((r) => (
          <div key={r.status} className={`stage st-${r.statusClass}`} style={{ flexGrow: r.meanHours }} title={`${r.status}: ${r.meanText} per item`}>
            {r.meanHours / total > 0.1 ? r.status : ''}
          </div>
        ))}
      </div>
      <table className="plain compact">
        <thead><tr><th>Status</th><th>Per finished item</th><th>Typical when it happens</th><th>Items that went through it</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.status}>
              <td><span className={`swatch st-${r.statusClass}`} /> {r.status} <small className="muted">{CLASS_LABEL[r.statusClass]}</small></td>
              <td><strong>{r.meanText}</strong> <small className="muted">{Math.round((r.meanHours / total) * 100)}%</small></td>
              <td>{r.medianText ?? '–'}</td>
              <td>{Math.round(r.visitedShare * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Mean time per finished item, so the rows add up. “Waiting” and “queue” time is where flow is lost.</p>
    </div>
  );
}

/** How often finished work stepped backwards, and between which statuses. */
export function BouncePanel({ bounce }: { bounce: BounceView }) {
  if (bounce.items === 0) return <p className="muted small">No work items finished in this window.</p>;
  const max = Math.max(1, ...bounce.transitions.map((t) => t.count));
  return (
    <div>
      <p className="big-num">{bounce.rate === null ? '–' : `${Math.round(bounce.rate * 100)}%`} <small>of finished items bounced</small></p>
      <p className="muted small">{bounce.bouncedItems} of {bounce.items} items moved backwards at least once.</p>
      {bounce.transitions.length === 0 ? (
        <p className="muted">Nothing bounced.</p>
      ) : (
        <ul className="bounces">
          {bounce.transitions.map((t) => (
            <li key={`${t.from}${t.to}`}>
              <span>{t.from} → <strong>{t.to}</strong></span>
              <div className="track"><div className="fill" style={{ width: `${(t.count / max) * 100}%` }} /></div>
              <span className="barrow-val">{t.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What is in each column right now, and which tickets have not moved. */
export function InFlightPanel({ flight, teamLink }: { flight: InFlightView; teamLink?: string }) {
  if (flight.columns.length === 0) return <p className="muted">Nothing is in progress.</p>;
  const max = Math.max(1, ...flight.columns.map((c) => c.count));
  return (
    <div>
      <ul className="columns">
        {flight.columns.map((c) => (
          <li key={c.status} className={`column st-${c.statusClass}`}>
            <span className="col-name">{c.status}</span>
            <span className="col-count">{c.count}</span>
            <div className="col-bar"><div style={{ height: `${(c.count / max) * 100}%` }} /></div>
            <span className="muted small">typical {c.medianText ?? '–'}</span>
            <span className="muted small">oldest {c.oldestText}</span>
          </li>
        ))}
      </ul>
      <h4>Hasn’t moved in {flight.staleDays}+ days ({flight.notMoved.length})</h4>
      {flight.notMoved.length === 0 ? (
        <p className="muted small">Everything in progress has moved recently.</p>
      ) : (
        <ul className="notmoved">
          {flight.notMoved.slice(0, 8).map((n) => (
            <li key={n.key}><strong>{n.key}</strong> <span className="muted">{n.type}</span> in <em>{n.status}</em> for {n.daysText}</li>
          ))}
        </ul>
      )}
      {teamLink && flight.notMoved.length > 8 && <Link to={teamLink}>See all {flight.notMoved.length} →</Link>}
    </div>
  );
}
