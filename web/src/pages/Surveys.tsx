import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CampaignView, SurveysView } from '@contract';
import { api, post } from '../api';
import { formatDay } from '../components/Toolbar';

function useSurveys() {
  return useQuery({ queryKey: ['surveys'], queryFn: () => api<SurveysView>('/api/surveys'), staleTime: 2_000 });
}

function useSurveyAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => post<SurveysView>(path, body),
    onSuccess: async (data) => {
      qc.setQueryData(['surveys'], data);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'surveys' });
    },
  });
}

const fullLink = (path: string) => `${window.location.origin}${path}`;

export function Surveys() {
  const q = useSurveys();
  const act = useSurveyAction();
  const [error, setError] = useState<string | null>(null);
  const run = async (path: string, body?: unknown) => {
    setError(null);
    try { await act.mutateAsync({ path, ...(body ? { body } : {}) }); } catch (e) { setError((e as Error).message); }
  };

  if (!q.data) return <p className="muted">Loading…</p>;
  const v = q.data;
  return (
    <>
      <header className="page-head">
        <h1>Developer experience surveys</h1>
        <p className="lede">
          Define a survey, open a campaign, and share one link per team. Answers are stored with the team and nothing else, and a team’s results
          stay hidden until at least {v.minResponses} people have answered.
        </p>
      </header>
      {error && <p className="error" role="alert">{error}</p>}

      <h2>Campaigns</h2>
      {v.campaigns.length === 0 && <p className="muted">No campaigns yet.</p>}
      <div className="stack">
        {v.campaigns.map((c) => <CampaignCard key={c.id} c={c} run={run} />)}
      </div>

      <NewCampaign v={v} run={run} />

      <h2>Surveys</h2>
      <table className="plain">
        <thead><tr><th>Survey</th><th>Questions</th><th>Status</th><th /></tr></thead>
        <tbody>
          {v.surveys.map((s) => (
            <tr key={s.id}>
              <td><strong>{s.name}</strong></td>
              <td>{s.questions.length} ({s.questions.filter((x) => x.inScore).length} in the DevEx score)</td>
              <td>{s.locked ? <span className="tag">locked: used by a campaign</span> : <span className="tag muted">editable</span>}</td>
              <td><Link to={`/surveys/builder/${s.id}`}>{s.locked ? 'View' : 'Edit'}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link to="/surveys/builder">+ Build a new survey</Link>
    </>
  );
}

function CampaignCard({ c, run }: { c: CampaignView; run: (path: string, body?: unknown) => Promise<void> }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="metric-head">
        <div>
          <h3 style={{ margin: 0 }}>{c.name}</h3>
          <p className="muted small" style={{ margin: '2px 0' }}>
            {c.surveyName} · {formatDay(c.opens)} → {formatDay(c.closes)} · {c.totalResponses} responses
          </p>
        </div>
        <div className="toolbar-group">
          <span className={`tag${c.accepting ? '' : ' muted'}`}>{c.status}{c.status === 'open' && !c.accepting ? ' (not in its dates)' : c.accepting ? ' · accepting' : ''}</span>
          {c.status === 'draft' && <button type="button" className="primary" onClick={() => run(`/api/campaigns/${c.id}/open`)}>Open campaign</button>}
          {c.status === 'open' && <button type="button" className="secondary" onClick={() => run(`/api/campaigns/${c.id}/close`)}>Close</button>}
          <Link to={`/surveys/campaigns/${c.id}`}>Results →</Link>
        </div>
      </div>
      <table className="plain">
        <thead><tr><th>Team</th><th>Responses</th><th>Share link (one per team, no login)</th></tr></thead>
        <tbody>
          {c.teams.map((t) => (
            <tr key={t.teamId}>
              <td>{t.teamName}</td>
              <td>{t.responses} of {t.headcount}</td>
              <td>
                {t.link ? (
                  <>
                    <code className="small">{fullLink(t.link)}</code>{' '}
                    <button type="button" className="link" onClick={async () => { await navigator.clipboard?.writeText(fullLink(t.link!)).catch(() => undefined); setCopied(t.teamId); }}>
                      {copied === t.teamId ? 'Copied' : 'Copy'}
                    </button>{' '}
                    <a href={t.link} target="_blank" rel="noreferrer">Open</a>
                  </>
                ) : (
                  <span className="muted">Links are created when the campaign opens</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function NewCampaign({ v, run }: { v: SurveysView; run: (path: string, body?: unknown) => Promise<void> }) {
  const [surveyId, setSurveyId] = useState(v.surveys[0]?.id ?? '');
  const [name, setName] = useState('');
  const [opens, setOpens] = useState(v.today);
  const [closes, setCloses] = useState('');
  const [teams, setTeams] = useState<string[]>(v.teams.map((t) => t.id));
  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault();
        await run('/api/campaigns', { surveyId: surveyId || v.surveys[0]?.id, name, opens, closes, teamIds: teams });
        setName('');
      }}
    >
      <h2 style={{ marginTop: 0 }}>New campaign</h2>
      <div className="toolbar">
        <label>Survey <select value={surveyId || v.surveys[0]?.id} onChange={(e) => setSurveyId(e.target.value)}>{v.surveys.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q4 pulse" /></label>
        <label>Opens <input type="date" value={opens} onChange={(e) => setOpens(e.target.value)} /></label>
        <label>Closes <input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} /></label>
      </div>
      <fieldset className="teams-pick">
        <legend>Teams included</legend>
        {v.teams.map((t) => (
          <label key={t.id} className="check">
            <input type="checkbox" checked={teams.includes(t.id)} onChange={(e) => setTeams(e.target.checked ? [...teams, t.id] : teams.filter((x) => x !== t.id))} />
            {t.name} <span className="muted small">({t.headcount})</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" className="primary" disabled={!name.trim() || !closes || teams.length === 0}>Create draft campaign</button>
      <p className="muted small">A draft can be reviewed first; links are created, and the survey locked, when you open it.</p>
    </form>
  );
}
