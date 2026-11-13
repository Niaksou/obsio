import { expect } from 'vitest';
import { TestClient, type buildTestApp } from './helpers.js';
import { SoftAuthenticator } from './webauthn.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Ajoute une clé d'accès au compte connecté, puis ouvre une session avec elle. */
export async function passkeySession(ctx: TestApp, client: TestClient) {
  const web = new URL(ctx.config.WEB_URL);
  const authenticator = new SoftAuthenticator(web.hostname, web.origin, true);
  const options = await client.get('/api/auth/passkey/generate-register-options');
  await client.post('/api/auth/passkey/verify-registration', {
    response: authenticator.register(options.json()),
    name: 'Portable',
  });
  const device = new TestClient(ctx);
  const login = await device.get('/api/auth/passkey/generate-authenticate-options');
  const verified = await device.post('/api/auth/passkey/verify-authentication', {
    response: authenticator.authenticate(login.json()),
  });
  expect(verified.statusCode).toBe(200);
  return device;
}
