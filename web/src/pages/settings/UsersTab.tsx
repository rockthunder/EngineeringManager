import { useState } from 'react';
import { useAdmin, useChange } from './hooks';

export function UsersTab() {
  const q = useAdmin<{ users: { username: string; role: string }[] }>('users');
  const change = useChange<{ current: string; next: string }>('POST', 'account/password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <p className="lede">v1 has a single admin. The user model allows roles later; Auth0 or another provider plugs in behind the same login port.</p>
      <table className="plain">
        <thead><tr><th>User</th><th>Role</th></tr></thead>
        <tbody>{q.data?.users.map((u) => <tr key={u.username}><td>{u.username}</td><td>{u.role}</td></tr>)}</tbody>
      </table>
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await change.mutateAsync({ current, next });
            setCurrent('');
            setNext('');
            setMsg({ ok: true, text: 'Password changed.' });
          } catch (err) {
            setMsg({ ok: false, text: (err as Error).message });
          }
        }}
      >
        <h3>Change password</h3>
        <label>Current password <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
        <label>New password (8+ characters) <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
        <button type="submit" className="primary" disabled={!current || next.length < 8}>Change password</button>
        {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
      </form>
    </>
  );
}
