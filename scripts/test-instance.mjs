import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { root, readTestConfig } from './test-db-config.mjs';

const pinPath = `${root}.env.test.identity`;
export function sameIdentity(expected, actual) {
  return ['systemIdentifier', 'database', 'databaseOid', 'user', 'versionMajor', 'volume'].every(
    (key) => expected[key] === actual[key],
  );
}
export async function inspectInstance() {
  const config = readTestConfig();
  const container = JSON.parse(
    execFileSync('docker', ['inspect', 'selleros-test-postgres-test-1'], {
      encoding: 'utf8',
      timeout: 5000,
    }),
  )[0];
  if (
    container.Config.Labels['com.docker.compose.project'] !== 'selleros-test' ||
    container.Config.Labels['com.docker.compose.service'] !== 'postgres-test' ||
    !container.State.Running
  )
    throw new Error('Container de teste inválido.');
  const volume = container.Mounts.find((m) => m.Destination === '/var/lib/postgresql/data')?.Name;
  if (volume !== 'selleros-test_postgres_test_data') throw new Error('Volume de teste inválido.');
  const client = new pg.Client({
    connectionString: config.connectionString,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const {
      rows: [r],
    } = await client.query(
      "SELECT system_identifier::text AS id, current_database() AS db, current_user AS usr, (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid, current_setting('server_version_num')::int AS version FROM pg_control_system()",
    );
    const internal = execFileSync(
      'docker',
      [
        'exec',
        'selleros-test-postgres-test-1',
        'psql',
        '-XAt',
        '-U',
        config.user,
        '-d',
        config.database,
        '-c',
        'SELECT system_identifier FROM pg_control_system()',
      ],
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    if (
      r.id !== internal ||
      r.db !== config.database ||
      r.usr !== config.user ||
      Math.floor(r.version / 10000) !== 17
    )
      throw new Error('Instância inesperada.');
    return {
      systemIdentifier: r.id,
      database: r.db,
      databaseOid: r.oid,
      user: r.usr,
      versionMajor: 17,
      volume,
    };
  } finally {
    await client.end();
  }
}
export async function verifyInstance() {
  const expected = JSON.parse(readFileSync(pinPath, 'utf8'));
  const actual = await inspectInstance();
  if (!sameIdentity(expected, actual))
    throw new Error('Identidade da instância mudou. Deploy bloqueado.');
  return actual;
}
export async function enrollInstance() {
  const actual = await inspectInstance();
  writeFileSync(pinPath, `${JSON.stringify(actual, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log('Identidade do cluster de testes fixada; arquivo existente nunca é sobrescrito.');
}
