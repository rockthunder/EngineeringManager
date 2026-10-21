interface StageProps {
  readonly stages: readonly { stage: string; label: string; medianHours: number | null; text: string; sampleSize: number }[];
}

/** Lead time split into where the time goes: one stacked bar, widths in proportion to the median hours. */
export function StageBar({ stages }: StageProps) {
  const total = stages.reduce((a, s) => a + (s.medianHours ?? 0), 0);
  if (total === 0) return <p className="muted small">No changes shipped in this window.</p>;
  return (
    <div>
      <div className="stagebar" role="img" aria-label="Lead time by stage">
        {stages.map((s) =>
          s.medianHours ? (
            <div key={s.stage} className={`stage s-${s.stage}`} style={{ flexGrow: s.medianHours }} title={`${s.label}: ${s.text}`}>
              {s.medianHours / total > 0.12 ? s.label : ''}
            </div>
          ) : null,
        )}
      </div>
      <ul className="stagelist">
        {stages.map((s) => (
          <li key={s.stage}><span className={`swatch s-${s.stage}`} /> <strong>{s.label}</strong> {s.text}</li>
        ))}
      </ul>
      <p className="muted small">
        Medians for each stage over {stages[0]?.sampleSize ?? 0} changes. Stage medians don’t add up exactly to the overall median.
      </p>
    </div>
  );
}

export function Histogram({ buckets }: { readonly buckets: readonly { label: string; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="histo" role="img" aria-label="Distribution">
      {buckets.map((b) => (
        <div key={b.label} className="histo-col" title={`${b.label}: ${b.count}`}>
          <span className="histo-n">{b.count}</span>
          <div className="histo-bar" style={{ height: `${(b.count / max) * 100}%` }} />
          <span className="histo-l">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

const MIX_CLASS: Record<string, string> = { new_capability: 'm-new', maintenance: 'm-maint', defect: 'm-defect', tech_debt: 'm-debt' };

export function MixBar({ mix }: { readonly mix: readonly { category: string; label: string; count: number; share: number }[] }) {
  const total = mix.reduce((a, m) => a + m.count, 0);
  if (total === 0) return <p className="muted small">No work items finished in this window.</p>;
  return (
    <div>
      <div className="stagebar" role="img" aria-label="Investment mix">
        {mix.map((m) => (m.count ? <div key={m.category} className={`stage ${MIX_CLASS[m.category]}`} style={{ flexGrow: m.count }} title={`${m.label}: ${m.count}`} /> : null))}
      </div>
      <ul className="stagelist">
        {mix.map((m) => (
          <li key={m.category}><span className={`swatch ${MIX_CLASS[m.category]}`} /> <strong>{m.label}</strong> {Math.round(m.share * 100)}% ({m.count})</li>
        ))}
      </ul>
    </div>
  );
}
