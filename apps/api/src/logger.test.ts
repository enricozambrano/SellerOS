import { Writable } from 'node:stream';
import pino from 'pino';
import { expect, it } from 'vitest';
import { loggerOptions } from './logger.js';
it('omits secrets from structured request, response and error logs', () => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = pino(loggerOptions('info'), stream);
  logger.info(
    {
      req: {
        method: 'GET',
        url: '/?token=secret-fixture',
        headers: { authorization: 'secret-fixture' },
        body: { password: 'secret-fixture' },
      },
      res: { statusCode: 500, headers: { 'set-cookie': 'secret-fixture' } },
      err: new Error('secret-fixture'),
      token: 'secret-fixture',
      DATABASE_URL: 'secret-fixture',
    },
    'Controlled message',
  );
  expect(output).not.toContain('secret-fixture');
  expect(JSON.parse(output)).toMatchObject({
    service: 'selleros-api',
    req: { method: 'GET' },
    res: { statusCode: 500 },
  });
});
