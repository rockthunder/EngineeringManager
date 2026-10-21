import type { GridView } from '@contract';

/** The colour key, drawn from the colours in Settings. */
export function Legend({ colourMode }: { colourMode: GridView['colourMode'] }) {
  const items =
    colourMode === 'level'
      ? [['blue', 'Elite'], ['green', 'High'], ['amber', 'Medium'], ['red', 'Low'], ['grey', 'Not enough data']]
      : [['blue', 'Above bar'], ['green', 'At bar'], ['amber', 'Near bar (1 level below)'], ['red', 'Below bar (2+ levels)'], ['grey', 'Not enough data']];
  return (
    <ul className="legend" aria-label="Colour key">
      {items.map(([c, label]) => (
        <li key={c}><span className={`swatch c-${c}`} /> {label}</li>
      ))}
    </ul>
  );
}
