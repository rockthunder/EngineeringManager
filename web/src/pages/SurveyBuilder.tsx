import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { QuestionView, SurveysView } from '@contract';
import { api, post, put } from '../api';

const TYPES: [QuestionView['type'], string][] = [
  ['agreement', 'Agreement scale (1–5)'], ['scale10', '0–10 scale'], ['choice', 'Single choice'], ['text', 'Free text'],
];

export function SurveyBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['surveys'], queryFn: () => api<SurveysView>('/api/surveys') });
  const existing = list.data?.surveys.find((s) => s.id === id);
  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) { setName(existing.name); setQuestions([...existing.questions]); }
    else if (!id) { setName(''); setQuestions([{ id: 'q1', type: 'agreement', text: '', inScore: true, required: true, choices: [] }]); }
  }, [existing?.id, id]);

  if (!list.data) return <p className="muted">Loading…</p>;
  if (id && !existing) return <p className="error">No such survey.</p>;
  const locked = existing?.locked ?? false;

  const set = (i: number, patch: Partial<QuestionView>) => setQuestions(questions.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...questions];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setQuestions(next);
  };
  const add = () => {
    let n = questions.length + 1;
    while (questions.some((q) => q.id === `q${n}`)) n++;
    setQuestions([...questions, { id: `q${n}`, type: 'agreement', text: '', inScore: false, required: true, choices: [] }]);
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      const body = { name, questions };
      const res = id ? await put<SurveysView>(`/api/surveys/${id}`, body) : await post<SurveysView>('/api/surveys', body);
      qc.setQueryData(['surveys'], res);
      setSaved(true);
      if (!id) nav(`/surveys/builder/${res.surveys.find((s) => s.name === name.trim())?.id ?? ''}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const duplicate = async () => {
    setError(null);
    try {
      const res = await post<SurveysView>('/api/surveys', { name: `${name} (copy)`, questions });
      qc.setQueryData(['surveys'], res);
      nav(`/surveys/builder/${res.surveys.find((s) => s.name === `${name} (copy)`)?.id ?? ''}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <header className="page-head">
        <p className="small"><Link to="/surveys">← Surveys</Link></p>
        <h1>{id ? (locked ? 'Survey (locked)' : 'Edit survey') : 'Build a survey'}</h1>
        <p className="lede">
          Question types: agreement scale (1–5), 0–10 scale, single choice and free text. Tag scale questions to include them in the DevEx score.
          {locked && ' This survey has been used by an open or closed campaign, so it is locked and results stay comparable. Duplicate it to change it.'}
        </p>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card form">
        <label>Survey name <input value={name} disabled={locked} onChange={(e) => setName(e.target.value)} /></label>
        <ol className="qlist">
          {questions.map((q, i) => (
            <li key={`${q.id}-${i}`} className="qrow">
              <div className="toolbar">
                <input aria-label={`Question ${i + 1} text`} className="qtext" value={q.text} disabled={locked} placeholder="Question text" onChange={(e) => set(i, { text: e.target.value })} />
                <select aria-label={`Question ${i + 1} type`} value={q.type} disabled={locked} onChange={(e) => {
                  const type = e.target.value as QuestionView['type'];
                  set(i, { type, ...(type === 'agreement' || type === 'scale10' ? {} : { inScore: false }), ...(type === 'choice' && q.choices.length < 2 ? { choices: ['Yes', 'No'] } : {}) });
                }}>
                  {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <label className="check"><input type="checkbox" checked={q.inScore} disabled={locked || (q.type !== 'agreement' && q.type !== 'scale10')} onChange={(e) => set(i, { inScore: e.target.checked })} />In DevEx score</label>
                <label className="check"><input type="checkbox" checked={q.required} disabled={locked} onChange={(e) => set(i, { required: e.target.checked })} />Required</label>
                {!locked && (
                  <>
                    <button type="button" className="secondary" aria-label={`Move question ${i + 1} up`} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="secondary" aria-label={`Move question ${i + 1} down`} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="secondary danger" aria-label={`Delete question ${i + 1}`} onClick={() => setQuestions(questions.filter((_, k) => k !== i))}>Delete</button>
                  </>
                )}
              </div>
              {q.type === 'choice' && (
                <label>Choices (one per line)
                  <textarea disabled={locked} value={q.choices.join('\n')} onChange={(e) => set(i, { choices: e.target.value.split('\n') })} />
                </label>
              )}
            </li>
          ))}
        </ol>
        {!locked && <button type="button" className="secondary" onClick={add}>+ Add a question</button>}
        <div className="toolbar">
          {!locked && <button type="button" className="primary" onClick={save}>Save survey</button>}
          {existing && <button type="button" className="secondary" onClick={duplicate}>Duplicate as a new survey</button>}
          {saved && <span className="ok" role="status">Saved.</span>}
        </div>
      </div>
    </>
  );
}
