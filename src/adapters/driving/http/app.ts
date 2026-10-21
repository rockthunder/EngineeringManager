import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { ValidationError } from '../../../application/errors';
import { registerAuth } from './auth-routes';
import { registerBenchmarkRoutes } from './benchmark-routes';
import type { AppDeps } from './deps';

/** Thin HTTP driving adapter: routes validate input and call use cases, nothing more. */
export function buildApp(deps?: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok' }));
  if (!deps) return app;

  void app.register(cookie);
  registerAuth(app, deps);
  registerBenchmarkRoutes(app, deps);
  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode ?? (err.name === 'NotFoundError' ? 404 : err.name === 'ValidationError' || err instanceof ValidationError ? 400 : 500);
    void reply.code(status).send({ error: status >= 500 ? 'Internal error' : err.message });
  });
  return app;
}
