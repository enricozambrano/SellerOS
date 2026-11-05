import pino from 'pino';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { loggerOptions } from './logger.js';
const startupLog = pino(loggerOptions('info'));
try {
  const config = readConfig();
  const app = buildApp(config);
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000).unref();
    try {
      await app.close();
    } finally {
      clearTimeout(deadline);
    }
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown().catch(() => {
        startupLog.error('Falha ao encerrar API');
        process.exitCode = 1;
      });
    });
  }
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch {
  startupLog.fatal(
    'API não iniciou. Verifique API_HOST, API_PORT, CORS_ORIGINS, LOG_LEVEL e disponibilidade da porta.',
  );
  process.exitCode = 1;
}
