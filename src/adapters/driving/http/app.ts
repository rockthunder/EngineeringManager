import Fastify, { type FastifyInstance } from 'fastify';

/** Thin HTTP driving adapter. Only a health check for now; routes call use cases only. */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}
