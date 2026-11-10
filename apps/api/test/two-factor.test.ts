import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  clientHelpers,
  resetDatabase,
  TEST_PASSWORD,
  TestClient,
  totp,
} from './helpers.js';
import { resetTwoFactor } from '../src/auth/reset-two-factor.js';
import { twoFactor } from '../src/db/schema/index.js';
import { provisionOrganisation } from '../src/organisations/provision.js';

const ctx = await buildTestApp();
const { openClient } = clientHelpers(ctx);
afterAll(() => ctx.close());

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
});

describe('Double authentification obligatoire', () => {
  it("bloque l'application tant qu'elle n'est pas activée", async () => {
    const { invitation } = await provisionOrganisation(ctx, {
      name: 'Usine',
      adminEmail: 'alice@example.org',
    });
    const alice = new TestClient(ctx);
    await alice.signUpAndVerify('Alice', 'alice@example.org', { twoFactor: false });

    expect((await alice.get('/api/auth/get-session')).json().user.twoFactorEnabled).toBe(false);
    expect((await alice.get('/api/me')).statusCode).toBe(403);
    const accept = await alice.post('/api/auth/organization/accept-invitation', {
      invitationId: invitation.id,
    });
    expect(accept.statusCode).toBe(403);
    expect(accept.json().code).toBe('TWO_FACTOR_REQUIRED');

    await alice.enableTwoFactor();
    expect(alice.backupCodes).toHaveLength(10);
    expect((await alice.get('/api/me')).statusCode).toBe(200);
    const retry = await alice.post('/api/auth/organization/accept-invitation', {
      invitationId: invitation.id,
    });
    expect(retry.statusCode).toBe(200);
  });

  it('demande un code à la connexion, et un code ne sert qu’une fois', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const secret = admin.twoFactorSecret!;

    const browser = new TestClient(ctx);
    const signIn = await browser.post('/api/auth/sign-in/email', {
      email: 'alice@example.org',
      password: TEST_PASSWORD,
    });
    expect(signIn.json()).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
    // Mot de passe seul : aucune session.
    expect((await browser.get('/api/me')).statusCode).toBe(401);

    const wrong = await browser.post('/api/auth/two-factor/verify-totp', { code: '000000' });
    expect(wrong.statusCode).toBe(401);
    const code = totp(secret, 1);
    expect((await browser.post('/api/auth/two-factor/verify-totp', { code })).statusCode).toBe(200);
    expect((await browser.get('/api/me')).statusCode).toBe(200);

    // Le même code, rejoué sur une autre connexion, est refusé.
    const thief = new TestClient(ctx);
    await thief.post('/api/auth/sign-in/email', {
      email: 'alice@example.org',
      password: TEST_PASSWORD,
    });
    const replay = await thief.post('/api/auth/two-factor/verify-totp', { code });
    expect(replay.statusCode).toBe(401);
    expect((await thief.get('/api/me')).statusCode).toBe(401);
  });

  it('un code de secours remplace le code, une seule fois', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const backupCode = admin.backupCodes[0]!;
    const useBackupCode = async () => {
      const browser = new TestClient(ctx);
      await browser.post('/api/auth/sign-in/email', {
        email: 'alice@example.org',
        password: TEST_PASSWORD,
      });
      return browser.post('/api/auth/two-factor/verify-backup-code', { code: backupCode });
    };
    expect((await useBackupCode()).statusCode).toBe(200);
    expect((await useBackupCode()).statusCode).toBe(401);
  });

  it('codes de secours de 120 bits, stockés hachés, saisis sans tenir compte de la casse', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    expect(admin.backupCodes[0]).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    const [row] = await ctx.db.select({ codes: twoFactor.backupCodes }).from(twoFactor);
    const stored = JSON.parse(row!.codes) as string[];
    expect(stored).toHaveLength(10);
    expect(stored.every((value) => /^[0-9a-f]{64}$/.test(value))).toBe(true);
    expect(row!.codes).not.toContain(admin.backupCodes[0]);

    const browser = new TestClient(ctx);
    await browser.post('/api/auth/sign-in/email', {
      email: 'alice@example.org',
      password: TEST_PASSWORD,
    });
    const typed = admin.backupCodes[1]!.toLowerCase().replaceAll('-', ' ');
    const used = await browser.post('/api/auth/two-factor/verify-backup-code', { code: typed });
    expect(used.statusCode).toBe(200);
    const [after] = await ctx.db.select({ codes: twoFactor.backupCodes }).from(twoFactor);
    expect(JSON.parse(after!.codes)).toHaveLength(9);
  });

  it('ne peut être ni désactivée, ni contournée par un appareil de confiance', async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const disable = await admin.post('/api/auth/two-factor/disable', { password: TEST_PASSWORD });
    expect(disable.statusCode).toBe(403);
    expect(disable.json().code).toBe('TWO_FACTOR_MANDATORY');

    const browser = new TestClient(ctx);
    await browser.post('/api/auth/sign-in/email', {
      email: 'alice@example.org',
      password: TEST_PASSWORD,
    });
    const trusted = await browser.post('/api/auth/two-factor/verify-totp', {
      code: totp(admin.twoFactorSecret!, 1),
      trustDevice: true,
    });
    expect(trusted.statusCode).toBe(400);
    expect(trusted.json().code).toBe('TRUST_DEVICE_DISABLED');
  });

  it("l'éditeur réinitialise la double authentification d'un compte", async () => {
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    expect(await resetTwoFactor(ctx.db, 'Alice@Example.org')).toMatchObject({ name: 'Alice' });
    expect(await resetTwoFactor(ctx.db, 'inconnu@example.org')).toBeNull();
    // Sessions fermées ; à la connexion suivante, mot de passe seul puis nouvelle configuration.
    expect((await admin.get('/api/me')).statusCode).toBe(401);
    const browser = new TestClient(ctx);
    const signIn = await browser.post('/api/auth/sign-in/email', {
      email: 'alice@example.org',
      password: TEST_PASSWORD,
    });
    expect(signIn.json().twoFactorRedirect).toBeUndefined();
    expect((await browser.get('/api/me')).statusCode).toBe(403);
    await browser.enableTwoFactor();
    expect((await browser.get('/api/me')).statusCode).toBe(200);
  });
});
