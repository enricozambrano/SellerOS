import pino from 'pino';
import { readConfig } from './config.js';
import { startWorker } from './worker.js';
const startupLog = pino({ base: { service: 'selleros-worker' } });
try {
  const config = readConfig();
  const log = pino({
    level: config.LOG_LEVEL,
    base: { service: 'selleros-worker' },
    serializers: { err: () => ({ message: 'Erro omitido' }) },
    redact: ['REDIS_URL', 'password', 'token'],
  });
  const worker = await startWorker(config.REDIS_URL, log);
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 10000).unref();
      void worker
        .close()
        .catch(() => {
          log.error('Falha ao encerrar worker');
          process.exitCode = 1;
        })
        .finally(() => clearTimeout(deadline));
    });
  }
} catch {
  startupLog.fatal(
    'Worker não iniciou. Verifique REDIS_URL, LOG_LEVEL e disponibilidade do Redis.',
  );
  process.exitCode = 1;
}
