import { Link } from 'react-router-dom';

/** Beside every metric name: opens that metric's glossary entry. */
export function InfoLink({ metricId, name }: { metricId: string; name: string }) {
  return (
    <Link className="info" to={`/glossary#${metricId}`} aria-label={`About ${name}`} title={`About ${name}`}>
      ⓘ
    </Link>
  );
}
