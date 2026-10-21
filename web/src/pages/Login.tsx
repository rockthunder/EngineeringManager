import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Me } from '@contract';
import { post } from '../api';

export function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await post<Me>('/api/login', { username, password });
      qc.setQueryData(['me'], me);
      nav('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>Engineering Excellence</h1>
        <p className="statement">
          This dashboard shows how far each <strong>team</strong> is from the bar, so a gap starts a conversation about help.
          It never measures, stores or shows anything about an individual.
        </p>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !password}>Sign in</button>
        <p className="muted small">Dummy-data build: sign in as <code>admin</code> / <code>admin</code>.</p>
      </form>
    </div>
  );
}
