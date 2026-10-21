import { archiveTeam, createGroup, createTeam, moveMapping, updateTeam, type MoveRequest, type NewTeam } from '../../domain/teams/admin';
import { findMappingOverlaps, resolveTeam } from '../../domain/teams/mapping';
import type { Organisation } from '../../domain/teams/organisation';
import { dayToInstant, instantToDay } from '../../domain/time/day';
import { ValidationError } from '../errors';
import type { Clock } from '../ports/clock';
import type { ConfigStore } from '../ports/config-store';
import type { EventStore } from '../ports/event-store';
import type { KnownRef, TeamAdminView } from '../views/contract';

interface Deps {
  readonly configStore: ConfigStore;
  readonly eventStore: EventStore;
  readonly clock: Clock;
}

export async function getTeamAdmin(deps: Deps): Promise<TeamAdminView> {
  const [org, seen] = await Promise.all([deps.configStore.loadOrganisation(), deps.eventStore.distinctRefs()]);
  const today = instantToDay(deps.clock.now());
  const at = dayToInstant(today) + 1;
  const teamName = new Map(org.teams.map((t) => [t.id, t.name]));
  const groupName = new Map(org.groups.map((g) => [g.id, g.name]));

  const refs = (kind: 'repo' | 'board' | 'service'): KnownRef[] => {
    const all = new Set([...seen[kind], ...org.mappings.filter((m) => m.kind === kind).map((m) => m.ref)]);
    return [...all].sort().map((ref) => {
      const owner = resolveTeam(org.mappings, kind, ref, at);
      return { ref, owner: owner ? (teamName.get(owner) ?? owner) : null, ownerId: owner };
    });
  };

  return {
    today,
    teams: org.teams.map((t) => ({
      id: t.id, name: t.name, profile: t.profileId, groupId: t.groupId, groupName: groupName.get(t.groupId) ?? t.groupId,
      headcount: t.headcount, archived: t.archived,
      mappings: org.mappings
        .filter((m) => m.teamId === t.id)
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.ref.localeCompare(b.ref) || a.effectiveFrom.localeCompare(b.effectiveFrom))
        .map(({ kind, ref, effectiveFrom, effectiveTo }) => ({ kind, ref, effectiveFrom, effectiveTo })),
    })),
    groups: org.groups.map((g) => ({ id: g.id, name: g.name })),
    profiles: org.profiles.map((p) => ({ id: p.id, name: p.name })),
    refs: { repo: refs('repo'), board: refs('board'), service: refs('service') },
  };
}

async function change(deps: Deps, f: (org: Organisation) => Organisation): Promise<TeamAdminView> {
  const next = f(await deps.configStore.loadOrganisation());
  const overlaps = findMappingOverlaps(next.mappings);
  if (overlaps.length > 0) throw new ValidationError('Mappings would overlap');
  await deps.configStore.saveOrganisation(next);
  return getTeamAdmin(deps);
}

export const addTeam = (deps: Deps, t: NewTeam) => change(deps, (o) => createTeam(o, t));
export const editTeam = (deps: Deps, id: string, patch: Partial<NewTeam> & { archived?: boolean }) =>
  change(deps, (o) => {
    const { archived, ...rest } = patch;
    let next = Object.keys(rest).length > 0 ? updateTeam(o, id, rest) : o;
    if (archived !== undefined) next = archiveTeam(next, id, archived);
    return next;
  });
export const addGroup = (deps: Deps, name: string) => change(deps, (o) => createGroup(o, name));

/** A reorg: hand a repo, board or service to another team from a date. */
export const moveTeamMapping = (deps: Deps, req: MoveRequest) =>
  change(deps, (o) => {
    if (!o.teams.some((t) => t.id === req.toTeam)) throw new ValidationError(`No team ${req.toTeam}`);
    return { ...o, mappings: moveMapping(o.mappings, req) };
  });
