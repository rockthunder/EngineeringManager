import { Link } from 'react-router-dom';
import type { CellView, TrendView } from '@contract';

const GLYPH = { improving: '▲', worsening: '▼', steady: '▶' } as const;
const RAW = { up: '↑', down: '↓', flat: '→' } as const;

export function TrendArrow({ trend }: { trend: TrendView | null }) {
  if (!trend || trend.judgement === 'unknown') return null;
  const glyph =
    trend.judgement === 'not_judged' ? (trend.arrow ? RAW[trend.arrow] : '') : GLYPH[trend.judgement];
  return (
    <span className={`trend t-${trend.judgement}`} role="img" aria-label={trend.text} title={trend.text}>
      {glyph}
    </span>
  );
}

interface Props {
  readonly cell: CellView;
  readonly to?: string;
}

/** One grid cell: value, level, a text label (so colour is never the only signal) and a trend arrow. */
export function Cell({ cell, to }: Props) {
  const body = (
    <>
      <span className="val">{cell.valueText}</span>
      <span className="det">{cell.detail}</span>
      {cell.trend?.deltaText && <span className="delta" title={cell.trend.previousText ?? undefined}>{cell.trend.deltaText} <small>vs previous</small></span>}
      <TrendArrow trend={cell.trend} />
    </>
  );
  return (
    <td className={`cell c-${cell.colour}`} title={cell.tooltip}>
      {to ? <Link to={to} className="cell-link">{body}</Link> : <div className="cell-link">{body}</div>}
    </td>
  );
}
