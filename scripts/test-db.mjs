import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { root, readTestConfig } from './test-db-config.mjs';

function run(command, args, config, allowFailure = false) {
  const env = {
    ...process.env,
    TEST_POSTGRES_DB: config.database,
    TEST_POSTGRES_USER: config.user,
    TEST_POSTGRES_PASSWORD: config.password,
    TEST_POSTGRES_PORT: String(config.port),
  };
  // Do not allow unrelated Compose overrides to change the selected test project.
  delete env.COMPOSE_FILE;
  delete env.COMPOSE_PROJECT_NAME;
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    .replaceAll(config.connectionString, '[TEST_DATABASE_URL]')
    .replaceAll(config.password, '[REDACTED]')
    .replaceAll(encodeURIComponent(config.password), '[REDACTED]');
  process.stdout.write(output);
  if (!allowFailure && (result.error || result.status !== 0))
    throw new Error('Comando de persistência falhou; nenhuma remoção de volumes foi solicitada.');
}
async function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3) throw new Error('Informe somente uma ação documentada.');
  if (action === 'setup') {
    writeFileSync(
      `${root}.env.test`,
      `# Exclusivo para testes locais; não versionar.\nTEST_POSTGRES_DB=selleros_integration_test\nTEST_POSTGRES_USER=selleros_integration_test\nTEST_POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nTEST_POSTGRES_PORT=55432\n`,
      { flag: 'wx', mode: 0o600 },
    );
    console.log('.env.test criado com senha aleatória. Arquivo existente nunca é sobrescrito.');
    return;
  }
  const config = readTestConfig();
  const compose = [
    'compose',
    '--project-name',
    'selleros-test',
    '--env-file',
    '.env.test',
    '-f',
    'infra/docker-compose.test.yml',
  ];
  if (action === 'up')
    run('docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '60'], config);
  else if (action === 'status') run('docker', [...compose, 'ps', '-a'], config);
  else if (action === 'down') run('docker', [...compose, 'down', '--timeout', '30'], config);
  else if (action === 'stop-postgres') {
    // Clean PostgreSQL shutdown from inside its own container; no host security changes.
    run(
      'docker',
      [
        ...compose,
        'exec',
        '-T',
        '--user',
        'postgres',
        'postgres-test',
        'pg_ctl',
        '-D',
        '/var/lib/postgresql/data',
        'stop',
        '-m',
        'smart',
        '-W',
      ],
      config,
      true,
    );
    // exec may die with PID 1. Accept only independently verified clean exit.
    let clean = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = spawnSync(
        'docker',
        [
          'inspect',
          'selleros-test-postgres-test-1',
          '--format',
          '{{.State.Status}} {{.State.ExitCode}}',
        ],
        { encoding: 'utf8', timeout: 5000 },
      );
      if (state.status === 0 && state.stdout.trim() === 'exited 0') {
        clean = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!clean) throw new Error('Parada limpa não confirmada; não forçar encerramento.');
    console.log('PostgreSQL de testes encerrado: container exited, código 0. Volume preservado.');
  } else if (action === 'check') {
    const client = new pg.Client({
      connectionString: config.connectionString,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      await client.connect();
      const {
        rows: [row],
      } = await client.query(
        "SELECT current_database() AS db, current_user AS usr, current_setting('server_version_num')::int AS version",
      );
      if (
        row.db !== config.database ||
        row.usr !== config.user ||
        row.version < 170000 ||
        row.version >= 180000
      )
        throw new Error('Identidade PostgreSQL inesperada.');
      console.log(
        `PostgreSQL 17 conectado: ${row.db}, usuário exclusivo de testes, porta ${config.port}.`,
      );
    } finally {
      await client.end();
    }
  } else {
    const commands = {
      validate: ['validate'],
      generate: ['generate'],
      'migrate-status': ['migrate', 'status'],
      'migrate-deploy': ['migrate', 'deploy'],
    };
    if (!Object.hasOwn(commands, action))
      throw new Error('Ação não permitida. db push/reset não são expostos.');
    run('pnpm', ['exec', 'prisma', ...commands[action], '--config', 'prisma.config.ts'], config);
  }
}
main().catch(() => {
  console.error(
    'Falha na preparação/validação. Confira a ação, .env.test, o isolamento e a disponibilidade do Docker/PostgreSQL. Nenhum segredo é exibido.',
  );
  process.exitCode = 1;
});
