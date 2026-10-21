import { useSearchParams } from 'react-router-dom';

/** The selected team for team-scoped views, kept in the URL. */
export function useTeamParam() {
  const [sp, setSp] = useSearchParams();
  return {
    team: sp.get('team') ?? undefined,
    setTeam: (id: string) => {
      const next = new URLSearchParams(sp);
      next.set('team', id);
      setSp(next);
    },
  };
}
