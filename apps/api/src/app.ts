import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readConfig, type ApiConfig } from './config.js';
import { loggerOptions } from './logger.js';
import { registerErrorHandlers } from './plugins/errors.js';
import { healthRoutes } from './modules/health/routes.js';
export function buildApp(config: ApiConfig = readConfig()) {
  const app = Fastify({
    logger: loggerOptions(config.LOG_LEVEL),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });
  registerErrorHandlers(app);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.register(cors, { origin: config.CORS_ORIGINS, credentials: false });
  app.register(healthRoutes);
  return app;
}
