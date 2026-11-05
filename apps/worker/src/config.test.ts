import { expect, it } from 'vitest';
import { readConfig } from './config.js';
it('accepts a local Redis URL', () => {
  expect(readConfig({ REDIS_URL: 'redis://localhost:6379' }).REDIS_URL).toBe(
    'redis://localhost:6379',
  );
});
it('rejects missing or incompatible Redis configuration without exposing values', () => {
  expect(() => readConfig({})).toThrow('REDIS_URL');
  expect(() => readConfig({ REDIS_URL: 'https://secret-fixture.example' })).toThrow(
    'Configuração inválida',
  );
  try {
    readConfig({ REDIS_URL: 'secret-fixture' });
  } catch (error) {
    expect(String(error)).not.toContain('secret-fixture');
  }
});
