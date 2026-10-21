import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { CampaignResultsView, QuestionResultView, ResultBlockView } from '@contract';
import { api } from '../api';
import { formatDay } from '../components/Toolbar';

function QuestionRow({ q }: { q: QuestionResultView }) {
  const max = q.type === 'agreement' ? 5 : 10;
  const peak = Math.max(1, ...q.distribution.map((d) => d.count));
  return (
    <li className="qres">
      <div className="qres-head"><span>{q.text}</span>{q.mean !== null && <strong>{q.mean.toFixed(1)}</strong>}</div>
      {q.mean !== null && (
        <div className="track" role="img" aria-label={`${q.text}: average ${q.mean.toFixed(1)} of ${max}`}>
          <div className="fill" style={{ width: `${((q.mean - (q.type === 'agreement' ? 1 : 0)) / (q.type === 'agreement' ? 4 : 10)) * 100}%` }} />
        </div>
      )}
      <div className="mini-histo">
        {q.distribution.map((d) => <span key={d.label} title={`${d.label}: ${d.count}`} style={{ height: `${(d.count / peak) * 100}%` }} />)}
      </div>
    </li>
  );
}

function Block({ title, sub, b, hiddenText }: { title: string; sub?: string | undefined; b: ResultBlockView; hiddenText?: string | null }) {
  if (hiddenText) {
    return (
      <section className="card hidden-card">
        <h3>{title}</h3>
        <p className="muted">{hiddenText}</p>
        <p className="muted small">{b.responses} response{b.responses === 1 ? '' : 's'} so far.</p>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="metric-head">
        <div><h3 style={{ margin: 0 }}>{title}</h3>{sub && <p className="muted small" style={{ margin: 0 }}>{sub}</p>}</div>
        <div className="pill c-none"><strong>{b.devex === null ? '–' : Math.round(b.devex)}</strong><span className="small">DevEx score · {b.responses} responses</span></div>
      </div>
      <ul className="qres-list">{b.questions.map((q) => <QuestionRow key={q.questionId} q={q} />)}</ul>
      {b.texts.length > 0 && (
        <>
          <h3>In their words <span className="muted small">(random order)</span></h3>
          <ul>{b.texts.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </>
      )}
    </section>
  );
}

export function SurveyResults() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['survey-results', id], queryFn: () => api<CampaignResultsView>(`/api/campaigns/${id}/results`) });
  if (q.error) return <p className="error" role="alert">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="muted">Loading…</p>;
  const r = q.data;
  const c = r.campaign;
  return (
    <>
      <header className="page-head">
        <p className="small"><Link to="/surveys">← Surveys</Link></p>
        <h1>{c.name}</h1>
        <p className="lede">
          {c.surveyName} · {formatDay(c.opens)} → {formatDay(c.closes)} · {c.status}. Results for a team appear only at {r.minResponses} or more responses.
          A smaller team appears only inside its group, and its responses still count towards group and organisation results.
        </p>
      </header>

      <h2>Organisation</h2>
      <Block title="Whole organisation" b={r.org} hiddenText={r.org.devex === null ? `Fewer than ${r.minResponses} responses` : null} />

      <h2>Groups</h2>
      <div className="cards">
        {r.groups.map((g) => (
          <Block key={g.groupId} title={g.groupName} sub={g.includesHiddenTeams ? 'Includes responses from teams too small to show on their own' : undefined}
            b={g} hiddenText={g.visible ? null : `Fewer than ${r.minResponses} responses across the group`} />
        ))}
      </div>

      <h2>Teams</h2>
      <p className="muted small">Each question is shown on its own: that is where the useful conversation is.</p>
      <div className="cards">
        {r.teams.map((t) => (
          <Block key={t.teamId} title={t.teamName}
            sub={t.visible && t.responseRate !== null ? `${Math.round(t.responseRate * 100)}% response rate (${t.responses} of ${t.headcount})` : undefined}
            b={t} hiddenText={t.visible ? null : t.hiddenReason} />
        ))}
      </div>
    </>
  );
}
