import { Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { Soon } from './pages/Soon';
import { TeamBenchmark } from './pages/TeamBenchmark';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<TeamBenchmark />} />
        <Route path="*" element={<Soon title="Not found" />} />
      </Route>
    </Routes>
  );
}
