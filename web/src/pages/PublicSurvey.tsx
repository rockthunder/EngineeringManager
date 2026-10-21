import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicSurveyView, QuestionView } from '@contract';
import { api, post } from '../api';

const AGREE = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

function Field({ q, value, onChange }: { q: QuestionView; value: string | number | undefined; onChange: (v: string | number) => void }) {
  if (q.type === 'agreement') {
    return (
      <div className="scale" role="radiogroup" aria-label={q.text}>
        {AGREE.map((label, i) => (
          <label key={label} className={`opt${value === i + 1 ? ' on' : ''}`}>
            <input type="radio" name={q.id} checked={value === i + 1} onChange={() => onChange(i + 1)} /> {i + 1}
            <small>{label}</small>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === 'scale10') {
    return (
      <div className="scale ten" role="radiogroup" aria-label={q.text}>
        {Array.from({ length: 11 }, (_, i) => (
          <label key={i} className={`opt${value === i ? ' on' : ''}`}>
            <input type="radio" name={q.id} checked={value === i} onChange={() => onChange(i)} /> {i}
          </label>
        ))}
      </div>
    );
  }
  if (q.type === 'choice') {
    return (
      <div role="radiogroup" aria-label={q.text}>
        {q.choices.map((c) => (
          <label key={c} className="check"><input type="radio" name={q.id} checked={value === c} onChange={() => onChange(c)} /> {c}</label>
        ))}
      </div>
    );
  }
  return <textarea aria-label={q.text} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={2000} />;
}

/** The page a respondent reaches from their team's link: no login, no team picker, no identity collected. */
export function PublicSurvey() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['public-survey', token], queryFn: () => api<PublicSurveyView>(`/api/s/${token}`), retry: false });
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [done, setDone] = useState(false);
  const [again, setAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.error) return <div className="center"><div className="card login"><h1>Survey</h1><p className="error">{(q.error as Error).message}</p></div></div>;
  if (!q.data) return <div className="center muted">Loading…</div>;
  const v = q.data;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/api/s/${token}`, { answers });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public">
      <div className="card public-card">
        <h1>{v.surveyName}</h1>
        <p className="lede">{v.campaignName} · for the <strong>{v.teamName}</strong> team</p>
        <p className="statement">{v.privacyNote}</p>
        {done ? (
          <p className="ok" role="status"><strong>Thank you.</strong> Your answers were recorded for your team, anonymously.</p>
        ) : !v.accepting ? (
          <p className="error" role="status">This survey is not taking responses right now (it closes on {v.closesOn}).</p>
        ) : v.alreadySubmitted && !again ? (
          <p role="status">
            This browser has already submitted an answer. <button type="button" className="link" onClick={() => setAgain(true)}>Answer again anyway</button>
            <span className="muted small"> (We can’t stop you, and we don’t track who you are.)</span>
          </p>
        ) : (
          <form className="form" onSubmit={submit}>
            {v.questions.map((qn, i) => (
              <fieldset key={qn.id} className="question">
                <legend>{i + 1}. {qn.text}{qn.required ? '' : ' (optional)'}</legend>
                <Field q={qn} value={answers[qn.id]} onChange={(val) => setAnswers({ ...answers, [qn.id]: val })} />
              </fieldset>
            ))}
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="primary" disabled={busy}>Submit anonymously</button>
          </form>
        )}
      </div>
    </div>
  );
}
