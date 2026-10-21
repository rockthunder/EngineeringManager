import type { CellView, GridView, MetricHeader } from '@contract';
import { Cell } from './Cell';
import { InfoLink } from './InfoLink';

const GROUPS: Record<MetricHeader['group'], string> = {
  speed_flow: 'Speed and flow',
  stability_quality: 'Stability and quality',
  investment: 'Investment',
  developer_experience: 'Developer experience',
};

interface Props {
  readonly view: Pick<GridView, 'metrics' | 'rows' | 'org'>;
  readonly cellLink: (teamId: string, metricId: string) => string;
  readonly orgLink?: string;
  readonly orgLabel?: string;
}

/** Teams × metrics, rows by name, org row at the foot. Pairs (speed beside stability) sit in the same group bands. */
export function GridTable({ view, cellLink, orgLink, orgLabel = 'Whole organisation' }: Props) {
  const groups: { group: MetricHeader['group']; span: number }[] = [];
  for (const m of view.metrics) {
    const last = groups[groups.length - 1];
    if (last?.group === m.group) last.span++;
    else groups.push({ group: m.group, span: 1 });
  }
  const orgCells = view.org.cells;
  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead>
          <tr>
            <th rowSpan={2} className="sticky">Team</th>
            {groups.map((g) => (
              <th key={g.group} colSpan={g.span} className="group">{GROUPS[g.group]}</th>
            ))}
          </tr>
          <tr>
            {view.metrics.map((m) => (
              <th key={m.id} className="metric">
                <span>{m.name}</span> <InfoLink metricId={m.id} name={m.name} />
                <small>{m.unitLabel} · {m.windowDays}d</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.teamId}>
              <th scope="row" className="sticky team">
                {r.teamName}
                {r.profile === 'platform' && <small>Platform</small>}
              </th>
              {r.cells.map((c: CellView) => (
                <Cell key={c.metricId} cell={c} to={cellLink(r.teamId, c.metricId)} />
              ))}
            </tr>
          ))}
          <tr className="org">
            <th scope="row" className="sticky team">{orgLabel}</th>
            {orgCells.map((c) => (
              <Cell key={c.metricId} cell={c} {...(orgLink ? { to: orgLink } : {})} />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
