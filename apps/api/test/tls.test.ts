import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { get as httpsGet, type RequestOptions } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { buildTestApp } from './helpers.js';

// HTTPS entre le proxy et l'API (ASVS 12.3.3). Certificat créé pour le test : aucune clé dans
// le dépôt.
const dir = mkdtempSync(join(tmpdir(), 'obsio-tls-'));
execFileSync('openssl', [
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-subj',
  '/CN=localhost',
  '-days',
  '1',
  '-addext',
  'subjectAltName=DNS:localhost,IP:127.0.0.1',
  '-keyout',
  join(dir, 'key.pem'),
  '-out',
  join(dir, 'cert.pem'),
]);
const cert = readFileSync(join(dir, 'cert.pem'));
const key = readFileSync(join(dir, 'key.pem'));

const ctx = await buildTestApp();
const app = await buildApp({ ...ctx, tls: { cert, key } });
await app.listen({ port: 0, host: '127.0.0.1' });
const { port } = app.server.address() as AddressInfo;

afterAll(async () => {
  await app.close();
  await ctx.close();
});

function status(get: typeof httpsGet, options: RequestOptions) {
  return new Promise<number>((resolve, reject) => {
    get(options, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    }).on('error', reject);
  });
}

describe('API en HTTPS', () => {
  it('répond en HTTPS avec son certificat, vérifié par le client', async () => {
    expect(await status(httpsGet, { host: 'localhost', port, path: '/health', ca: cert })).toBe(
      200,
    );
  });

  it('refuse un client qui ne fait pas confiance au certificat, et le HTTP en clair', async () => {
    await expect(status(httpsGet, { host: 'localhost', port, path: '/health' })).rejects.toThrow();
    await expect(
      status(httpGet as typeof httpsGet, { host: 'localhost', port, path: '/health' }),
    ).rejects.toThrow();
  });
});

describe('configuration', () => {
  const base = { ...process.env, NODE_ENV: 'production', CLAMAV_HOST: undefined };

  it('exige un antivirus en production, par TCP ou par socket Unix', () => {
    expect(() => loadConfig(base)).toThrow(/CLAMAV_SOCKET/);
    expect(loadConfig({ ...base, CLAMAV_SOCKET: '/run/clamav/clamd.sock' }).CLAMAV_SOCKET).toBe(
      '/run/clamav/clamd.sock',
    );
  });

  it('refuse un certificat sans sa clé', () => {
    expect(() =>
      loadConfig({ ...base, CLAMAV_SOCKET: '/s', TLS_CERT_FILE: join(dir, 'cert.pem') }),
    ).toThrow(/TLS_KEY_FILE/);
  });
});
