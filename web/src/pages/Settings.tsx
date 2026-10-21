import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { BenchmarksTab } from './settings/BenchmarksTab';
import { MappingTab } from './settings/MappingTab';
import { ProfilesTab } from './settings/ProfilesTab';
import { SourcesTab } from './settings/SourcesTab';
import { UsersTab } from './settings/UsersTab';
import { WindowsTab } from './settings/WindowsTab';

const TABS: [string, string][] = [
  ['benchmarks', 'Benchmarks and bars'], ['profiles', 'Team profiles'], ['mapping', 'Team mapping'],
  ['windows', 'Time windows and screens'], ['sources', 'Data sources'], ['users', 'Users'],
];

export function Settings() {
  return (
    <>
      <header className="page-head">
        <h1>Settings</h1>
      </header>
      <nav className="tabs" aria-label="Settings sections">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={`/settings/${path}`} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="benchmarks" replace />} />
        <Route path="benchmarks" element={<BenchmarksTab />} />
        <Route path="profiles" element={<ProfilesTab />} />
        <Route path="mapping" element={<MappingTab />} />
        <Route path="windows" element={<WindowsTab />} />
        <Route path="sources" element={<SourcesTab />} />
        <Route path="users" element={<UsersTab />} />
      </Routes>
    </>
  );
}
