import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readConfig } from './config.js';

const apps: ReturnType<typeof buildApp>[] = [];
function setup() {
  const app = buildApp(readConfig({ LOG_LEVEL: 'silent', CORS_ORIGINS: 'http://localhost:5173' }));
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe('API foundation', () => {
  it('boots without database or Redis and returns the health contract', async () => {
    const app = setup();
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'selleros-api' });
    expect(response.headers['content-type']).toContain('application/json');
  });
  it('generates its own correlation ID', async () => {
    const response = await setup().inject({
      url: '/health',
      headers: { 'x-request-id': 'untrusted-input' },
    });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('allows the configured browser origin', async () => {
    const response = await setup().inject({
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  it('does not authorize another browser origin', async () => {
    const response = await setup().inject({
      url: '/health',
      headers: { origin: 'https://unknown.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('handles CORS preflight', async () => {
    const response = await setup().inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  it('standardizes 404 responses without reflecting the URL', async () => {
    const response = await setup().inject('/missing?token=secret-fixture');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Rota não encontrada.',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.body).not.toContain('secret-fixture');
  });
  it('does not expose internal errors', async () => {
    const app = setup();
    app.get('/test-error', () => {
      throw new Error('password=secret-fixture');
    });
    const response = await app.inject('/test-error');
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('secret-fixture');
    expect(response.body).not.toContain('stack');
  });
  it('standardizes input validation errors', async () => {
    const app = setup();
    app.get(
      '/test-validation',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['count'],
            properties: { count: { type: 'integer' } },
          },
        },
      },
      async () => ({}),
    );
    const response = await app.inject('/test-validation?count=secret-fixture');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(response.body).not.toContain('secret-fixture');
  });
  it('rejects invalid environment and wildcard origins', () => {
    expect(() => readConfig({ API_PORT: 'invalid' })).toThrow('API_PORT');
    expect(() => readConfig({ CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
    expect(() => readConfig({ CORS_ORIGINS: 'http://localhost:5173/path' })).toThrow(
      'CORS_ORIGINS',
    );
  });
});
