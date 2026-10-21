import type { CellView } from './contract';

const WORDS = ['no levels', 'one level', 'two levels', 'three levels'];

function barPhrase(distance: number): string {
  if (distance === 0) return 'at the bar';
  const n = WORDS[Math.min(3, Math.abs(distance))]!;
  return distance > 0 ? 'above the bar' : `${n} below the bar`;
}

/** One plain-English sentence about a headline measure: its value, its movement on last quarter, and where it stands. */
export function execSentence(name: string, cell: CellView): string {
  if (cell.status !== 'graded') return `${name} does not have enough data yet to be graded.`;
  const t = cell.trend;
  const move =
    !t || t.judgement === 'unknown' || t.judgement === 'not_judged' ? ''
    : t.judgement === 'steady' ? ', steady on last quarter'
    : `, ${t.judgement === 'improving' ? 'improving' : 'getting worse'} (${t.deltaText} on last quarter)`;
  return `${name} is ${cell.valueText}${move}, and ${barPhrase(cell.distance ?? 0)}.`;
}

export interface SummaryItem {
  readonly name: string;
  readonly cell: CellView;
  readonly atOrAbove: { readonly atOrAbove: number; readonly graded: number } | null;
}

export interface ExecSummary {
  readonly sentences: string[];
  readonly counts: { graded: number; atOrAbove: number; improved: number; worsened: number };
}

/** The paragraph at the top of the exec view, written from the headline figures. */
export function execSummary(items: readonly SummaryItem[]): ExecSummary {
  const graded = items.filter((i) => i.cell.status === 'graded');
  const atOrAbove = graded.filter((i) => (i.cell.distance ?? 0) >= 0).length;
  const improved = graded.filter((i) => i.cell.trend?.judgement === 'improving').length;
  const worsened = graded.filter((i) => i.cell.trend?.judgement === 'worsening').length;
  const sentences = [
    `${atOrAbove} of ${graded.length} headline measures are at or above the bar; ${improved} improved on last quarter and ${worsened} got worse.`,
  ];

  const gain = graded
    .filter((i) => i.cell.trend?.judgement === 'improving')
    .sort((a, b) => Math.abs(b.cell.trend?.relativeChange ?? 0) - Math.abs(a.cell.trend?.relativeChange ?? 0))[0];
  if (gain) sentences.push(`Biggest improvement: ${gain.name} (${gain.cell.trend!.deltaText}).`);

  const furthest = graded.filter((i) => (i.cell.distance ?? 0) < 0).sort((a, b) => (a.cell.distance ?? 0) - (b.cell.distance ?? 0))[0];
  if (furthest) {
    const n = WORDS[Math.min(3, Math.abs(furthest.cell.distance ?? 0))]!;
    sentences.push(`Furthest from the bar: ${furthest.name} (${n} below).`);
  }

  const fewest = items
    .filter((i) => i.atOrAbove && i.atOrAbove.graded > 0 && i.atOrAbove.atOrAbove < i.atOrAbove.graded)
    .sort((a, b) => a.atOrAbove!.atOrAbove / a.atOrAbove!.graded - b.atOrAbove!.atOrAbove / b.atOrAbove!.graded)[0];
  if (fewest) {
    sentences.push(`Fewest teams at the bar: ${fewest.name} (${fewest.atOrAbove!.atOrAbove} of ${fewest.atOrAbove!.graded}). Counts only; no team is named.`);
  }
  return { sentences, counts: { graded: graded.length, atOrAbove, improved, worsened } };
}
