import type { ConfigStore } from '../../../application/ports/config-store';
import type { BenchmarkVersion } from '../../../domain/benchmarks/version';
import type { SourceDefinitions } from '../../../domain/events/definitions';
import type { Organisation } from '../../../domain/teams/organisation';
import type { MappingKind, ProfileId } from '../../../domain/teams/types';
import type { Pool } from './pool';

export class PostgresConfigStore implements ConfigStore {
  constructor(private readonly pool: Pool) {}

  async loadOrganisation(): Promise<Organisation> {
    const [profiles, groups, teams, mappings] = await Promise.all([
      this.pool.query("SELECT id, name FROM profiles ORDER BY (id <> 'product'), id"),
      this.pool.query('SELECT id, name FROM groups ORDER BY id'),
      this.pool.query('SELECT * FROM teams ORDER BY id'),
      this.pool.query('SELECT * FROM team_mappings ORDER BY kind, ref, effective_from'),
    ]);
    return {
      profiles: profiles.rows.map((r) => ({ id: r.id as ProfileId, name: r.name })),
      groups: groups.rows,
      teams: teams.rows.map((r) => ({
        id: r.id, name: r.name, profileId: r.profile_id, groupId: r.group_id, headcount: r.headcount, archived: r.archived,
      })),
      mappings: mappings.rows.map((r) => ({
        teamId: r.team_id, kind: r.kind as MappingKind, ref: r.ref, effectiveFrom: r.effective_from, effectiveTo: r.effective_to,
      })),
    };
  }

  async saveOrganisation(org: Organisation): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of org.profiles) {
        await client.query('INSERT INTO profiles (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', [p.id, p.name]);
      }
      for (const g of org.groups) {
        await client.query('INSERT INTO groups (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', [g.id, g.name]);
      }
      for (const t of org.teams) {
        await client.query(
          `INSERT INTO teams (id, name, profile_id, group_id, headcount, archived) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, profile_id = EXCLUDED.profile_id,
             group_id = EXCLUDED.group_id, headcount = EXCLUDED.headcount, archived = EXCLUDED.archived`,
          [t.id, t.name, t.profileId, t.groupId, t.headcount, t.archived],
        );
      }
      await client.query('DELETE FROM team_mappings');
      for (const m of org.mappings) {
        await client.query(
          'INSERT INTO team_mappings (team_id, kind, ref, effective_from, effective_to) VALUES ($1, $2, $3, $4, $5)',
          [m.teamId, m.kind, m.ref, m.effectiveFrom, m.effectiveTo],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async loadDefinitions(): Promise<SourceDefinitions> {
    const r = await this.pool.query('SELECT payload FROM source_definitions ORDER BY version DESC LIMIT 1');
    if (!r.rows[0]) throw new Error('No source definitions configured');
    return r.rows[0].payload as SourceDefinitions;
  }

  async saveDefinitions(defs: SourceDefinitions): Promise<void> {
    await this.pool.query('INSERT INTO source_definitions (created_at, payload) VALUES (now(), $1::jsonb)', [JSON.stringify(defs)]);
  }

  async loadBenchmarkVersions(): Promise<readonly BenchmarkVersion[]> {
    const r = await this.pool.query('SELECT payload FROM benchmark_versions ORDER BY number');
    return r.rows.map((x) => x.payload as BenchmarkVersion);
  }

  async appendBenchmarkVersion(v: BenchmarkVersion): Promise<void> {
    await this.pool.query(
      'INSERT INTO benchmark_versions (number, effective_from, payload) VALUES ($1, $2, $3::jsonb)',
      [v.number, v.effectiveFrom, JSON.stringify(v)],
    );
  }
}
