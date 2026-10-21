import { findMappingOverlaps } from './mapping';
import type { Organisation } from './organisation';
import type { Mapping, MappingKind, ProfileId, Team } from './types';

export class TeamAdminError extends Error {
  override readonly name = 'ValidationError';
}

export interface MoveRequest {
  readonly kind: MappingKind;
  readonly ref: string;
  readonly toTeam: string;
  readonly effectiveFrom: string;
}

/**
 * Hand a repo/board/service to another team from a date: the old mapping is closed (so earlier
 * events stay with the old team) and a new one opened (so later events go to the new team).
 */
export function moveMapping(mappings: readonly Mapping[], req: MoveRequest): Mapping[] {
  const same = mappings.filter((m) => m.kind === req.kind && m.ref === req.ref);
  if (same.some((m) => m.effectiveFrom > req.effectiveFrom || (m.effectiveTo !== null && m.effectiveTo > req.effectiveFrom))) {
    throw new TeamAdminError(`${req.ref} already has a later mapping; pick a date after it`);
  }
  const open = same.find((m) => m.effectiveTo === null);
  if (open?.teamId === req.toTeam) throw new TeamAdminError(`${req.ref} is already with that team`);
  if (open && req.effectiveFrom <= open.effectiveFrom) {
    throw new TeamAdminError(`The move must take effect after ${open.effectiveFrom}, when the current mapping began`);
  }
  const next = mappings
    .map((m) => (m === open ? { ...m, effectiveTo: req.effectiveFrom } : m))
    .concat({ teamId: req.toTeam, kind: req.kind, ref: req.ref, effectiveFrom: req.effectiveFrom, effectiveTo: null });
  if (findMappingOverlaps(next).length > 0) throw new TeamAdminError('That change would give the same repo to two teams at once');
  return next;
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface NewTeam {
  readonly name: string;
  readonly profileId: ProfileId;
  readonly groupId: string;
  readonly headcount: number;
}

function check(org: Organisation, t: Partial<NewTeam>): void {
  if (t.name !== undefined && slug(t.name) === '') throw new TeamAdminError('A team needs a name');
  if (t.profileId !== undefined && !org.profiles.some((p) => p.id === t.profileId)) throw new TeamAdminError(`Unknown profile: ${t.profileId}`);
  if (t.groupId !== undefined && !org.groups.some((g) => g.id === t.groupId)) throw new TeamAdminError(`Unknown group: ${t.groupId}`);
  if (t.headcount !== undefined && !(Number.isInteger(t.headcount) && t.headcount >= 0)) {
    throw new TeamAdminError('Headcount must be a whole number, 0 or more');
  }
}

export function createTeam(org: Organisation, input: NewTeam): Organisation {
  check(org, input);
  const id = slug(input.name);
  if (org.teams.some((t) => t.id === id || t.name.toLowerCase() === input.name.trim().toLowerCase())) {
    throw new TeamAdminError(`A team called ${input.name.trim()} already exists`);
  }
  const team: Team = { id, name: input.name.trim(), profileId: input.profileId, groupId: input.groupId, headcount: input.headcount, archived: false };
  return { ...org, teams: [...org.teams, team] };
}

export function updateTeam(org: Organisation, id: string, patch: Partial<NewTeam>): Organisation {
  if (!org.teams.some((t) => t.id === id)) throw new TeamAdminError(`No team ${id}`);
  check(org, patch);
  return {
    ...org,
    teams: org.teams.map((t) => (t.id === id ? { ...t, ...(patch.name ? { name: patch.name.trim() } : {}), ...(patch.profileId ? { profileId: patch.profileId } : {}), ...(patch.groupId ? { groupId: patch.groupId } : {}), ...(patch.headcount !== undefined ? { headcount: patch.headcount } : {}) } : t)),
  };
}

/** Archive hides a team from grids but keeps its mappings and events, so history and org totals are intact. */
export function archiveTeam(org: Organisation, id: string, archived: boolean): Organisation {
  if (!org.teams.some((t) => t.id === id)) throw new TeamAdminError(`No team ${id}`);
  return { ...org, teams: org.teams.map((t) => (t.id === id ? { ...t, archived } : t)) };
}

export function createGroup(org: Organisation, name: string): Organisation {
  const id = slug(name);
  if (!id) throw new TeamAdminError('A group needs a name');
  if (org.groups.some((g) => g.id === id)) throw new TeamAdminError(`A group called ${name.trim()} already exists`);
  return { ...org, groups: [...org.groups, { id, name: name.trim() }] };
}

