import type { FastifyInstance } from 'fastify';
import type { ViewDeps } from '../../../application/use-cases/team-benchmark';
import { getTeamBenchmark } from '../../../application/use-cases/team-benchmark';
import { getGlossary } from '../../../application/use-cases/glossary';
import { getOrgBenchmark } from '../../../application/use-cases/org-benchmark';
import { getTeamDrilldown } from '../../../application/use-cases/team-drilldown';
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
}
