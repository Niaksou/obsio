import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { logSerializers, redactUrl } from '../src/logging.js';

describe('jetons masqués dans les journaux', () => {
  it.each([
    ['/api/intervention/abc123', '/api/intervention/[masqué]'],
    ['/api/intervention/abc123/photos', '/api/intervention/[masqué]/photos'],
    [
      '/api/auth/reset-password/xyz?callbackURL=/a',
      '/api/auth/reset-password/[masqué]?callbackURL=/a',
    ],
    [
      '/api/auth/verify-email?token=xyz&callbackURL=/',
      '/api/auth/verify-email?token=[masqué]&callbackURL=/',
    ],
    ['/api/sites/42', '/api/sites/42'],
  ])('%s', (url, expected) => {
    expect(redactUrl(url)).toBe(expected);
  });

  it('le journal des requêtes de Fastify ne contient pas le jeton', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const app = Fastify({ logger: { stream, serializers: logSerializers } });
    app.get('/api/intervention/:token', async () => ({ ok: true }));
    await app.inject({ method: 'GET', url: '/api/intervention/jeton-secret' });
    await app.close();
    const log = lines.join('');
    expect(log).toContain('/api/intervention/[masqué]');
    expect(log).not.toContain('jeton-secret');
  });
});
