import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { forbiddenWord } from '../src/auth/password-policy.js';
import { provisionOrganisation } from '../src/organisations/provision.js';
import { buildTestApp, resetDatabase } from './helpers.js';

const ctx = await buildTestApp();
afterAll(() => ctx.close());
beforeEach(() => resetDatabase());
afterEach(() => vi.restoreAllMocks());

describe('mots interdits dans un mot de passe', () => {
  it.each([
    ['Obsio-2026-tres-long', 'obsio'],
    ['Électricité-du-site-42', 'electricite'],
    ['cheval-agrafe-batterie-42', null],
  ])('%s', (password, expected) => {
    expect(forbiddenWord(password)).toBe(expected);
  });

  it("refuse le nom et l'adresse de l'utilisateur", () => {
    expect(forbiddenWord('dupont-et-fils-2026', ['jean.dupont@exemple.fr'])).toBeNull();
    expect(forbiddenWord('jeandupont-2026!', ['jeandupont@exemple.fr'])).toBe('jeandupont');
    expect(forbiddenWord('vive-martine-2026', [undefined, 'Martine Durand'])).toBe('martine');
  });
});

async function signUp(app: Awaited<ReturnType<typeof buildApp>>, email: string, password: string) {
  await provisionOrganisation(ctx, { name: 'Usine', adminEmail: email });
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: ctx.config.WEB_URL },
    payload: { name: 'Alice', email, password },
  });
}

describe("à l'inscription", () => {
  it('refuse un mot de passe qui contient un mot interdit', async () => {
    const response = await signUp(ctx.app, 'alice@exemple.fr', 'Obsio-tres-long-2026');
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('obsio');
  });

  it('refuse un mot de passe divulgué, sans envoyer plus que le début de son empreinte', async () => {
    const password = 'cheval-agrafe-batterie-42';
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith('https://api.pwnedpasswords.com/')) return realFetch(input, init);
      calls.push(url);
      return new Response(`${sha1.slice(5)}:42\r\n0000000000000000000000000000000000A:1`);
    });
    const app = await buildApp({ ...ctx, config: { ...ctx.config, PASSWORD_BREACH_CHECK: true } });
    try {
      const response = await signUp(app, 'bob@exemple.fr', password);
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('fuites de données');
      expect(calls).toEqual([`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`]);
    } finally {
      await app.close();
    }
  });
});
