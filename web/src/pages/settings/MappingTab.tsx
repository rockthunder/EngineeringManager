import { useState } from 'react';
import type { TeamAdminTeam, TeamAdminView } from '@contract';
import { formatDay } from '../../components/Toolbar';
import { useAdmin, useChange } from './hooks';

const KINDS = [['repo', 'GitHub repos'], ['board', 'Jira boards'], ['service', 'JSM services']] as const;

export function MappingTab() {
  const view = useAdmin<TeamAdminView>('teams');
  const [error, setError] = useState<string | null>(null);

  if (!view.data) return <p className="muted">Loading…</p>;
  const v = view.data;
  const active = v.teams.filter((t) => !t.archived);

  return (
    <>
      <p className="lede">
        Teams own repos, boards and services. Every mapping carries an effective date, so a repo moved in a reorg counts for its
        old team before the date and its new team after. Archiving a team keeps its history.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <TeamsTable teams={v.teams} v={v} setError={setError} />
      <AddTeam v={v} setError={setError} />
      <MoveForm v={v} teams={active} setError={setError} />
      <History teams={v.teams} />
    </>
  );
}

function TeamsTable({ teams, v, setError }: { teams: readonly TeamAdminTeam[]; v: TeamAdminView; setError: (e: string | null) => void }) {
  return (
    <>
      <h2>Teams</h2>
      <table className="plain">
        <thead><tr><th>Team</th><th>Group (EM)</th><th>Profile</th><th>Headcount</th><th>Mapped to</th><th /></tr></thead>
        <tbody>
          {teams.map((t) => <TeamRow key={t.id} t={t} v={v} setError={setError} />)}
        </tbody>
      </table>
    </>
  );
}

function TeamRow({ t, v, setError }: { t: TeamAdminTeam; v: TeamAdminView; setError: (e: string | null) => void }) {
  const put = useChange<Record<string, unknown>>('PUT', `teams/${t.id}`);
  const run = async (patch: Record<string, unknown>) => {
    setError(null);
    try { await put.mutateAsync(patch); } catch (e) { setError((e as Error).message); }
  };
  const current = t.mappings.filter((m) => m.effectiveTo === null);
  return (
    <tr className={t.archived ? 'archived' : ''}>
      <td><strong>{t.name}</strong>{t.archived && <span className="tag muted"> archived</span>}</td>
      <td>
        <select aria-label={`${t.name} group`} value={t.groupId} onChange={(e) => run({ groupId: e.target.value })}>
          {v.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </td>
      <td>
        <select aria-label={`${t.name} profile`} value={t.profile} onChange={(e) => run({ profileId: e.target.value })}>
          {v.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td>
        <input aria-label={`${t.name} headcount`} className="num" type="number" min={0} defaultValue={t.headcount}
          onBlur={(e) => Number(e.target.value) !== t.headcount && run({ headcount: Number(e.target.value) })} />
      </td>
      <td className="small">{current.length === 0 ? <span className="muted">nothing</span> : current.map((m) => m.ref).join(', ')}</td>
      <td><button type="button" className="secondary" onClick={() => run({ archived: !t.archived })}>{t.archived ? 'Restore' : 'Archive'}</button></td>
    </tr>
  );
}

function AddTeam({ v, setError }: { v: TeamAdminView; setError: (e: string | null) => void }) {
  const addTeam = useChange<Record<string, unknown>>('POST', 'teams');
  const addGroup = useChange<{ name: string }>('POST', 'groups');
  const [name, setName] = useState('');
  const [profileId, setProfileId] = useState('product');
  const [groupId, setGroupId] = useState(v.groups[0]?.id ?? '');
  const [headcount, setHeadcount] = useState(5);
  const [group, setGroup] = useState('');
  return (
    <div className="two-col">
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try { await addTeam.mutateAsync({ name, profileId, groupId: groupId || v.groups[0]?.id, headcount }); setName(''); } catch (err) { setError((err as Error).message); }
        }}
      >
        <h3>Add a team</h3>
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Profile <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>{v.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Group <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>{v.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label>Headcount <input className="num" type="number" min={0} value={headcount} onChange={(e) => setHeadcount(Number(e.target.value))} /></label>
        <button type="submit" className="primary" disabled={!name.trim()}>Add team</button>
      </form>
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try { await addGroup.mutateAsync({ name: group }); setGroup(''); } catch (err) { setError((err as Error).message); }
        }}
      >
        <h3>Add a group (an EM’s set of teams)</h3>
        <label>Name <input value={group} onChange={(e) => setGroup(e.target.value)} /></label>
        <button type="submit" className="primary" disabled={!group.trim()}>Add group</button>
      </form>
    </div>
  );
}

function MoveForm({ v, teams, setError }: { v: TeamAdminView; teams: readonly TeamAdminTeam[]; setError: (e: string | null) => void }) {
  const move = useChange<Record<string, unknown>>('POST', 'mappings');
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('repo');
  const refs = v.refs[kind];
  const [ref, setRef] = useState('');
  const [toTeam, setToTeam] = useState('');
  const [from, setFrom] = useState(v.today);
  const [done, setDone] = useState<string | null>(null);
  const selected = refs.find((r) => r.ref === ref) ?? refs[0];
  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        try {
          await move.mutateAsync({ kind, ref: selected!.ref, toTeam: toTeam || teams[0]!.id, effectiveFrom: from });
          setDone(`${selected!.ref} now belongs to ${teams.find((t) => t.id === (toTeam || teams[0]!.id))?.name} from ${formatDay(from)}.`);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <h2 style={{ marginTop: 0 }}>Move or assign a repo, board or service</h2>
      <p className="muted small">Events before the date stay with the old team; events from the date count for the new team.</p>
      <div className="toolbar">
        <label>Kind <select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setRef(''); }}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>
          Item{' '}
          <select value={selected?.ref ?? ''} onChange={(e) => setRef(e.target.value)} aria-label="Item to move">
            {refs.map((r) => <option key={r.ref} value={r.ref}>{r.ref} (now: {r.owner ?? 'unmapped'})</option>)}
          </select>
        </label>
        <label>
          To team{' '}
          <select value={toTeam || teams[0]?.id} onChange={(e) => setToTeam(e.target.value)} aria-label="To team">
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>Effective from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <button type="submit" className="primary" disabled={!selected}>Move</button>
      </div>
      {done && <p className="ok" role="status">{done}</p>}
    </form>
  );
}

function History({ teams }: { teams: readonly TeamAdminTeam[] }) {
  return (
    <>
      <h2>Mapping history</h2>
      <table className="plain">
        <thead><tr><th>Team</th><th>Kind</th><th>Item</th><th>From</th><th>To</th></tr></thead>
        <tbody>
          {teams.flatMap((t) =>
            t.mappings.map((m) => (
              <tr key={`${t.id}${m.kind}${m.ref}${m.effectiveFrom}`} className={m.effectiveTo ? 'muted' : ''}>
                <td>{t.name}</td><td>{m.kind}</td><td>{m.ref}</td><td>{formatDay(m.effectiveFrom)}</td>
                <td>{m.effectiveTo ? formatDay(m.effectiveTo) : 'now'}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </>
  );
}
