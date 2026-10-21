import type { FastifyInstance } from 'fastify';
import { ValidationError } from '../../../application/errors';
import { loadSettings, updateSettings, type AppSettings } from '../../../application/settings';
import { getBenchmarkConfig, publishBenchmarkVersion } from '../../../application/use-cases/benchmark-admin';
import { getDataSources, updateDefinitions } from '../../../application/use-cases/data-sources';
import { runSyncNow } from '../../../application/use-cases/run-sync-now';
import { addGroup, addTeam, editTeam, getTeamAdmin, moveTeamMapping } from '../../../application/use-cases/team-admin';
import type { BenchmarkChange } from '../../../domain/benchmarks/version';
import type { SourceDefinitions } from '../../../domain/events/definitions';
import type { MappingKind, ProfileId } from '../../../domain/teams/types';
import type { SettingsView } from '../../../application/views/contract';
import type { AppDeps } from './deps';

const SETTING_KEYS = ['defaultRange', 'screenDefaults', 'colourMode', 'colours', 'pollEveryHours', 'backfillDays', 'surveyMinResponses'] as const;

type Body = Record<string, unknown>;

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): void {
  const stores = deps.stores;
  const admin = { configStore: stores.config, eventStore: stores.events, clock: deps.clock };
  const sources = () => ({ configStore: stores.config, settingsStore: stores.settings, syncStore: stores.sync, clock: deps.clock });
  const sim = () => ({ simulated: Boolean(deps.sync?.advance), watermarkDay: deps.sync?.watermarkDay?.() ?? null });
  const asSettings = (s: AppSettings): SettingsView => ({ ...s, screenDefaults: s.screenDefaults as SettingsView['screenDefaults'] });

  // ── Settings: windows, colours, polling, survey minimum
  app.get('/api/admin/settings', async () => asSettings(await loadSettings(stores.settings)));
  app.put<{ Body: Body }>('/api/admin/settings', async (req) => {
    const patch: Record<string, unknown> = {};
    for (const k of SETTING_KEYS) if (req.body && k in req.body) patch[k] = req.body[k];
    return asSettings(await updateSettings(stores.settings, patch as Partial<AppSettings>));
  });

  // ── Benchmarks and bars: every change publishes a new immutable version
  app.get('/api/admin/benchmarks', async () => getBenchmarkConfig({ configStore: stores.config, clock: deps.clock }));
  app.post<{ Body: { change?: BenchmarkChange; effectiveFrom?: string } }>('/api/admin/benchmarks/versions', async (req) =>
    publishBenchmarkVersion(
      { configStore: stores.config, clock: deps.clock },
      { change: req.body?.change ?? {}, ...(req.body?.effectiveFrom ? { effectiveFrom: req.body.effectiveFrom } : {}) },
    ),
  );

  // ── Teams, groups, profiles and effective-dated mappings
  app.get('/api/admin/teams', async () => getTeamAdmin(admin));
  app.post<{ Body: Body }>('/api/admin/teams', async (req) =>
    addTeam(admin, {
      name: String(req.body?.['name'] ?? ''), profileId: req.body?.['profileId'] as ProfileId,
      groupId: String(req.body?.['groupId'] ?? ''), headcount: Number(req.body?.['headcount'] ?? 0),
    }),
  );
  app.put<{ Params: { id: string }; Body: Body }>('/api/admin/teams/:id', async (req) => {
    const b = req.body ?? {};
    return editTeam(admin, req.params.id, {
      ...(typeof b['name'] === 'string' ? { name: b['name'] } : {}),
      ...(typeof b['profileId'] === 'string' ? { profileId: b['profileId'] as ProfileId } : {}),
      ...(typeof b['groupId'] === 'string' ? { groupId: b['groupId'] } : {}),
      ...(b['headcount'] !== undefined ? { headcount: Number(b['headcount']) } : {}),
      ...(typeof b['archived'] === 'boolean' ? { archived: b['archived'] } : {}),
    });
  });
  app.post<{ Body: Body }>('/api/admin/groups', async (req) => addGroup(admin, String(req.body?.['name'] ?? '')));
  app.post<{ Body: Body }>('/api/admin/mappings', async (req) => {
    const b = req.body ?? {};
    return moveTeamMapping(admin, {
      kind: b['kind'] as MappingKind, ref: String(b['ref'] ?? ''), toTeam: String(b['toTeam'] ?? ''),
      effectiveFrom: String(b['effectiveFrom'] ?? ''),
    });
  });

  // ── Data sources: status, definitions, Run now
  app.get('/api/admin/data-sources', async () => getDataSources(sources(), sim()));
  app.put<{ Body: SourceDefinitions }>('/api/admin/data-sources/definitions', async (req) => {
    await updateDefinitions(sources(), req.body);
    return getDataSources(sources(), sim());
  });

  let running = false;
  app.post('/api/admin/sync/run', async (_req, reply) => {
    if (!deps.sync) throw new ValidationError('No source is configured');
    if (running) return reply.code(409).send({ error: 'A sync is already running' });
    running = true;
    try {
      const settings = await loadSettings(stores.settings);
      await runSyncNow({
        source: deps.sync.source, syncStore: stores.sync, clock: deps.clock, backfillDays: settings.backfillDays,
        ...(deps.sync.advance ? { advance: deps.sync.advance } : {}),
      });
    } finally {
      running = false;
    }
    return getDataSources(sources(), sim());
  });

  // ── Users: a single admin in v1
  app.get('/api/admin/users', async () => ({ users: await stores.users.list() }));
  app.post<{ Body: { current?: string; next?: string } }>('/api/admin/account/password', async (req, reply) => {
    const { current = '', next = '' } = req.body ?? {};
    if (next.length < 8) throw new ValidationError('The new password needs at least 8 characters');
    const ok = await deps.auth.changePassword(req.user!.username, current, next);
    if (!ok) return reply.code(403).send({ error: 'The current password is not right' });
    return { ok: true };
  });
}
