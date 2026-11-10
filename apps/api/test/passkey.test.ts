import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetTwoFactor } from '../src/auth/reset-two-factor.js';
import { passkey } from '../src/db/schema/index.js';
import { provisionOrganisation } from '../src/organisations/provision.js';
import { buildTestApp, clientHelpers, resetDatabase, TestClient } from './helpers.js';
import { SoftAuthenticator } from './webauthn.js';

const ctx = await buildTestApp();
const { openClient } = clientHelpers(ctx);
afterAll(() => ctx.close());

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
});

const web = new URL(ctx.config.WEB_URL);
const newAuthenticator = (userVerified = true) =>
  new SoftAuthenticator(web.hostname, web.origin, userVerified);

async function register(client: TestClient, authenticator: SoftAuthenticator) {
  const options = await client.get('/api/auth/passkey/generate-register-options');
  if (options.statusCode !== 200) return options;
  return client.post('/api/auth/passkey/verify-registration', {
    response: authenticator.register(options.json()),
    name: 'iPhone',
  });
}

async function signInWithPasskey(client: TestClient, authenticator: SoftAuthenticator) {
  const options = await client.get('/api/auth/passkey/generate-authenticate-options');
  expect(options.statusCode).toBe(200);
  return client.post('/api/auth/passkey/verify-authentication', {
    response: authenticator.authenticate(options.json()),
  });
}

describe('Connexion par passkey', () => {
  it('demande la vérification de l’utilisateur, sur le domaine du front', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const options = (await admin.get('/api/auth/passkey/generate-register-options')).json();
    expect(options.rp).toEqual({ id: web.hostname, name: 'Obsio' });
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    });
  });

  it('se connecte sans mot de passe ni code une fois la passkey ajoutée', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const authenticator = newAuthenticator();
    expect((await register(admin, authenticator)).statusCode).toBe(200);

    const phone = new TestClient(ctx);
    expect((await phone.get('/api/me')).statusCode).toBe(401);
    expect((await signInWithPasskey(phone, authenticator)).statusCode).toBe(200);
    const me = await phone.get('/api/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('alice@example.org');
  });

  it('refuse une passkey sans vérification de l’utilisateur', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const unverified = newAuthenticator(false);
    const refused = await register(admin, unverified);
    expect(refused.statusCode).toBe(401);
    expect(refused.json().code).toBe('PASSKEY_USER_VERIFICATION_REQUIRED');

    const authenticator = newAuthenticator();
    expect((await register(admin, authenticator)).statusCode).toBe(200);
    authenticator.userVerified = false;
    const phone = new TestClient(ctx);
    const signIn = await signInWithPasskey(phone, authenticator);
    expect(signIn.statusCode).toBe(401);
    expect((await phone.get('/api/me')).statusCode).toBe(401);
  });

  it('ne s’ajoute pas avant la double authentification', async () => {
    await provisionOrganisation(ctx, { name: 'Usine', adminEmail: 'alice@example.org' });
    const alice = new TestClient(ctx);
    await alice.signUpAndVerify('Alice', 'alice@example.org', { twoFactor: false });
    const refused = await register(alice, newAuthenticator());
    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('TWO_FACTOR_REQUIRED');

    const anonymous = await register(new TestClient(ctx), newAuthenticator());
    expect(anonymous.statusCode).toBe(401);
  });

  it('refuse la passkey d’un autre site (origine différente)', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const phishing = new SoftAuthenticator(web.hostname, 'https://obsio-connexion.example', true);
    expect((await register(admin, phishing)).statusCode).toBeGreaterThanOrEqual(400);
  });

  it('la réinitialisation de la double authentification retire les passkeys', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const authenticator = newAuthenticator();
    await register(admin, authenticator);
    await resetTwoFactor(ctx.db, 'alice@example.org');
    expect(await ctx.db.select().from(passkey).where(eq(passkey.name, 'iPhone'))).toEqual([]);
    expect((await signInWithPasskey(new TestClient(ctx), authenticator)).statusCode).toBe(401);
  });
});
