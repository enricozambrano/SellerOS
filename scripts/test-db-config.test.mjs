import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTestConfig } from './test-db-config.mjs';

const config = {
  TEST_POSTGRES_DB: 'selleros_integration_test',
  TEST_POSTGRES_USER: 'selleros_integration_test',
  TEST_POSTGRES_PASSWORD: 'test-fixture-only-abcdefghijklmnopqrstuvwxyz',
  TEST_POSTGRES_PORT: '55432',
};
test('test connection is loopback only and encodes passwords', () => {
  const result = validateTestConfig({
    ...config,
    TEST_POSTGRES_PASSWORD: `${config.TEST_POSTGRES_PASSWORD}@:/#`,
  });
  const url = new URL(result.connectionString);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(decodeURIComponent(url.password), `${config.TEST_POSTGRES_PASSWORD}@:/#`);
});
for (const [name, change] of Object.entries({
  'development database': { TEST_POSTGRES_DB: 'selleros' },
  'development user': { TEST_POSTGRES_USER: 'selleros_local' },
  'development port': { TEST_POSTGRES_PORT: '5432' },
  'missing password': { TEST_POSTGRES_PASSWORD: '' },
  'invalid port': { TEST_POSTGRES_PORT: '55432/other' },
}))
  test(`rejects ${name}`, () => assert.throws(() => validateTestConfig({ ...config, ...change })));
test('rejects collision with configured development port', () => {
  assert.throws(() => validateTestConfig(config, { POSTGRES_PORT: '55432' }));
});
test('rejects collision hidden in development URL', () => {
  assert.throws(() =>
    validateTestConfig(config, { DATABASE_URL: 'postgresql://dev:fake@localhost:55432/dev' }),
  );
  assert.throws(() =>
    validateTestConfig(config, {
      DATABASE_URL: 'postgresql://dev:fake@localhost:5432/selleros_integration_test',
    }),
  );
});
test('rejects identical development credentials', () => {
  assert.throws(() =>
    validateTestConfig(config, { POSTGRES_PASSWORD: config.TEST_POSTGRES_PASSWORD }),
  );
});
test('rejects malformed development URL without leaking it', () => {
  assert.throws(() => validateTestConfig(config, { DATABASE_URL: 'secret-value' }), {
    message: 'DATABASE_URL de desenvolvimento inválida; isolamento não comprovado.',
  });
});
