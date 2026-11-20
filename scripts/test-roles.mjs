import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { root, readTestConfig } from './test-db-config.mjs';
import { verifyInstance } from './test-instance.mjs';

const rolePath = `${root}.env.test.roles`;
const names = {
  migration: 'selleros_test_migration',
  api: 'selleros_test_api',
  bootstrap: 'selleros_test_bootstrap',
  worker: 'selleros_test_worker',
  maintenance: 'selleros_test_maintenance',
};
export function roleConfig(kind) {
  if (!Object.hasOwn(names, kind)) throw new Error('Role desconhecida.');
  const config = readTestConfig();
  const secrets = JSON.parse(readFileSync(rolePath, 'utf8'));
  const password = secrets[kind];
  if (!/^[a-f0-9]{64}$/.test(password ?? '')) throw new Error('Credencial de role inválida.');
  const url = new URL(config.connectionString);
  url.username = names[kind];
  url.password = password;
  return { ...config, user: names[kind], password, connectionString: url.toString() };
}
export async function provisionRoles() {
  await verifyInstance();
  let secrets;
  try {
    secrets = JSON.parse(readFileSync(rolePath, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    secrets = Object.fromEntries(
      Object.keys(names).map((k) => [k, randomBytes(32).toString('hex')]),
    );
    writeFileSync(rolePath, JSON.stringify(secrets), { flag: 'wx', mode: 0o600 });
  }
  const config = readTestConfig();
  const client = new pg.Client({ connectionString: config.connectionString });
  try {
    await client.connect();
    await client.query('BEGIN');
    // Cluster-local provisioning, not a domain migration. Never grant these roles to runtime.
    for (const [kind, name] of Object.entries(names)) {
      const password = secrets[kind];
      if (!/^[a-f0-9]{64}$/.test(password)) throw new Error('Credencial inválida.');
      const found = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name]);
      if (!found.rowCount)
        await client.query(
          `CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
        );
    }
    for (const name of ['selleros_test_policy', 'selleros_test_bootstrap_writer']) {
      const found = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name]);
      if (!found.rowCount)
        await client.query(
          `CREATE ROLE ${name} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        );
    }
    await client.query(`REVOKE ALL ON DATABASE "${config.database}" FROM PUBLIC`);
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    for (const name of Object.values(names))
      await client.query(`GRANT CONNECT ON DATABASE "${config.database}" TO ${name}`);
    await client.query('GRANT USAGE, CREATE ON SCHEMA public TO selleros_test_migration');
    await client.query(`GRANT CREATE ON DATABASE "${config.database}" TO selleros_test_migration`);
    await client.query(
      'GRANT selleros_test_policy, selleros_test_bootstrap_writer TO selleros_test_migration',
    );
    await client.query(
      'GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO selleros_test_migration',
    );
    await client.query('COMMIT');
    console.log('Roles locais provisionadas; credenciais distintas em arquivo privado.');
  } finally {
    await client.end();
  }
}
export async function verifyMigrationTarget() {
  const expected = await verifyInstance();
  const config = roleConfig('migration');
  const client = new pg.Client({ connectionString: config.connectionString });
  try {
    await client.connect();
    const {
      rows: [r],
    } = await client.query(
      "SELECT system_identifier::text AS id, current_database() AS db, current_user AS usr, current_setting('server_version_num')::int AS version FROM pg_control_system()",
    );
    if (
      r.id !== expected.systemIdentifier ||
      r.db !== expected.database ||
      r.usr !== config.user ||
      Math.floor(r.version / 10000) !== 17
    )
      throw new Error('Destino do migrador inválido.');
    console.log(
      'Preflight: cluster fixado, container, volume, banco, usuário migrador e PostgreSQL 17 conferidos.',
    );
  } finally {
    await client.end();
  }
}
