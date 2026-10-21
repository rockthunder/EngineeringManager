import type { FastifyInstance } from 'fastify';
import { AuthError, getSession, login, logout, SESSION_TTL_MS } from '../../../application/use-cases/auth';
import type { AppDeps } from './deps';

export const SESSION_COOKIE = 'session';

// '/api/s/' (with the slash) is the public survey link; '/api/surveys' is not covered by it.
const PUBLIC_PREFIXES = ['/api/login', '/api/s/', '/health'];

export function registerAuth(app: FastifyInstance, deps: AppDeps): void {
  const authDeps = { auth: deps.auth, sessions: deps.stores.sessions, clock: deps.authClock };

  // Everything under /api needs a session except login and the public survey links.
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0]!;
    if (!path.startsWith('/api/') || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;
    const user = await getSession(authDeps, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'Not signed in' });
    req.user = user;
  });

  app.post<{ Body: { username?: string; password?: string } }>('/api/login', async (req, reply) => {
    try {
      const { token, user } = await login(authDeps, {
        username: req.body?.username ?? '',
        password: req.body?.password ?? '',
      });
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: deps.secureCookies ?? false,
        maxAge: SESSION_TTL_MS / 1000,
      });
      return { user };
    } catch (e) {
      if (e instanceof AuthError) return reply.code(401).send({ error: e.message });
      throw e;
    }
  });

  app.post('/api/logout', async (req, reply) => {
    await logout(authDeps, req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (req) => ({ user: req.user }));
}
