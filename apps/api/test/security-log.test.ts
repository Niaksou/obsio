import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { provisionOrganisation } from '../src/organisations/provision.js';
import { buildTestApp, resetDatabase } from './helpers.js';

const ctx = await buildTestApp();
const lines: Record<string, unknown>[] = [];
const logStream = new Writable({
  write(chunk, _encoding, done) {
    for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line));
    done();
  },
});
const app = await buildApp({ ...ctx, logStream });
afterAll(async () => {
  await app.close();
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase();
  lines.length = 0;
});

const events = () => lines.filter((line) => line.securite === true);
const post = (url: string, payload: object) =>
  app.inject({ method: 'POST', url, headers: { origin: ctx.config.WEB_URL }, payload });

describe('journal des événements de sécurité', () => {
  it('trace une connexion refusée, sans le mot de passe', async () => {
    await post('/api/auth/sign-in/email', { email: 'eve@exemple.fr', password: 'devine-moi-2026' });
    expect(events()).toContainEqual(
      expect.objectContaining({
        evenement: 'authentification',
        action: 'connexion',
        resultat: 'echec',
        email: 'eve@exemple.fr',
      }),
    );
    expect(JSON.stringify(lines)).not.toContain('devine-moi-2026');
  });

  it('trace une inscription réussie', async () => {
    await provisionOrganisation(ctx, { name: 'Usine', adminEmail: 'alice@exemple.fr' });
    const response = await post('/api/auth/sign-up/email', {
      name: 'Alice',
      email: 'alice@exemple.fr',
      password: 'cheval-agrafe-batterie-42',
    });
    expect(response.statusCode).toBe(200);
    expect(events()).toContainEqual(
      expect.objectContaining({ action: 'inscription', resultat: 'reussite' }),
    );
  });

  it('trace un accès refusé et un lien intervenant invalide, sans le jeton', async () => {
    await app.inject({ method: 'GET', url: '/api/sites' });
    const token = randomBytes(32).toString('base64url');
    await app.inject({ method: 'GET', url: `/api/intervention/${token}` });
    expect(events()).toContainEqual(
      expect.objectContaining({ evenement: 'acces-refuse', statut: 401, url: '/api/sites' }),
    );
    expect(events()).toContainEqual(
      expect.objectContaining({
        evenement: 'lien-intervention-refuse',
        url: '/api/intervention/[masqué]',
      }),
    );
    expect(JSON.stringify(lines)).not.toContain(token);
  });

  it('trace une requête refusée par la validation', async () => {
    // Fastify valide les paramètres avant les gardes : la requête est refusée dès la validation.
    await app.inject({ method: 'GET', url: '/api/sites/pas-un-uuid' });
    expect(events()).toContainEqual(
      expect.objectContaining({ evenement: 'validation-refusee', statut: 400 }),
    );
  });
});
