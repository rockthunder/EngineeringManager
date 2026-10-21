import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser, SessionStore } from '../../../application/ports/auth';
import type { SettingsStore } from '../../../application/ports/settings-store';
import type { UserLookup, UserRecord } from '../auth-basic/basic-auth-provider';
import { ms, type Pool } from './pool';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class PostgresUserStore implements UserLookup {
  constructor(private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<UserRecord | null> {
    const r = await this.pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    const x = r.rows[0];
    return x ? { id: x.id, username: x.username, passwordHash: x.password_hash } : null;
  }

  async upsert(username: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [username, passwordHash],
    );
  }

  async list(): Promise<{ username: string; role: string }[]> {
    return (await this.pool.query('SELECT username, role FROM users ORDER BY username')).rows;
  }

  async count(): Promise<number> {
    return (await this.pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
  }
}

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly pool: Pool) {}

  async create(userId: number, expiresAt: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      sha256(token), userId, ms(expiresAt),
    ]);
    return token;
  }

  async find(token: string, now: number): Promise<AuthUser | null> {
    const r = await this.pool.query(
      `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [sha256(token), ms(now)],
    );
    const x = r.rows[0];
    return x ? { id: x.id, username: x.username, role: x.role } : null;
  }

  async delete(token: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  }
}

export class PostgresSettingsStore implements SettingsStore {
  constructor(private readonly pool: Pool) {}

  async get<T>(key: string): Promise<T | null> {
    const r = await this.pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return (r.rows[0]?.value as T | undefined) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)],
    );
  }
}
