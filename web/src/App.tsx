import { Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Glossary } from './pages/Glossary';
import { Login } from './pages/Login';
import { OrgBenchmark } from './pages/OrgBenchmark';
import { TeamDrilldown } from './pages/TeamDrilldown';
import { Soon } from './pages/Soon';
import { TeamBenchmark } from './pages/TeamBenchmark';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<TeamBenchmark />} />
        <Route path="org" element={<OrgBenchmark />} />
        <Route path="teams/:teamId" element={<TeamDrilldown />} />
        <Route path="glossary" element={<Glossary />} />
        <Route path="*" element={<Soon title="Not found" />} />
      </Route>
    </Routes>
  );
}
