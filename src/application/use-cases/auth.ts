import type { AuthProvider, AuthUser, SessionStore } from '../ports/auth';
import type { Clock } from '../ports/clock';

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor() {
    super('Invalid username or password');
  }
}

export interface AuthDeps {
  readonly auth: AuthProvider;
  readonly sessions: SessionStore;
  /** Real time: sessions expire in wall-clock time, not in the simulated data clock. */
  readonly clock: Clock;
}

export async function login(
  deps: AuthDeps,
  creds: { username: string; password: string },
): Promise<{ token: string; user: AuthUser; expiresAt: number }> {
  const user = await deps.auth.authenticate(creds.username, creds.password);
  if (!user) throw new AuthError();
  const expiresAt = deps.clock.now() + SESSION_TTL_MS;
  return { token: await deps.sessions.create(user.id, expiresAt), user, expiresAt };
}

export function getSession(deps: AuthDeps, token: string | undefined): Promise<AuthUser | null> {
  return token ? deps.sessions.find(token, deps.clock.now()) : Promise.resolve(null);
}

export async function logout(deps: AuthDeps, token: string | undefined): Promise<void> {
  if (token) await deps.sessions.delete(token);
}
