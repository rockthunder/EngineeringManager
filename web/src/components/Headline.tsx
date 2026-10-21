import { Link } from 'react-router-dom';
import type { HeadlineItem, StatView } from '@contract';
import { TrendArrow } from './Cell';
import { InfoLink } from './InfoLink';

/**
 * The team's metrics at a glance, each colour coded against the bar with its value, level and
 * how far it moved since the previous period. Click a chip for the breakdown behind it.
 */
export function HeadlineStrip({ items, to }: { items: readonly HeadlineItem[]; to?: (metricId: string) => string }) {
  return (
    <ul className="headline" aria-label="Team metrics against the bar">
      {items.map(({ header, cell }) => {
        const body = (
          <>
            <span className="h-name">{header.name}</span>
            <span className="h-val">{cell.valueText} <TrendArrow trend={cell.trend} /></span>
            <span className="h-det">{cell.detail}</span>
            {cell.trend?.deltaText && (
              <span className="h-delta" title={cell.trend.previousText ?? undefined}>{cell.trend.deltaText} <small>vs previous</small></span>
            )}
          </>
        );
        return (
          <li key={header.id} className={`chip-card c-${cell.colour}`} title={cell.tooltip}>
            {to ? <Link to={to(header.id)}>{body}</Link> : <div>{body}</div>}
            <span className="h-info"><InfoLink metricId={header.id} name={header.name} /></span>
          </li>
        );
      })}
    </ul>
  );
}

/** The plain numbers behind the metrics: the current figure and how it moved from the previous period. */
export function StatTiles({ stats, windowDays }: { stats: readonly StatView[]; windowDays: number }) {
  return (
    <div>
      <ul className="stats">
        {stats.map((s) => (
          <li key={s.key} className="stat">
            <span className="stat-label">{s.label}</span>
            <span className="stat-val">{s.current}</span>
            <span className={`stat-delta d-${s.direction}`} title={s.previousText}>
              {s.direction === 'up' ? '▲' : s.direction === 'down' ? '▼' : '▶'} {s.deltaText} <small>({s.previousText})</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">Last {windowDays} days, compared with the {windowDays} days before.</p>
    </div>
  );
}
