import { createClient } from 'redis';
import type { Logger } from 'pino';
export async function startWorker(url: string, log: Logger) {
  const client = createClient({
    url,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => (retries < 3 ? Math.min(250 * 2 ** retries, 2000) : false),
    },
  });
  client.on('error', () => log.error('Conexão Redis indisponível'));
  client.on('reconnecting', () => log.warn('Reconectando ao Redis'));
  client.on('ready', () => log.info('Conexão Redis pronta'));
  try {
    await client.connect();
    await client.ping();
  } catch {
    if (client.isOpen) client.destroy();
    throw new Error('Não foi possível inicializar o worker.');
  }
  log.info('Worker inicializado; aguardando trabalhos futuros, sem consumidores registrados');
  return {
    async close() {
      if (client.isReady) await client.quit();
      else if (client.isOpen) client.destroy();
      log.info('Worker encerrado');
    },
  };
}
