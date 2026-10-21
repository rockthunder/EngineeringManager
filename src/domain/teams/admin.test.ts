import { describe, expect, it } from 'vitest';
import { dayToInstant } from '../time/day';
import { resolveTeam } from './mapping';
import { archiveTeam, createTeam, moveMapping, updateTeam } from './admin';
import type { Organisation } from './organisation';
import type { Mapping } from './types';

const org: Organisation = {
  profiles: [{ id: 'product', name: 'Product' }, { id: 'platform', name: 'Platform' }],
  groups: [{ id: 'south', name: 'South' }],
  teams: [
    { id: 'harbour', name: 'Harbour', profileId: 'product', groupId: 'south', headcount: 6, archived: false },
    { id: 'juniper', name: 'Juniper', profileId: 'product', groupId: 'south', headcount: 5, archived: false },
  ],
  mappings: [
    { teamId: 'harbour', kind: 'repo', ref: 'billing', effectiveFrom: '2025-10-01', effectiveTo: null },
    { teamId: 'harbour', kind: 'repo', ref: 'core', effectiveFrom: '2025-10-01', effectiveTo: null },
  ],
};

describe('moveMapping (a reorg)', () => {
  const move = (m: readonly Mapping[], to: string, from: string, ref = 'billing') =>
    moveMapping(m, { kind: 'repo', ref, toTeam: to, effectiveFrom: from });

  it('closes the old team’s range and opens the new team’s, so history stays with the old team', () => {
    const next = move(org.mappings, 'juniper', '2026-06-23');
    expect(next.filter((m) => m.ref === 'billing')).toEqual([
      { teamId: 'harbour', kind: 'repo', ref: 'billing', effectiveFrom: '2025-10-01', effectiveTo: '2026-06-23' },
      { teamId: 'juniper', kind: 'repo', ref: 'billing', effectiveFrom: '2026-06-23', effectiveTo: null },
    ]);
    expect(resolveTeam(next, 'repo', 'billing', dayToInstant('2026-06-22'))).toBe('harbour');
    expect(resolveTeam(next, 'repo', 'billing', dayToInstant('2026-06-23'))).toBe('juniper');
    expect(next.find((m) => m.ref === 'core')!.teamId).toBe('harbour'); // others untouched
  });

  it('assigns a repo that has never been mapped', () => {
    const next = move(org.mappings, 'juniper', '2026-01-01', 'new-repo');
    expect(next.filter((m) => m.ref === 'new-repo')).toHaveLength(1);
  });

  it('refuses to move a repo to the team that already has it', () => {
    expect(() => move(org.mappings, 'harbour', '2026-06-23')).toThrow(/already/);
  });

  it('refuses a date on or before the current mapping started (no empty ranges)', () => {
    expect(() => move(org.mappings, 'juniper', '2025-10-01')).toThrow(/after/);
    expect(() => move(org.mappings, 'juniper', '2025-09-01')).toThrow();
  });

  it('refuses when a later mapping already exists for that repo', () => {
    const later = move(org.mappings, 'juniper', '2026-06-23');
    expect(() => move(later, 'harbour', '2026-03-01')).toThrow(/later/);
  });

  it('can hand a repo back after a move', () => {
    const back = move(move(org.mappings, 'juniper', '2026-06-23'), 'harbour', '2026-09-01');
    expect(resolveTeam(back, 'repo', 'billing', dayToInstant('2026-10-01'))).toBe('harbour');
    expect(resolveTeam(back, 'repo', 'billing', dayToInstant('2026-07-01'))).toBe('juniper');
  });
});

describe('team administration', () => {
  it('creates a team with a stable id from its name', () => {
    const next = createTeam(org, { name: 'Kestrel Squad', profileId: 'platform', groupId: 'south', headcount: 4 });
    expect(next.teams.at(-1)).toEqual({
      id: 'kestrel-squad', name: 'Kestrel Squad', profileId: 'platform', groupId: 'south', headcount: 4, archived: false,
    });
  });

  it('refuses duplicates and bad input', () => {
    expect(() => createTeam(org, { name: 'harbour', profileId: 'product', groupId: 'south', headcount: 3 })).toThrow(/exists/);
    expect(() => createTeam(org, { name: ' ', profileId: 'product', groupId: 'south', headcount: 3 })).toThrow(/name/);
    expect(() => createTeam(org, { name: 'X', profileId: 'nope' as never, groupId: 'south', headcount: 3 })).toThrow(/profile/);
    expect(() => createTeam(org, { name: 'X', profileId: 'product', groupId: 'nope', headcount: 3 })).toThrow(/group/);
    expect(() => createTeam(org, { name: 'X', profileId: 'product', groupId: 'south', headcount: -1 })).toThrow(/headcount/i);
  });

  it('updates a team’s profile, group and headcount', () => {
    const next = updateTeam(org, 'harbour', { profileId: 'platform', headcount: 7 });
    expect(next.teams.find((t) => t.id === 'harbour')).toMatchObject({ profileId: 'platform', headcount: 7, name: 'Harbour' });
    expect(() => updateTeam(org, 'ghost', {})).toThrow(/No team/);
  });

  it('archives without touching mappings, so history is kept', () => {
    const next = archiveTeam(org, 'harbour', true);
    expect(next.teams.find((t) => t.id === 'harbour')!.archived).toBe(true);
    expect(next.mappings).toEqual(org.mappings);
    expect(archiveTeam(next, 'harbour', false).teams.find((t) => t.id === 'harbour')!.archived).toBe(false);
  });
});
