import type { LoggerOptions } from 'pino';
export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    base: { service: 'selleros-api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        'token',
        'accessToken',
        'refreshToken',
        'DATABASE_URL',
        'REDIS_URL',
      ],
      censor: '[REDACTED]',
    },
    // Allowlisted serialization: never record bodies, headers, query strings or raw errors.
    serializers: {
      req: (req: { method?: string }) => ({ method: req.method }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      err: () => ({ message: 'Detalhes do erro omitidos por segurança' }),
    },
  };
}
