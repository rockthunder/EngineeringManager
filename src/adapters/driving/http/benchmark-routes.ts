import type { FastifyInstance } from 'fastify';
import type { ViewDeps } from '../../../application/use-cases/team-benchmark';
import { getTeamBenchmark } from '../../../application/use-cases/team-benchmark';
import { getGlossary } from '../../../application/use-cases/glossary';
import { getOrgBenchmark } from '../../../application/use-cases/org-benchmark';
import { getTeamDrilldown } from '../../../application/use-cases/team-drilldown';
import { getDirectorExecs, getEmDirector, getEmTl, getEngMbr, getTlTeam } from '../../../application/use-cases/audience-views';
import { NotFoundError } from '../../../application/errors';
import type { AppDeps } from './deps';
import { flag, parseRange } from './query';

export function viewDeps(deps: AppDeps): ViewDeps {
  return {
    eventStore: deps.stores.events,
    configStore: deps.stores.config,
    settingsStore: deps.stores.settings,
    syncStore: deps.stores.sync,
    clock: deps.clock,
  };
}

export function registerBenchmarkRoutes(app: FastifyInstance, deps: AppDeps): void {
  const v = viewDeps(deps);

  app.get<{ Querystring: Record<string, string | undefined> }>('/api/benchmark/teams', async (req) => {
    const q = req.query;
    const range = parseRange(q);
    return getTeamBenchmark(v, {
      ...(range ? { range } : {}),
      compare: flag(q['compare'], true),
      version: q['version'] === 'today' ? 'today' : 'in_force',
      groupId: q['group'] ?? null,
      profileId: q['profile'] ?? null,
    });
  });

  app.get<{ Querystring: Record<string, string | undefined> }>('/api/benchmark/org', async (req) => {
    const range = parseRange(req.query);
    return getOrgBenchmark(v, {
      ...(range ? { range } : {}),
      version: req.query['version'] === 'today' ? 'today' : 'in_force',
    });
  });

  app.get<{ Params: { id: string }; Querystring: Record<string, string | undefined> }>('/api/teams/:id', async (req) => {
    const range = parseRange(req.query);
    return getTeamDrilldown(v, {
      teamId: req.params.id,
      ...(range ? { range } : {}),
      version: req.query['version'] === 'today' ? 'today' : 'in_force',
      metric: req.query['metric'] ?? null,
    });
  });

  app.get('/api/glossary', async () => getGlossary());

  app.get<{ Params: { name: string }; Querystring: Record<string, string | undefined> }>('/api/views/:name', async (req) => {
    const q = req.query;
    const range = parseRange(q);
    const version = q['version'] === 'today' ? ('today' as const) : ('in_force' as const);
    switch (req.params.name) {
      case 'eng-mbr': return getEngMbr(v, range);
      case 'director-execs': return getDirectorExecs(v);
      case 'em-director': return getEmDirector(v, { groupId: q['group'] ?? null, ...(range ? { range } : {}), version });
      case 'em-tl': return getEmTl(v, { teamId: q['team'] ?? null, ...(range ? { range } : {}), version });
      case 'tl-team': return getTlTeam(v, { teamId: q['team'] ?? null });
      default: throw new NotFoundError(`No view ${req.params.name}`);
    }
  });
}
