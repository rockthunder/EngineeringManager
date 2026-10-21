interface Props {
  readonly label: string;
  readonly sub?: string;
  readonly value: number;
  readonly valueText: string;
  readonly max: number;
  /** Where the bar sits on the same scale, drawn as a vertical line. */
  readonly barAt?: number | null;
  readonly emphasis?: boolean;
}

/** A neutral horizontal bar with the bar drawn as a line: no red or green, as the TL view prescribes. */
export function BarRow({ label, sub, value, valueText, max, barAt, emphasis }: Props) {
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <div className={`barrow${emphasis ? ' over' : ''}`}>
      <div className="barrow-label"><strong>{label}</strong>{sub && <span className="muted small"> {sub}</span>}</div>
      <div className="track" role="img" aria-label={`${label}: ${valueText}`}>
        <div className="fill" style={{ width: pct(value) }} />
        {barAt != null && <div className="barline" style={{ left: pct(barAt) }} title="the bar" />}
      </div>
      <div className="barrow-val">{valueText}</div>
    </div>
  );
}
