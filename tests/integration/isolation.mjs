import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { root } from '../../scripts/test-db-config.mjs';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { readTestConfig } from '../../scripts/test-db-config.mjs';
import { roleConfig, verifyMigrationTarget } from '../../scripts/test-roles.mjs';

await verifyMigrationTarget();
const issuer = `fixture:${randomUUID()}`;
const ids = Object.fromEntries(
  ['a', 'b', 'viewer', 'inactive', 'second'].map((k) => [k, randomUUID()]),
);
const admin = new pg.Client({ connectionString: readTestConfig().connectionString });
const pools = Object.fromEntries(
  ['api', 'bootstrap', 'worker', 'maintenance'].map((k) => [
    k,
    new pg.Pool({
      connectionString: roleConfig(k).connectionString,
      max: 1,
      connectionTimeoutMillis: 5000,
    }),
  ]),
);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: roleConfig('api').connectionString, max: 1 }),
  log: [],
});
const migration = new pg.Client({ connectionString: roleConfig('migration').connectionString });
let orgA,
  orgB,
  fixtureCreated = false;
async function context(client, user, org, actor = 'user') {
  await client.query(
    "SELECT set_config('selleros.issuer',$1,true),set_config('selleros.subject',$2,true),set_config('selleros.organization_id',$3,true),set_config('selleros.actor',$4,true)",
    [issuer, user, org ?? '', actor],
  );
}
async function transaction(kind, user, org, fn) {
  const c = await pools[kind].connect();
  try {
    await c.query('BEGIN');
    await context(c, user, org);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
async function prismaContext(tx, user, org) {
  await tx.$queryRaw`SELECT set_config('selleros.issuer',${issuer},true),set_config('selleros.subject',${user},true),set_config('selleros.organization_id',${org},true),set_config('selleros.actor','user',true)`;
}
async function denied(fn, codes = ['42501', '23514']) {
  await assert.rejects(fn, (e) => codes.includes(e.code));
}
try {
  await admin.connect();
  await migration.connect();
  for (const [subject, id] of Object.entries(ids))
    await admin.query(
      "INSERT INTO app_users(id,auth_issuer,auth_subject,status) VALUES($1,$2,$3,'active')",
      [id, issuer, subject],
    );
  orgA = await transaction(
    'bootstrap',
    'a',
    null,
    async (c) =>
      (await c.query("SELECT selleros.bootstrap_organization('Demonstração A') AS id")).rows[0].id,
  );
  orgB = await transaction(
    'bootstrap',
    'b',
    null,
    async (c) =>
      (await c.query("SELECT selleros.bootstrap_organization('Demonstração B') AS id")).rows[0].id,
  );
  await transaction('api', 'a', orgA, async (c) => {
    for (const [key, role, status] of [
      ['viewer', 'viewer', 'active'],
      ['inactive', 'operator', 'inactive'],
      ['second', 'owner', 'active'],
    ])
      await c.query(
        'INSERT INTO organization_members(organization_id,user_id,role,status) VALUES($1,$2,$3,$4)',
        [orgA, ids[key], role, status],
      );
  });
  // Disposable proof only: no product/order/inventory/job entity is added to the migration.
  await migration.query(`CREATE SCHEMA isolation_proof;
    CREATE TABLE isolation_proof.records(id uuid PRIMARY KEY,organization_id uuid NOT NULL,actor_user_id uuid NOT NULL,label text NOT NULL,
      FOREIGN KEY(organization_id,actor_user_id) REFERENCES public.organization_members(organization_id,user_id));
    CREATE TABLE isolation_proof.jobs(id uuid PRIMARY KEY,organization_id uuid NOT NULL,token text NOT NULL);
    ALTER TABLE isolation_proof.records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE isolation_proof.records FORCE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA isolation_proof TO selleros_test_api,selleros_test_worker,selleros_test_policy;
    GRANT SELECT,INSERT,UPDATE,DELETE ON isolation_proof.records TO selleros_test_api;
    GRANT SELECT ON isolation_proof.jobs TO selleros_test_policy;
    GRANT SELECT,UPDATE ON isolation_proof.records TO selleros_test_worker;
    CREATE FUNCTION isolation_proof.worker_access(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      SELECT session_user='selleros_test_worker' AND current_setting('selleros.actor',true)='system'
        AND current_setting('selleros.organization_id',true)=target::text
        AND EXISTS(SELECT 1 FROM isolation_proof.jobs j JOIN public.organizations o ON o.id=j.organization_id
          WHERE j.organization_id=target AND o.status='active' AND j.id::text=current_setting('selleros.job_id',true)
            AND j.token=current_setting('selleros.job_token',true))
    $$;
    GRANT CREATE ON SCHEMA isolation_proof TO selleros_test_policy;
    ALTER FUNCTION isolation_proof.worker_access(uuid) OWNER TO selleros_test_policy;
    REVOKE CREATE ON SCHEMA isolation_proof FROM selleros_test_policy;
    REVOKE ALL ON FUNCTION isolation_proof.worker_access(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION isolation_proof.worker_access(uuid) TO selleros_test_worker;
    CREATE POLICY user_access ON isolation_proof.records TO selleros_test_api USING(selleros.can_access(organization_id)) WITH CHECK(selleros.can_access(organization_id));
    CREATE POLICY worker_access ON isolation_proof.records TO selleros_test_worker USING(isolation_proof.worker_access(organization_id)) WITH CHECK(isolation_proof.worker_access(organization_id));
    CREATE VIEW isolation_proof.visible_records WITH(security_invoker=true) AS SELECT * FROM isolation_proof.records;
    GRANT SELECT ON isolation_proof.visible_records TO selleros_test_api,selleros_test_worker;`);
  fixtureCreated = true;
  const recordA = randomUUID(),
    recordB = randomUUID(),
    jobA = randomUUID(),
    tokenA = randomUUID();
  await admin.query('INSERT INTO isolation_proof.records VALUES($1,$2,$3,$4),($5,$6,$7,$8)', [
    recordA,
    orgA,
    ids.a,
    'A',
    recordB,
    orgB,
    ids.b,
    'B',
  ]);
  await admin.query('INSERT INTO isolation_proof.jobs VALUES($1,$2,$3)', [jobA, orgA, tokenA]);

  await test('preflight real recusa identidade de cluster adulterada antes do deploy', async () => {
    const path = `${root}.env.test.identity`;
    const original = readFileSync(path, 'utf8');
    try {
      writeFileSync(
        path,
        JSON.stringify({ ...JSON.parse(original), systemIdentifier: 'invalid-cluster' }),
        { mode: 0o600 },
      );
      await assert.rejects(() => verifyMigrationTarget(), /Identidade da instância mudou/);
    } finally {
      writeFileSync(path, original, { mode: 0o600 });
    }
    await verifyMigrationTarget();
  });
  await test('roles reais: sem superuser, BYPASSRLS, propriedade ou caminhos de elevação', async () => {
    for (const [kind, pool] of Object.entries(pools)) {
      const {
        rows: [r],
      } = await pool.query(
        'SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user',
      );
      assert.equal(r.name, roleConfig(kind).user);
      assert.equal(r.rolsuper, false);
      assert.equal(r.rolbypassrls, false);
      assert.equal(r.rolcreaterole, false);
      assert.equal(r.rolcreatedb, false);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tableowner=current_user",
          )
        ).rows[0].n,
        0,
      );
      for (const role of [
        'selleros_test_migration',
        'selleros_test_policy',
        'selleros_test_bootstrap_writer',
      ])
        await denied(() => pool.query(`SET ROLE ${role}`));
    }
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('app_users','organizations','organization_members') AND relrowsecurity AND relforcerowsecurity",
        )
      ).rows[0].n,
      3,
    );
  });
  await test('SQL direto e view invocadora: leitura/listagem/agregação limitada ao tenant', async () => {
    await transaction('api', 'a', orgA, async (c) => {
      assert.deepEqual(
        (await c.query('SELECT id FROM organizations')).rows.map((r) => r.id),
        [orgA],
      );
      assert.equal(
        (await c.query('SELECT count(*)::int AS n FROM isolation_proof.visible_records')).rows[0].n,
        1,
      );
      assert.equal((await c.query('SELECT * FROM app_users')).rows.length, 1);
      assert.equal(
        (
          await c.query('SELECT * FROM isolation_proof.visible_records WHERE organization_id=$1', [
            orgB,
          ])
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await c.query(
            'SELECT count(*)::int AS n FROM organizations o JOIN organization_members m ON m.organization_id=o.id',
          )
        ).rows[0].n,
        4,
      );
    });
  });
  await test('Prisma real: findMany/include/count e escrita cruzada isoladas', async () => {
    await prisma.$transaction(async (tx) => {
      await prismaContext(tx, 'a', orgA);
      const rows = await tx.organization.findMany({ include: { members: true } });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, orgA);
      assert.equal(rows[0].members.length, 4);
      assert.equal(await tx.organization.count(), 1);
      assert.equal(
        (await tx.organization.updateMany({ where: { id: orgB }, data: { name: 'Não alterar' } }))
          .count,
        0,
      );
    });
    await assert.rejects(() =>
      prisma.$transaction(async (tx) => {
        await prismaContext(tx, 'a', orgA);
        await tx.organizationMember.create({
          data: { organizationId: orgB, userId: ids.viewer, role: 'viewer', status: 'active' },
        });
      }),
    );
  });
  await test('SQL escrita cruzada e FK composta rejeitados pelo banco', async () => {
    await denied(() =>
      transaction('api', 'a', orgA, (c) =>
        c.query('INSERT INTO isolation_proof.records VALUES($1,$2,$3,$4)', [
          randomUUID(),
          orgB,
          ids.b,
          'intruso',
        ]),
      ),
    );
    await denied(
      () =>
        transaction('api', 'a', orgA, (c) =>
          c.query('INSERT INTO isolation_proof.records VALUES($1,$2,$3,$4)', [
            randomUUID(),
            orgA,
            ids.b,
            'FK cruzada',
          ]),
        ),
      ['23503'],
    );
    await transaction('api', 'a', orgA, async (c) => {
      assert.equal(
        (
          await c.query('UPDATE isolation_proof.records SET label=$1 WHERE id=$2', [
            'intruso',
            recordB,
          ])
        ).rowCount,
        0,
      );
      assert.equal(
        (await c.query('DELETE FROM isolation_proof.records WHERE id=$1', [recordB])).rowCount,
        0,
      );
    });
    await denied(() =>
      transaction('api', 'a', orgA, (c) =>
        c.query('UPDATE isolation_proof.records SET organization_id=$1 WHERE id=$2', [
          orgB,
          recordA,
        ]),
      ),
    );
  });
  await test('sem contexto, vazio, UUID inválido, sujeito inválido e ator de sistema falsificado: falha fechada', async () => {
    assert.equal((await pools.api.query('SELECT * FROM organizations')).rowCount, 0);
    assert.equal((await prisma.organization.findMany()).length, 0);
    for (const [subject, org, actor] of [
      ['a', '', 'user'],
      ['a', 'not-a-uuid', 'user'],
      ['missing', orgA, 'user'],
      ['a', orgB, 'user'],
      ['a', orgA, 'system'],
    ]) {
      const c = await pools.api.connect();
      try {
        await c.query('BEGIN');
        await context(c, subject, org, actor);
        assert.equal((await c.query('SELECT * FROM organizations')).rowCount, 0);
        await denied(() =>
          c.query('INSERT INTO isolation_proof.records VALUES($1,$2,$3,$4)', [
            randomUUID(),
            orgA,
            ids.a,
            'deny',
          ]),
        );
      } finally {
        await c.query('ROLLBACK');
        c.release();
      }
    }
  });
  await test('membership inativo, viewer e organização suspensa', async () => {
    assert.equal(
      await transaction(
        'api',
        'inactive',
        orgA,
        async (c) => (await c.query('SELECT * FROM organizations')).rowCount,
      ),
      0,
    );
    assert.equal(
      await transaction(
        'api',
        'viewer',
        orgA,
        async (c) =>
          (await c.query('UPDATE organizations SET name=$1 WHERE id=$2', ['deny', orgA])).rowCount,
      ),
      0,
    );
    await admin.query("UPDATE organizations SET status='suspended' WHERE id=$1", [orgB]);
    try {
      assert.equal(
        await transaction(
          'api',
          'b',
          orgB,
          async (c) => (await c.query('SELECT * FROM organizations')).rowCount,
        ),
        0,
      );
    } finally {
      await admin.query("UPDATE organizations SET status='active' WHERE id=$1", [orgB]);
    }
  });
  await test('mesma conexão SQL após commit e rollback não conserva contexto', async () => {
    const pid1 = await transaction(
      'api',
      'a',
      orgA,
      async (c) => (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,
    );
    assert.equal((await pools.api.query('SELECT * FROM organizations')).rowCount, 0);
    await assert.rejects(() =>
      transaction('api', 'a', orgA, () => {
        throw new Error('rollback proposital');
      }),
    );
    assert.equal((await pools.api.query('SELECT * FROM organizations')).rowCount, 0);
    const pid2 = await transaction('api', 'b', orgB, async (c) => {
      assert.deepEqual(
        (await c.query('SELECT id FROM organizations')).rows.map((r) => r.id),
        [orgB],
      );
      return (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    });
    assert.equal(pid1, pid2);
  });
  await test('Prisma pool de uma conexão: commit, rollback e timeout sem vazamento', async () => {
    let pid;
    await prisma.$transaction(async (tx) => {
      await prismaContext(tx, 'a', orgA);
      pid = (await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid;
    });
    assert.equal(await prisma.organization.count(), 0);
    await assert.rejects(() =>
      prisma.$transaction(async (tx) => {
        await prismaContext(tx, 'a', orgA);
        throw new Error('rollback');
      }),
    );
    assert.equal(await prisma.organization.count(), 0);
    await assert.rejects(() =>
      prisma.$transaction(async (tx) => {
        await prismaContext(tx, 'a', orgA);
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='40ms'");
        await tx.$queryRaw`SELECT pg_sleep(0.2)`;
      }),
    );
    assert.equal(await prisma.organization.count(), 0);
    await prisma.$transaction(async (tx) => {
      await prismaContext(tx, 'b', orgB);
      assert.equal((await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid, pid);
      assert.equal((await tx.organization.findMany())[0].id, orgB);
    });
  });
  await test('concorrência em duas conexões Prisma mantém escopos separados', async () => {
    const other = new PrismaClient({
      adapter: new PrismaPg({ connectionString: roleConfig('api').connectionString, max: 1 }),
      log: [],
    });
    let arrived = 0,
      release;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    try {
      const results = await Promise.all(
        [
          [prisma, 'a', orgA],
          [other, 'b', orgB],
        ].map(([db, user, org]) =>
          db.$transaction(async (tx) => {
            await prismaContext(tx, user, org);
            if (++arrived === 2) release();
            await barrier;
            return (await tx.organization.findMany()).map((o) => o.id);
          }),
        ),
      );
      assert.deepEqual(results, [[orgA], [orgB]]);
    } finally {
      await other.$disconnect();
    }
  });
  await test('proteção do último owner e concorrência de duas desativações', async () => {
    await denied(
      () =>
        transaction('api', 'b', orgB, (c) =>
          c.query(
            "UPDATE organization_members SET status='inactive' WHERE organization_id=$1 AND user_id=$2",
            [orgB, ids.b],
          ),
        ),
      ['23514'],
    );
    const secondPool = new pg.Pool({
      connectionString: roleConfig('api').connectionString,
      max: 1,
    });
    const one = await pools.api.connect(),
      two = await secondPool.connect();
    try {
      await one.query('BEGIN');
      await two.query('BEGIN');
      await context(one, 'a', orgA);
      await context(two, 'second', orgA);
      await one.query(
        "UPDATE organization_members SET status='inactive' WHERE organization_id=$1 AND user_id=$2",
        [orgA, ids.a],
      );
      const pending = two.query(
        "UPDATE organization_members SET status='inactive' WHERE organization_id=$1 AND user_id=$2",
        [orgA, ids.second],
      );
      await one.query('COMMIT');
      await pending;
      await denied(() => two.query('COMMIT'), ['23514']);
      assert.equal(
        (
          await admin.query(
            "SELECT count(*)::int AS n FROM organization_members WHERE organization_id=$1 AND role='owner' AND status='active'",
            [orgA],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await one.query('ROLLBACK');
      await two.query('ROLLBACK');
      one.release();
      two.release();
      await secondPool.end();
      await admin.query(
        "UPDATE organization_members SET status='active' WHERE organization_id=$1 AND user_id=$2",
        [orgA, ids.a],
      );
    }
  });
  await test('bootstrap restrito: rollback não deixa organização órfã', async () => {
    const before = (await admin.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n;
    await assert.rejects(() =>
      transaction('bootstrap', 'a', null, async (c) => {
        await c.query("SELECT selleros.bootstrap_organization('Rollback')");
        throw new Error('rollback');
      }),
    );
    assert.equal(
      (await admin.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n,
      before,
    );
    await denied(() =>
      transaction('bootstrap', 'missing', null, (c) =>
        c.query("SELECT selleros.bootstrap_organization('Sem sujeito')"),
      ),
    );
    await denied(() =>
      transaction('api', 'a', orgA, (c) =>
        c.query("SELECT selleros.bootstrap_organization('Sem privilégio')"),
      ),
    );
    await denied(() =>
      transaction('bootstrap', 'a', null, (c) =>
        c.query("INSERT INTO organizations(name,status) VALUES('direto','active')"),
      ),
    );
    await denied(
      () =>
        transaction('bootstrap', 'a', null, (c) =>
          c.query('SELECT selleros.bootstrap_organization($1,$2)', [orgB, 'tentar existente']),
        ),
      ['42883'],
    );
    await denied(() =>
      transaction('bootstrap', 'a', null, (c) => c.query('SELECT * FROM app_users')),
    );
  });
  await test('worker: apenas fixture de trabalho persistido e tenant correto', async () => {
    const c = await pools.worker.connect();
    try {
      await c.query('BEGIN');
      await context(c, '', orgA, 'system');
      assert.equal((await c.query('SELECT * FROM isolation_proof.records')).rowCount, 0);
      await c.query(
        "SELECT set_config('selleros.job_id',$1,true),set_config('selleros.job_token',$2,true)",
        [jobA, tokenA],
      );
      assert.equal((await c.query('SELECT * FROM isolation_proof.visible_records')).rowCount, 1);
      assert.equal(
        (
          await c.query('UPDATE isolation_proof.records SET label=$1 WHERE id=$2', [
            'worker',
            recordB,
          ])
        ).rowCount,
        0,
      );
      await c.query("SELECT set_config('selleros.job_token','invalid',true)");
      assert.equal((await c.query('SELECT * FROM isolation_proof.records')).rowCount, 0);
      await c.query("SELECT set_config('selleros.job_token',$1,true)", [tokenA]);
      await c.query("SELECT set_config('selleros.organization_id',$1,true)", [orgB]);
      assert.equal((await c.query('SELECT * FROM isolation_proof.records')).rowCount, 0);
      await c.query('ROLLBACK');
      await denied(() => c.query('SELECT * FROM organization_members'));
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
    await transaction('api', 'a', orgA, async (c) => {
      await c.query(
        "SELECT set_config('selleros.actor','system',true),set_config('selleros.job_id',$1,true),set_config('selleros.job_token',$2,true)",
        [jobA, tokenA],
      );
      assert.equal((await c.query('SELECT * FROM isolation_proof.records')).rowCount, 0);
    });
  });
  await test('privilégios mínimos, identidade imutável e checks de perfil/timezone', async () => {
    for (const sql of [
      'TRUNCATE organizations',
      'ALTER TABLE organizations DISABLE ROW LEVEL SECURITY',
      'CREATE TABLE public.not_allowed(id int)',
      'DELETE FROM app_users',
      'SELECT * FROM isolation_proof.jobs',
    ])
      await denied(() => pools.api.query(sql));
    await denied(() =>
      transaction('api', 'a', orgA, (c) =>
        c.query('UPDATE organizations SET id=$1 WHERE id=$2', [randomUUID(), orgA]),
      ),
    );
    await denied(
      () =>
        transaction('api', 'a', orgA, (c) =>
          c.query("UPDATE organizations SET timezone='invalid/zone' WHERE id=$1", [orgA]),
        ),
      ['23514'],
    );
    await denied(
      () =>
        admin.query(
          "INSERT INTO app_users(auth_issuer,auth_subject,status) VALUES(NULL,NULL,'active')",
        ),
      ['23514'],
    );
    await denied(() => pools.maintenance.query('SELECT * FROM organizations'));
    await denied(
      () => admin.query("INSERT INTO organizations(name,status) VALUES('Órfã','active')"),
      ['23514'],
    );
  });
} finally {
  await prisma.$disconnect();
  for (const pool of Object.values(pools)) await pool.end();
  // Cleanup is targeted to this run, only after identity preflight on the disposable test instance.
  if (fixtureCreated) await migration.query('DROP SCHEMA isolation_proof CASCADE');
  await admin.query('BEGIN');
  for (const org of [orgA, orgB].filter(Boolean)) {
    await admin.query("UPDATE organizations SET status='pending_deletion' WHERE id=$1", [org]);
    await admin.query('DELETE FROM organization_members WHERE organization_id=$1', [org]);
    await admin.query('DELETE FROM organizations WHERE id=$1', [org]);
  }
  await admin.query('DELETE FROM app_users WHERE auth_issuer=$1', [issuer]);
  await admin.query('COMMIT');
  await migration.end();
  await admin.end();
}
