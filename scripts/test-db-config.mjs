import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function validateTestConfig(test, dev = {}) {
  const database = test.TEST_POSTGRES_DB;
  const user = test.TEST_POSTGRES_USER;
  const password = test.TEST_POSTGRES_PASSWORD;
  const port = Number(test.TEST_POSTGRES_PORT);
  if (
    !/^selleros_[a-z0-9_]*test$/.test(database ?? '') ||
    !/^selleros_[a-z0-9_]*test$/.test(user ?? '') ||
    !password ||
    password.length < 24 ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    port === 5432 ||
    port === Number(dev.POSTGRES_PORT ?? 5432) ||
    database === dev.POSTGRES_DB ||
    user === dev.POSTGRES_USER ||
    password === dev.POSTGRES_PASSWORD
  )
    throw new Error(
      'Configuração de testes inválida ou não isolada. Consulte docs/13-etapa-02b0-persistencia.md.',
    );
  if (dev.DATABASE_URL) {
    let url;
    try {
      url = new URL(dev.DATABASE_URL);
    } catch {
      throw new Error('DATABASE_URL de desenvolvimento inválida; isolamento não comprovado.');
    }
    if (
      Number(url.port || 5432) === port ||
      decodeURIComponent(url.pathname.slice(1)) === database ||
      decodeURIComponent(url.username) === user
    ) {
      throw new Error('Destino de teste conflita com desenvolvimento.');
    }
  }
  return {
    database,
    user,
    port,
    password,
    connectionString: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`,
  };
}
export function readTestConfig() {
  let test;
  try {
    test = parseEnv(readFileSync(`${root}.env.test`, 'utf8'));
  } catch {
    throw new Error('Crie .env.test com pnpm db:test:setup.');
  }
  let dev = {};
  try {
    dev = parseEnv(readFileSync(`${root}.env`, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw new Error('Não foi possível conferir .env de desenvolvimento.', { cause: error });
  }
  // Also reject collisions with an environment-provided development URL.
  const config = validateTestConfig(test, dev);
  if (process.env.DATABASE_URL)
    validateTestConfig(test, { DATABASE_URL: process.env.DATABASE_URL });
  return config;
}
