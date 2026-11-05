import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@selleros/shared';
export function registerErrorHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorResponse = {
      error: { code: 'NOT_FOUND', message: 'Rota não encontrada.', requestId: request.id },
    };
    return reply.code(404).send(body);
  });
  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    const status =
      typeof statusCode === 'number' &&
      Number.isInteger(statusCode) &&
      statusCode >= 400 &&
      statusCode < 500
        ? statusCode
        : 500;
    request.log[status >= 500 ? 'error' : 'warn'](
      { statusCode: status },
      'Falha ao processar solicitação',
    );
    const body: ApiErrorResponse = {
      error: {
        code: status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message: status >= 500 ? 'Erro interno do servidor.' : 'Solicitação inválida.',
        requestId: request.id,
      },
    };
    return reply.code(status).send(body);
  });
}
