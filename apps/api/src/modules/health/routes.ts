import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@selleros/shared';
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: HealthResponse }>(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'service'],
            properties: {
              status: { type: 'string', const: 'ok' },
              service: { type: 'string', const: 'selleros-api' },
            },
          },
        },
      },
    },
    async () => ({ status: 'ok', service: 'selleros-api' }),
  );
};
