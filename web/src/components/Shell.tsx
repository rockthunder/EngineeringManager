import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Me } from '@contract';
import { ApiError, api, post } from '../api';

const NAV: { title: string; links: [string, string][] }[] = [
  { title: 'Benchmarks', links: [['/', 'Team benchmark'], ['/org', 'Org benchmark']] },
  {
    title: 'Audience views',
    links: [
      ['/views/eng-mbr', 'Eng MBR'], ['/views/director-execs', 'Director to Execs'], ['/views/em-director', 'EM to Director'],
      ['/views/em-tl', 'EM to TL'], ['/views/tl-team', 'TL to Team'],
    ],
  },
  { title: 'Surveys', links: [['/surveys', 'Developer experience']] },
  { title: 'Reference', links: [['/glossary', 'Glossary']] },
  { title: 'Admin', links: [['/settings', 'Settings']] },
];

export function Shell() {
  const qc = useQueryClient();
  const loc = useLocation();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), retry: false });

  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!me.data) return <div className="center muted">Loading…</div>;

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">Engineering<br />Excellence</div>
        {NAV.map((g) => (
          <div key={g.title} className="nav-group">
            <h2>{g.title}</h2>
            {g.links.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="nav-foot">
          <div className="muted">Signed in as {me.data.user.username}</div>
          <button
            type="button"
            className="link"
            onClick={async () => {
              await post('/api/logout');
              qc.clear();
              window.location.assign('/login');
            }}
          >
            Sign out
          </button>
          <p className="muted small">Team level only. Nothing here is measured per person.</p>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
