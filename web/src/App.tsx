import { Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { DirectorExecs } from './pages/DirectorExecs';
import { EmDirector } from './pages/EmDirector';
import { EmTl } from './pages/EmTl';
import { EngMbr } from './pages/EngMbr';
import { Glossary } from './pages/Glossary';
import { Login } from './pages/Login';
import { OrgBenchmark } from './pages/OrgBenchmark';
import { TeamDrilldown } from './pages/TeamDrilldown';
import { TlTeam } from './pages/TlTeam';
import { Settings } from './pages/Settings';
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
        <Route path="views/eng-mbr" element={<EngMbr />} />
        <Route path="views/director-execs" element={<DirectorExecs />} />
        <Route path="views/em-director" element={<EmDirector />} />
        <Route path="views/em-tl" element={<EmTl />} />
        <Route path="views/tl-team" element={<TlTeam />} />
        <Route path="settings/*" element={<Settings />} />
        <Route path="glossary" element={<Glossary />} />
        <Route path="*" element={<Soon title="Not found" />} />
      </Route>
    </Routes>
  );
}
